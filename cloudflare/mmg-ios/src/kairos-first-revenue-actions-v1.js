import { bootstrapFirstRevenueRun, recoverFirstRevenueRun } from "./kairos-first-revenue-bootstrap-v1.js";
import { createRevenueAssetReviewLinks } from "./kairos-revenue-review-links-v1.js";
import { executeFirstRevenueStageApi } from "./kairos-first-revenue-stage-api-v1.js";

export const KAIROS_FIRST_REVENUE_ACTIONS_BUILD = "kairos-first-revenue-actions-20260728-1";

export async function dispatchFirstRevenueAction(request = {}, context = {}) {
  const method = String(request.method || "GET").toUpperCase();
  const url = new URL(request.url || "https://kairos.invalid/");
  const match = url.pathname.match(/^\/api\/kairos\/revenue\/first-runs(?:\/([^/]+))?\/(bootstrap|recover|execute-next|review-links)$/);
  if (!match) return null;
  const runId = match[1] ? decodeURIComponent(match[1]) : null;
  const action = match[2];
  const authorization = request.headers?.get?.("Authorization") || "";
  const operatorEmail = request.headers?.get?.("CF-Access-Authenticated-User-Email") || "";
  const operatorIdentityHash = request.headers?.get?.("X-Kairos-Operator-Identity") || "";
  if (!authorization || !operatorEmail || !operatorIdentityHash) return json({ error: { code: "KAIROS_OPERATOR_AUTH_REQUIRED", message: "Authenticated operator identity is required." } }, 401);
  if (method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Revenue mutations require POST." } }, 405);
  const input = await request.json().catch(() => ({}));
  const stores = { firstRevenueStore: context.firstRevenueStore, revenueStore: context.revenueStore };
  if (action === "bootstrap") return json(await bootstrapFirstRevenueRun(stores, { ...input, operatorIdentityHash }), 200);
  if (action === "recover") return json(await recoverFirstRevenueRun(stores, { ...input, runId, operatorIdentityHash }), 200);
  if (action === "execute-next") return json(await executeFirstRevenueStageApi({ runId, input: { ...input, authorization, operatorEmail, operatorIdentityHash }, firstRevenueStore: context.firstRevenueStore, revenueStore: context.revenueStore, env: context.env || {} }), 200);
  const run = await context.firstRevenueStore?.getFirstRevenueRun?.(runId);
  if (!run) return json({ error: { code: "FIRST_REVENUE_RUN_NOT_FOUND", message: "First revenue run was not found." } }, 404);
  const product = await context.revenueStore?.getRevenueProduct?.(run.revenueProductId);
  return json(await createRevenueAssetReviewLinks(product, { ...input, operatorIdentityHash }, context.env || {}), 200);
}

function json(body, status = 200) {
  return new Response(JSON.stringify({ ...body, automaticPublicationAllowed: false, build: KAIROS_FIRST_REVENUE_ACTIONS_BUILD }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Kairos-Automatic-Publication": "disabled" } });
}
