import {
  runMMGDeliveryWindowController,
  type MMGDeliveryWindowControllerDependencies,
} from "./delivery-window-service.js";

export interface MMGDeliveryWindowHttpDependencies {
  controller: MMGDeliveryWindowControllerDependencies;
  authorize(request: Request): Promise<boolean>;
}

type ControllerPayload =
  | { action: "tick"; runId: string }
  | {
      action: "mark_delivered";
      windowId: string;
      deliveryReference: string;
    }
  | {
      action: "reopen_recovery";
      windowId: string;
      reviewWindowHours: number;
    };

const MAX_BODY_BYTES = 16_384;

const headers = (): Headers =>
  new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });

const response = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers: headers() });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (
  value: unknown,
  code: string,
  maximum = 256,
): string => {
  if (typeof value !== "string") throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(code);
  return normalized;
};

const parsePayload = (value: unknown): ControllerPayload => {
  if (!isRecord(value)) {
    throw new Error("MMG_DELIVERY_WINDOW_HTTP_INVALID_PAYLOAD");
  }

  const action = value.action;
  if (action === "tick") {
    return {
      action,
      runId: requiredString(
        value.runId,
        "MMG_DELIVERY_WINDOW_HTTP_RUN_ID_REQUIRED",
        128,
      ),
    };
  }

  if (action === "mark_delivered") {
    return {
      action,
      windowId: requiredString(
        value.windowId,
        "MMG_DELIVERY_WINDOW_HTTP_WINDOW_ID_REQUIRED",
        160,
      ),
      deliveryReference: requiredString(
        value.deliveryReference,
        "MMG_DELIVERY_WINDOW_HTTP_DELIVERY_REFERENCE_REQUIRED",
        256,
      ),
    };
  }

  if (action === "reopen_recovery") {
    const reviewWindowHours = value.reviewWindowHours;
    if (
      typeof reviewWindowHours !== "number" ||
      !Number.isInteger(reviewWindowHours) ||
      reviewWindowHours < 24 ||
      reviewWindowHours > 48
    ) {
      throw new Error("MMG_DELIVERY_WINDOW_HTTP_REVIEW_HOURS_INVALID");
    }
    return {
      action,
      windowId: requiredString(
        value.windowId,
        "MMG_DELIVERY_WINDOW_HTTP_WINDOW_ID_REQUIRED",
        160,
      ),
      reviewWindowHours,
    };
  }

  throw new Error("MMG_DELIVERY_WINDOW_HTTP_ACTION_INVALID");
};

const parseJsonBody = async (request: Request): Promise<unknown> => {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new Error("MMG_DELIVERY_WINDOW_HTTP_BODY_TOO_LARGE");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new Error("MMG_DELIVERY_WINDOW_HTTP_BODY_TOO_LARGE");
  }
  if (!text.trim()) {
    throw new Error("MMG_DELIVERY_WINDOW_HTTP_BODY_REQUIRED");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("MMG_DELIVERY_WINDOW_HTTP_JSON_INVALID");
  }
};

export const handleMMGDeliveryWindowControllerRequest = async (
  request: Request,
  dependencies: MMGDeliveryWindowHttpDependencies,
): Promise<Response> => {
  if (request.method !== "POST") {
    const notAllowed = response(405, {
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." },
    });
    notAllowed.headers.set("Allow", "POST");
    return notAllowed;
  }

  if (!(await dependencies.authorize(request))) {
    return response(401, {
      ok: false,
      error: {
        code: "DELIVERY_WINDOW_CONTROLLER_UNAUTHORIZED",
        message: "Internal controller authorization is required.",
      },
    });
  }

  let payload: ControllerPayload;
  try {
    payload = parsePayload(await parseJsonBody(request));
  } catch (error) {
    return response(400, {
      ok: false,
      error: {
        code: error instanceof Error ? error.message : "INVALID_REQUEST",
        message: "The delivery-window controller request is invalid.",
      },
    });
  }

  try {
    if (payload.action === "tick") {
      const summary = await runMMGDeliveryWindowController(
        payload.runId,
        dependencies.controller,
      );
      return response(200, { ok: true, summary });
    }

    if (payload.action === "mark_delivered") {
      const result =
        await dependencies.controller.repository.markDelivered({
          windowId: payload.windowId,
          deliveryReference: payload.deliveryReference,
          occurredAt: dependencies.controller.now(),
        });
      return response(result === "not_found" ? 404 : 200, {
        ok: result !== "not_found",
        result,
      });
    }

    const result =
      await dependencies.controller.repository.reopenRecoveryWindow({
        windowId: payload.windowId,
        reviewWindowHours: payload.reviewWindowHours,
        occurredAt: dependencies.controller.now(),
      });
    return response(result === "not_found" ? 404 : result === "invalid_state" ? 409 : 200, {
      ok: result === "opened",
      result,
    });
  } catch (error) {
    return response(500, {
      ok: false,
      error: {
        code: "DELIVERY_WINDOW_CONTROLLER_FAILED",
        message: error instanceof Error ? error.message : "Unexpected controller failure.",
      },
    });
  }
};
