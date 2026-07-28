import { executeFirstRevenueStageApi } from "./kairos-first-revenue-stage-api-v1.js";

export const KAIROS_FIRST_REVENUE_LIVE_DISPATCHER_BUILD = "kairos-first-revenue-live-dispatcher-20260728-1";

export async function dispatchFirstRevenueLiveRequest(request = {}, context = {}) {
  const method = String(request.method || "GET").toUpperCase();
  const url = new URL(request.url || "https://kairos.invalid/");
  const match = url.pathname.match(/^\/api\/kairos\/revenue\/first-runs\/([^/]+)(?:\/(execute-next|status))?$/);
  if (!match) return null;

  const runId = decodeURIComponent(match[1]);
  const action = match[2] || "status";
  const authorization = request.headers?.get?.("Authorization") || "";
  const operatorEmail = request.headers?.get?.("CF-Access-Authenticated-User-Email") || "";
  const operatorIdentityHash = request.headers?.get?.("X-Kairos-Operator-Identity") || "";

  if (!authorization || !operatorEmail) return json({ error: { code: "KAIROS_OPERATOR_AUTH_REQUIRED", message: "Authenticated operator access is required." } }, 401);

  if (method === "GET" && action === "status") {
    const run = await context.firstRevenueStore?.getFirstRevenueRun?.(runId);
    if (!run) return json({ error: { code: "FIRST_REVENUE_RUN_NOT_FOUND", message: "First revenue run was not found." } }, 404);
    const product = await context.revenueStore?.getRevenueProduct?.(run.revenueProductId);
    return json({ run, product, automaticPublicationAllowed: false, build: KAIROS_FIRST_REVENUE_LIVE_DISPATCHER_BUILD });
  }

  if (method === "POST" && action === "execute-next") {
    const input = await request.json().catch(() => ({}));
    const result = await executeFirstRevenueStageApi({
      runId,
      input: { ...input, authorization, operatorEmail, operatorIdentityHash },
      firstRevenueStore: context.firstRevenueStore,
      revenueStore: context.revenueStore,
      env: context.env || {},
    });
    return json({ ...result, automaticPublicationAllowed: false, build: KAIROS_FIRST_REVENUE_LIVE_DISPATCHER_BUILD }, 200);
  }

  return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Unsupported first revenue run operation." } }, 405);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Kairos-Build": KAIROS_FIRST_REVENUE_LIVE_DISPATCHER_BUILD } });
}
