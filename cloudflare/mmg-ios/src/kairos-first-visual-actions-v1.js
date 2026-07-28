import { executeFirstVisualBatch } from "./kairos-first-visual-batch-v1.js";
import { recordFirstVisualReview } from "./kairos-first-visual-review-v1.js";
import { projectFirstVisualReviewGate } from "./kairos-first-visual-review-gate-v1.js";

export const KAIROS_FIRST_VISUAL_ACTIONS_BUILD = "kairos-first-visual-actions-20260728-1";

export async function dispatchFirstVisualAction(request = {}, context = {}) {
  const url = new URL(request.url || "https://kairos.invalid/");
  const match = url.pathname.match(/^\/api\/kairos\/revenue\/products\/([^/]+)\/visual\/(execute|review|gate)$/);
  if (!match) return null;
  if (String(request.method || "GET").toUpperCase() !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Visual actions require POST." } }, 405);

  const authorization = request.headers?.get?.("Authorization") || "";
  const operatorEmail = request.headers?.get?.("CF-Access-Authenticated-User-Email") || "";
  const operatorIdentityHash = request.headers?.get?.("X-Kairos-Operator-Identity") || "";
  if (!authorization || !operatorEmail || !operatorIdentityHash) return json({ error: { code: "KAIROS_OPERATOR_AUTH_REQUIRED", message: "Authenticated operator identity is required." } }, 401);

  const revenueProductId = decodeURIComponent(match[1]);
  const action = match[2];
  const input = await request.json().catch(() => ({}));
  if (action === "execute") return json(await executeFirstVisualBatch(context, { ...input, revenueProductId, authorization, operatorEmail, operatorIdentityHash }));
  if (action === "review") return json(await recordFirstVisualReview(context, { ...input, revenueProductId, authorization, operatorEmail, operatorIdentityHash }));
  const product = await context.revenueStore?.getRevenueProduct?.(revenueProductId);
  if (!product) return json({ error: { code: "REVENUE_PRODUCT_NOT_FOUND", message: "Revenue product was not found." } }, 404);
  return json(projectFirstVisualReviewGate(product));
}

function json(body, status = 200) {
  return new Response(JSON.stringify({ ...body, automaticPublicationAllowed: false, build: KAIROS_FIRST_VISUAL_ACTIONS_BUILD }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Kairos-Automatic-Publication": "disabled" } });
}
