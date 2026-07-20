import type { MMGMyLibraryRepository } from "./my-library-repository.js";
import {
  createMMGMyLibraryAccess,
  getMMGMyLibrary,
  type MMGMyLibraryPrincipal,
  type MMGMyLibraryStorageGateway,
} from "./my-library-service.js";

export interface MMGMyLibraryHttpDependencies {
  repository: MMGMyLibraryRepository;
  storageGateway: MMGMyLibraryStorageGateway;
  authenticate(request: Request): Promise<MMGMyLibraryPrincipal | null>;
  validateSameOrigin(request: Request): boolean;
  validateCsrf(
    request: Request,
    principal: MMGMyLibraryPrincipal,
  ): Promise<boolean>;
  now(): Date;
  accessTtlSeconds?: number;
}

const MAX_BODY_BYTES = 4096;

const responseHeaders = (): Headers =>
  new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });

const failure = (
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  allow?: string,
): Response => {
  const headers = responseHeaders();
  if (allow) headers.set("Allow", allow);
  return new Response(
    JSON.stringify({ ok: false, error: { code, message, retryable } }),
    { status, headers },
  );
};

const authenticatedPrincipal = async (
  request: Request,
  dependencies: MMGMyLibraryHttpDependencies,
): Promise<MMGMyLibraryPrincipal | Response> => {
  const principal = await dependencies.authenticate(request);
  if (!principal) {
    return failure(
      401,
      "MY_LIBRARY_AUTHENTICATION_REQUIRED",
      "Sign in through the Customer Portal to open My Library.",
      false,
    );
  }
  return principal;
};

export const handleMMGMyLibraryRequest = async (
  request: Request,
  dependencies: MMGMyLibraryHttpDependencies,
): Promise<Response> => {
  if (request.method !== "GET") {
    return failure(
      405,
      "MY_LIBRARY_METHOD_NOT_ALLOWED",
      "Only GET is supported by the My Library endpoint.",
      false,
      "GET",
    );
  }

  try {
    const principal = await authenticatedPrincipal(request, dependencies);
    if (principal instanceof Response) return principal;

    const result = await getMMGMyLibrary({
      repository: dependencies.repository,
      principal,
      asOf: dependencies.now(),
    });

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: responseHeaders(),
    });
  } catch {
    return failure(
      500,
      "MY_LIBRARY_INTERNAL_ERROR",
      "My Library could not be loaded.",
      true,
    );
  }
};

const parseAccessBody = async (
  request: Request,
): Promise<{ requestId: string; assetId: string; kind: string } | null> => {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (
    typeof value.requestId !== "string" ||
    typeof value.assetId !== "string" ||
    typeof value.kind !== "string"
  ) {
    return null;
  }

  return {
    requestId: value.requestId,
    assetId: value.assetId,
    kind: value.kind,
  };
};

export const handleMMGMyLibraryAccessRequest = async (
  request: Request,
  dependencies: MMGMyLibraryHttpDependencies,
): Promise<Response> => {
  if (request.method !== "POST") {
    return failure(
      405,
      "MY_LIBRARY_ACCESS_METHOD_NOT_ALLOWED",
      "Only POST is supported by the secure library access endpoint.",
      false,
      "POST",
    );
  }

  try {
    const principal = await authenticatedPrincipal(request, dependencies);
    if (principal instanceof Response) return principal;

    if (!dependencies.validateSameOrigin(request)) {
      return failure(
        403,
        "MY_LIBRARY_ORIGIN_REJECTED",
        "The secure library request did not originate from the Customer Portal.",
        false,
      );
    }

    if (!(await dependencies.validateCsrf(request, principal))) {
      return failure(
        403,
        "MY_LIBRARY_CSRF_REJECTED",
        "The secure library session could not be verified.",
        false,
      );
    }

    const body = await parseAccessBody(request);
    if (!body) {
      return failure(
        400,
        "MY_LIBRARY_INVALID_ACCESS_REQUEST",
        "The requested library action is incomplete.",
        false,
      );
    }

    const result = await createMMGMyLibraryAccess({
      repository: dependencies.repository,
      storageGateway: dependencies.storageGateway,
      principal,
      request: body,
      now: dependencies.now(),
      accessTtlSeconds: dependencies.accessTtlSeconds,
    });

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: responseHeaders(),
    });
  } catch {
    return failure(
      500,
      "MY_LIBRARY_ACCESS_INTERNAL_ERROR",
      "Secure file access could not be prepared.",
      true,
    );
  }
};
