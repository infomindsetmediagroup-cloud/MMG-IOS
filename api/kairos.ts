import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { applyDashboardCors } from "./cors.js";
import {
  KairosHttpError,
  authorizeRequest,
  buildOpenAIRequestBody,
  errorEnvelope,
  extractResponseText,
  parseRuntimeRequest,
  requireRuntimeEnvironment,
} from "./kairos-core.js";
import { readCookie, SESSION_COOKIE_NAME, verifyOperatorSession } from "./session-core.js";
import { inspectStorefront, isStorefrontAuditObjective } from "./storefront-inspection-core.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const PROVIDER_TIMEOUT_MS = 45_000;

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (applyDashboardCors(request, response)) return;

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    const error = new KairosHttpError(405, "method_not_allowed", "Use POST for the Kairos runtime.");
    response.status(error.statusCode).json(errorEnvelope(error));
    return;
  }

  try {
    const environment = requireRuntimeEnvironment(process.env);
    const cookieToken = readCookie(firstHeaderValue(request.headers.cookie), SESSION_COOKIE_NAME);
    const session = verifyOperatorSession(cookieToken, environment.KAIROS_RUNTIME_TOKEN);
    const authorizationMode = session ? "session" : "gateway-recovery";
    if (!session) authorizeRequest(firstHeaderValue(request.headers.authorization), environment.KAIROS_RUNTIME_TOKEN);

    const runtimeRequest = parseRuntimeRequest(request.body);
    const storefrontInspection = isStorefrontAuditObjective(runtimeRequest.objective)
      ? await inspectStorefront(40)
      : undefined;
    const requestID = randomUUID();
    const auditID = randomUUID();

    const providerResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${environment.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Client-Request-Id": requestID,
      },
      body: JSON.stringify(buildOpenAIRequestBody(runtimeRequest, environment.OPENAI_MODEL, storefrontInspection)),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });

    const providerBody: unknown = await readJSON(providerResponse);
    if (!providerResponse.ok) {
      console.error("Kairos provider request failed", { requestID, statusCode: providerResponse.status });
      throw new KairosHttpError(
        providerResponse.status === 429 ? 429 : 502,
        providerResponse.status === 429 ? "rate_limited" : "provider_error",
        providerResponse.status === 429
          ? "Kairos is handling too many requests. Try again shortly."
          : "Kairos could not complete the provider request.",
        requestID,
      );
    }

    const message = extractResponseText(providerBody);
    response.status(200).json({
      message,
      department: runtimeRequest.department,
      requestId: requestID,
      auditId: auditID,
      inspection: storefrontInspection ? {
        auditId: storefrontInspection.auditId,
        source: storefrontInspection.source,
        inspectedCount: storefrontInspection.inspectedCount,
        discoveredCount: storefrontInspection.discoveredCount,
      } : undefined,
      executionContext: {
        authorizationMode,
        subject: session?.sub ?? "internal-recovery",
        tenantId: session?.tenantId ?? "mmg-internal",
        role: session?.role ?? "executive",
        operator: session?.operator,
        sessionId: session?.sessionId ?? "gateway-recovery",
      },
    });
  } catch (caught) {
    const error = normalizeError(caught);
    if (error.statusCode >= 500) {
      console.error("Kairos runtime failure", { requestID: error.requestID, code: error.code });
    }
    response.status(error.statusCode).json(errorEnvelope(error));
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function readJSON(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function normalizeError(caught: unknown): KairosHttpError {
  if (caught instanceof KairosHttpError) return caught;
  if (caught instanceof DOMException && caught.name === "TimeoutError") {
    return new KairosHttpError(504, "provider_timeout", "Kairos took too long to respond.");
  }
  if (caught instanceof Error && caught.name === "TimeoutError") {
    return new KairosHttpError(504, "provider_timeout", "Kairos took too long to respond.");
  }
  return new KairosHttpError(500, "internal_error", "Kairos encountered an internal error.");
}
