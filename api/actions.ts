import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyDashboardCors } from "./cors.js";
import {
  buildCompletedAction,
  buildHomepageAuditQuery,
  parseApprovedActionRequest,
  parseHomepageAuditEvidence,
  requireShopifyConfiguration,
  shopifyGraphQLEndpoint,
} from "./actions-core.js";
import {
  KairosHttpError,
  authorizeRequest,
  errorEnvelope,
  requireRuntimeEnvironment,
} from "./kairos-core.js";
import { readCookie, SESSION_COOKIE_NAME, verifyOperatorSession } from "./session-core.js";

const SHOPIFY_TIMEOUT_MS = 20_000;

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (applyDashboardCors(request, response)) return;

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    const error = new KairosHttpError(405, "method_not_allowed", "Use POST for Kairos actions.");
    response.status(error.statusCode).json(errorEnvelope(error));
    return;
  }

  try {
    const runtime = requireRuntimeEnvironment(process.env);
    const cookieToken = readCookie(firstHeaderValue(request.headers.cookie), SESSION_COOKIE_NAME);
    const session = verifyOperatorSession(cookieToken, runtime.KAIROS_RUNTIME_TOKEN);
    if (!session) authorizeRequest(firstHeaderValue(request.headers.authorization), runtime.KAIROS_RUNTIME_TOKEN);

    parseApprovedActionRequest(request.body);
    const shopify = requireShopifyConfiguration(process.env);
    const startedAt = new Date();

    const shopifyResponse = await fetch(shopifyGraphQLEndpoint(shopify), {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": shopify.accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(buildHomepageAuditQuery()),
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
    });

    const body = await readJSON(shopifyResponse);
    if (!shopifyResponse.ok) {
      throw new KairosHttpError(502, "shopify_request_failed", "Shopify could not complete the homepage audit.");
    }

    const evidence = parseHomepageAuditEvidence(body);
    response.status(200).json({
      ...buildCompletedAction(evidence, startedAt),
      executionContext: {
        authorizationMode: session ? "session" : "gateway-recovery",
        operator: session?.operator,
        sessionId: session?.sessionId ?? "gateway-recovery",
      },
    });
  } catch (caught) {
    const error = normalizeError(caught);
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
  if (caught instanceof Error && caught.name === "TimeoutError") {
    return new KairosHttpError(504, "shopify_timeout", "Shopify took too long to respond.");
  }
  return new KairosHttpError(500, "action_execution_failed", "Kairos could not execute the approved action.");
}
