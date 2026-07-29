import { routeProductionRevenueAction } from "./kairos-production-revenue-router-v1.js";
import { projectProductionRevenueReadiness } from "./kairos-production-readiness-v1.js";

export const KAIROS_PRODUCTION_REVENUE_ENTRYPOINT_BUILD = "kairos-production-revenue-entrypoint-20260728-1";

export async function handleProductionRevenueRequest(context = {}, request = {}) {
  const url = new URL(request.url || "https://kairos.invalid/");
  const match = url.pathname.match(/^\/api\/kairos\/revenue\/([^/]+)$/);
  if (!match) return null;

  const action = decodeURIComponent(match[1]);
  const operator = await context.authenticateOperator?.(request);
  if (!operator?.authorization || !operator?.email || !operator?.identityHash) {
    return json({ error: "KAIROS_OPERATOR_AUTH_REQUIRED", message: "Authenticated operator identity is required." }, 401);
  }

  const body = request.method === "GET" ? {} : await readJson(request);
  try {
    if (action === "readiness") {
      const product = await context.revenueStore?.getRevenueProduct?.(body.revenueProductId || url.searchParams.get("revenueProductId"));
      const readiness = projectProductionRevenueReadiness(context.env || {}, product || {});
      return json({ readiness, automaticPublicationAllowed: false }, 200, readinessHeaders());
    }

    const routed = await routeProductionRevenueAction(context.handlers || {}, {
      ...body,
      action,
      method: request.method,
      authorization: operator.authorization,
      operatorEmail: operator.email,
      operatorIdentityHash: operator.identityHash,
    });
    return json(routed, 200, routed.headers);
  } catch (error) {
    return json({
      error: error.code || "KAIROS_REVENUE_RUNTIME_ERROR",
      message: error.message || "Production revenue action failed.",
      automaticPublicationAllowed: false,
    }, error.status || 500, readinessHeaders());
  }
}

function readinessHeaders() {
  return {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-kairos-automatic-publication": "disabled",
    "x-kairos-production-revenue-entrypoint-build": KAIROS_PRODUCTION_REVENUE_ENTRYPOINT_BUILD,
  };
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function json(payload, status, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { ...readinessHeaders(), ...headers } });
}
