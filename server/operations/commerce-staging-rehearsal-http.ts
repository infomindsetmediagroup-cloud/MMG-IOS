import {
  runMMGCommerceStagingRehearsal,
  type MMGCommerceRehearsalRepository,
  type MMGCommerceStagingRehearsalGateway,
} from "./commerce-staging-rehearsal.js";

export interface MMGCommerceRehearsalPrincipal {
  actorId: string;
  roles: string[];
}

export interface MMGCommerceRehearsalAuthenticator {
  authenticate(request: Request): Promise<MMGCommerceRehearsalPrincipal | null>;
}

export interface MMGCommerceStagingRehearsalHTTPDependencies {
  authenticator: MMGCommerceRehearsalAuthenticator;
  gateway: MMGCommerceStagingRehearsalGateway;
  repository: MMGCommerceRehearsalRepository;
  allowedOrigins: ReadonlySet<string>;
  now(): Date;
}

const MAX_BODY_BYTES = 16 * 1024;

const json = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });

const readPayload = async (request: Request): Promise<Record<string, unknown>> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("MMG_REHEARSAL_CONTENT_TYPE_INVALID");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new Error("MMG_REHEARSAL_BODY_TOO_LARGE");
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("MMG_REHEARSAL_JSON_INVALID");
  }
};

export const handleMMGCommerceStagingRehearsalRequest = async (
  request: Request,
  dependencies: MMGCommerceStagingRehearsalHTTPDependencies,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  }
  try {
    if (!request.headers.get("x-mmg-internal-request")) {
      throw new Error("MMG_REHEARSAL_INTERNAL_MARKER_REQUIRED");
    }
    const origin = request.headers.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin)) {
      throw new Error("MMG_REHEARSAL_ORIGIN_FORBIDDEN");
    }
    const principal = await dependencies.authenticator.authenticate(request);
    if (!principal) throw new Error("MMG_REHEARSAL_AUTH_REQUIRED");
    if (!principal.roles.includes("mmg-commerce-rehearsal-operator")) {
      throw new Error("MMG_REHEARSAL_OPERATOR_ROLE_REQUIRED");
    }
    const payload = await readPayload(request);
    if (String(payload.environment ?? "") !== "staging") {
      throw new Error("MMG_REHEARSAL_STAGING_ONLY");
    }
    if (payload.publicationAllowed === true || payload.liveCustomerDataAllowed === true) {
      throw new Error("MMG_REHEARSAL_SAFETY_CONTRACT_VIOLATION");
    }
    const evidence = await runMMGCommerceStagingRehearsal({
      runId: String(payload.runId ?? ""),
      releaseId: String(payload.releaseId ?? ""),
      gateway: dependencies.gateway,
      repository: dependencies.repository,
      now: dependencies.now,
    });
    return json({ ok: true, status: "passed", evidence });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "MMG_REHEARSAL_FAILED";
    const status = code.includes("AUTH") || code.includes("ROLE") || code.includes("ORIGIN")
      ? 403
      : code.includes("BODY_TOO_LARGE")
        ? 413
        : code.includes("COLLISION") || code.includes("CHECK_FAILED")
          ? 409
          : 400;
    return json(
      {
        ok: false,
        status: "failed",
        error: {
          code,
          message: "The controlled staging commerce rehearsal could not be completed.",
        },
      },
      status,
    );
  }
};
