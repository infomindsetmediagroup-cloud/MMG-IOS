import {
  executePickerCommand,
  getPickerSnapshot,
  parsePickerCommandPayload,
  validatePickerRequestSecurity,
  type MMGPickerPrincipal,
  type MMGPickerServiceResponse,
  type MMGPickerStateRepository,
} from "./picker-service.js";

export interface MMGPickerHttpDependencies {
  repository: MMGPickerStateRepository;
  authenticate(request: Request): Promise<MMGPickerPrincipal | null>;
  expectedOrigin(request: Request): string;
  getCsrfSessionToken(
    request: Request,
    principal: MMGPickerPrincipal,
  ): Promise<string | null>;
  issueCsrfToken(
    request: Request,
    principal: MMGPickerPrincipal,
  ): Promise<string>;
  now(): Date;
}

const MAX_JSON_BYTES = 16_384;

const jsonResponse = (
  serviceResponse: MMGPickerServiceResponse,
  options: {
    csrfToken?: string;
    allow?: string;
  } = {},
): Response => {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    Vary: "Cookie, Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  });

  if (options.csrfToken) {
    headers.set("X-MMG-CSRF-Token", options.csrfToken);
  }
  if (options.allow) headers.set("Allow", options.allow);

  return new Response(JSON.stringify(serviceResponse.body), {
    status: serviceResponse.status,
    headers,
  });
};

const failure = (
  status: number,
  code: string,
  message: string,
  retryable = false,
  options: { allow?: string } = {},
): Response =>
  jsonResponse(
    {
      status,
      body: {
        ok: false,
        error: { code, message, retryable },
      },
    },
    options,
  );

const parseErrorResponse = (error: unknown): Response => {
  const code = error instanceof Error ? error.message : "PICKER_INVALID_REQUEST";
  const securityCodes = new Set([
    "PICKER_ORIGIN_REQUIRED",
    "PICKER_ORIGIN_MISMATCH",
    "PICKER_CSRF_INVALID",
  ]);

  if (securityCodes.has(code)) {
    return failure(
      403,
      code,
      "The secure title-selection request could not be verified.",
      false,
    );
  }

  return failure(
    400,
    code.startsWith("PICKER_") ? code : "PICKER_INVALID_REQUEST",
    "The title-selection request was invalid.",
    false,
  );
};

const authenticate = async (
  request: Request,
  dependencies: MMGPickerHttpDependencies,
): Promise<MMGPickerPrincipal | Response> => {
  const principal = await dependencies.authenticate(request);
  if (!principal) {
    return failure(
      401,
      "PICKER_AUTHENTICATION_REQUIRED",
      "Sign in through the Customer Portal to manage subscription titles.",
      false,
    );
  }
  return principal;
};

const handleGet = async (
  request: Request,
  dependencies: MMGPickerHttpDependencies,
): Promise<Response> => {
  const principal = await authenticate(request, dependencies);
  if (principal instanceof Response) return principal;

  const [serviceResponse, csrfToken] = await Promise.all([
    getPickerSnapshot(dependencies.repository, principal),
    dependencies.issueCsrfToken(request, principal),
  ]);

  return jsonResponse(serviceResponse, { csrfToken });
};

const handlePost = async (
  request: Request,
  dependencies: MMGPickerHttpDependencies,
): Promise<Response> => {
  const principal = await authenticate(request, dependencies);
  if (principal instanceof Response) return principal;

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    return failure(
      413,
      "PICKER_PAYLOAD_TOO_LARGE",
      "The title-selection request was too large.",
      false,
    );
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return failure(
      415,
      "PICKER_JSON_REQUIRED",
      "Title-selection mutations require JSON.",
      false,
    );
  }

  try {
    validatePickerRequestSecurity({
      requestOrigin: request.headers.get("origin"),
      expectedOrigin: dependencies.expectedOrigin(request),
      csrfHeaderToken: request.headers.get("x-mmg-csrf-token"),
      csrfSessionToken: await dependencies.getCsrfSessionToken(
        request,
        principal,
      ),
    });

    const payload = parsePickerCommandPayload(await request.json());
    const serviceResponse = await executePickerCommand(
      dependencies.repository,
      principal,
      payload,
      dependencies.now(),
    );
    const csrfToken = await dependencies.issueCsrfToken(request, principal);

    return jsonResponse(serviceResponse, { csrfToken });
  } catch (error) {
    return parseErrorResponse(error);
  }
};

export const handleKnowledgeLibraryPickerRequest = async (
  request: Request,
  dependencies: MMGPickerHttpDependencies,
): Promise<Response> => {
  try {
    if (request.method === "GET") {
      return await handleGet(request, dependencies);
    }
    if (request.method === "POST") {
      return await handlePost(request, dependencies);
    }

    return failure(
      405,
      "PICKER_METHOD_NOT_ALLOWED",
      "Only GET and POST are supported by the title-selection endpoint.",
      false,
      { allow: "GET, POST" },
    );
  } catch {
    return failure(
      500,
      "PICKER_INTERNAL_ERROR",
      "The title-selection service encountered an unexpected error.",
      true,
    );
  }
};
