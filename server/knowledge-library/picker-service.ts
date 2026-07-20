import {
  applyPickerCommand,
  buildPickerSnapshot,
  MMGPickerCommandError,
  type MMGPickerCommand,
  type MMGPickerCommandAction,
  type MMGPickerCommandResult,
  type MMGPickerSnapshot,
  type MMGPickerState,
} from "./picker.js";

export interface MMGPickerPrincipal {
  customerId: string;
  sessionId: string;
}

export interface MMGPickerStateRepository {
  load(principal: MMGPickerPrincipal): Promise<MMGPickerState | null>;
  save(
    principal: MMGPickerPrincipal,
    state: MMGPickerState,
    expectedPreviousVersion: number,
  ): Promise<"saved" | "version_conflict">;
}

export interface MMGPickerRequestSecurityContext {
  requestOrigin: string | null;
  expectedOrigin: string;
  csrfHeaderToken: string | null;
  csrfSessionToken: string | null;
}

export interface MMGPickerCommandPayload {
  action: MMGPickerCommandAction;
  assetId?: string;
  requestId: string;
  expectedWindowVersion: number;
}

export interface MMGPickerServiceResponse {
  status: number;
  body:
    | {
        ok: true;
        snapshot: MMGPickerSnapshot;
        mutation?: {
          action: MMGPickerCommandAction;
          changed: boolean;
          idempotentReplay: boolean;
        };
      }
    | {
        ok: false;
        error: {
          code: string;
          message: string;
          retryable: boolean;
        };
        snapshot?: MMGPickerSnapshot;
      };
}

const actionValues = new Set<MMGPickerCommandAction>([
  "select",
  "remove",
  "confirm",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeOrigin = (value: string): string => {
  const url = new URL(value);
  return url.origin;
};

export const validatePickerRequestSecurity = (
  context: MMGPickerRequestSecurityContext,
): void => {
  if (!context.requestOrigin) {
    throw new Error("PICKER_ORIGIN_REQUIRED");
  }

  if (
    normalizeOrigin(context.requestOrigin) !== normalizeOrigin(context.expectedOrigin)
  ) {
    throw new Error("PICKER_ORIGIN_MISMATCH");
  }

  if (
    !context.csrfHeaderToken ||
    !context.csrfSessionToken ||
    context.csrfHeaderToken !== context.csrfSessionToken
  ) {
    throw new Error("PICKER_CSRF_INVALID");
  }
};

export const parsePickerCommandPayload = (
  input: unknown,
): MMGPickerCommandPayload => {
  if (!isRecord(input)) throw new Error("PICKER_INVALID_PAYLOAD");

  const forbiddenIdentityFields = [
    "customerId",
    "customer_id",
    "subscriptionId",
    "subscription_id",
    "windowId",
    "window_id",
  ];
  if (forbiddenIdentityFields.some((field) => field in input)) {
    throw new Error("PICKER_CLIENT_IDENTITY_FORBIDDEN");
  }

  const action = input.action;
  const requestId = input.requestId;
  const expectedWindowVersion = input.expectedWindowVersion;
  const assetId = input.assetId;

  if (typeof action !== "string" || !actionValues.has(action as MMGPickerCommandAction)) {
    throw new Error("PICKER_INVALID_ACTION");
  }
  if (
    typeof requestId !== "string" ||
    requestId.trim().length < 8 ||
    requestId.trim().length > 128
  ) {
    throw new Error("PICKER_INVALID_REQUEST_ID");
  }
  if (
    typeof expectedWindowVersion !== "number" ||
    !Number.isInteger(expectedWindowVersion) ||
    expectedWindowVersion < 0
  ) {
    throw new Error("PICKER_INVALID_WINDOW_VERSION");
  }
  if (
    action !== "confirm" &&
    (typeof assetId !== "string" ||
      assetId.trim().length === 0 ||
      assetId.trim().length > 160)
  ) {
    throw new Error("PICKER_INVALID_ASSET_ID");
  }
  if (action === "confirm" && assetId !== undefined) {
    throw new Error("PICKER_CONFIRM_ASSET_ID_FORBIDDEN");
  }

  return {
    action: action as MMGPickerCommandAction,
    requestId: requestId.trim(),
    expectedWindowVersion,
    ...(typeof assetId === "string" ? { assetId: assetId.trim() } : {}),
  };
};

const missingStateResponse = (): MMGPickerServiceResponse => ({
  status: 404,
  body: {
    ok: false,
    error: {
      code: "PICKER_WINDOW_NOT_FOUND",
      message: "No active Knowledge Library selection window is available.",
      retryable: false,
    },
  },
});

export const getPickerSnapshot = async (
  repository: MMGPickerStateRepository,
  principal: MMGPickerPrincipal,
): Promise<MMGPickerServiceResponse> => {
  const state = await repository.load(principal);
  if (!state) return missingStateResponse();

  return {
    status: 200,
    body: {
      ok: true,
      snapshot: buildPickerSnapshot(state),
    },
  };
};

export const executePickerCommand = async (
  repository: MMGPickerStateRepository,
  principal: MMGPickerPrincipal,
  payload: MMGPickerCommandPayload,
  now: Date,
): Promise<MMGPickerServiceResponse> => {
  const state = await repository.load(principal);
  if (!state) return missingStateResponse();

  const command: MMGPickerCommand = {
    ...payload,
    occurredAt: now.toISOString(),
  };

  let result: MMGPickerCommandResult;
  try {
    result = applyPickerCommand(state, command);
  } catch (error) {
    if (error instanceof MMGPickerCommandError) {
      return {
        status: error.status,
        body: {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            retryable: ["WINDOW_VERSION_CONFLICT"].includes(error.code),
          },
          snapshot: error.snapshot,
        },
      };
    }
    throw error;
  }

  if (result.changed) {
    const saveResult = await repository.save(
      principal,
      result.state,
      state.window.version,
    );

    if (saveResult === "version_conflict") {
      const currentState = await repository.load(principal);
      return {
        status: 409,
        body: {
          ok: false,
          error: {
            code: "WINDOW_VERSION_CONFLICT",
            message:
              "The selection window changed while your request was being saved. Review the refreshed selection before continuing.",
            retryable: true,
          },
          ...(currentState
            ? { snapshot: buildPickerSnapshot(currentState) }
            : {}),
        },
      };
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      snapshot: result.snapshot,
      mutation: {
        action: result.action,
        changed: result.changed,
        idempotentReplay: result.idempotentReplay,
      },
    },
  };
};
