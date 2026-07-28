import { executeFirstPackageBatch } from "./kairos-first-package-batch-v1.js";
import { reviewFirstPackageAsset } from "./kairos-first-package-review-v1.js";
import { projectFirstPackageReviewGate } from "./kairos-first-package-review-gate-v1.js";

export const KAIROS_FIRST_PACKAGE_ACTIONS_BUILD = "kairos-first-package-actions-20260728-1";

export async function dispatchFirstPackageAction(request = {}, context = {}) {
  const method = String(request.method || "GET").toUpperCase();
  const url = new URL(request.url || "https://kairos.invalid/");
  const match = url.pathname.match(/^\/api\/kairos\/revenue\/products\/([^/]+)\/(execute-first-package-batch|review-package-asset|package-gate)$/);
  if (!match) return null;
  if (method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Package actions require POST." } }, 405);

  const authorization = request.headers?.get?.("Authorization") || "";
  const operatorEmail = request.headers?.get?.("CF-Access-Authenticated-User-Email") || "";
  const operatorIdentityHash = request.headers?.get?.("X-Kairos-Operator-Identity") || "";
  if (!authorization || !operatorEmail || !operatorIdentityHash) return json({ error: { code: "KAIROS_OPERATOR_AUTH_REQUIRED", message: "Authenticated operator identity is required." } }, 401);

  const revenueProductId = decodeURIComponent(match[1]);
  const action = match[2];
  const input = await request.json().catch(() => ({}));
  try {
    if (action === "execute-first-package-batch") {
      return json(await executeFirstPackageBatch(context, { ...input, revenueProductId, authorization, operatorEmail, operatorIdentityHash }), 200);
    }
    if (action === "review-package-asset") {
      return json(await reviewFirstPackageAsset(context, { ...input, revenueProductId, authorization, operatorEmail, operatorIdentityHash }), 200);
    }
    const product = await context.revenueStore?.getRevenueProduct?.(revenueProductId);
    if (!product) return json({ error: { code: "REVENUE_PRODUCT_NOT_FOUND", message: "Revenue product was not found." } }, 404);
    return json(projectFirstPackageReviewGate(product), 200);
  } catch (error) {
    return json({ error: { code: error.code || "PACKAGE_ACTION_FAILED", message: error.message } }, error.status || 500);
  }
}

function json(body, status) {
  return new Response(JSON.stringify({ ...body, automaticPublicationAllowed: false, build: KAIROS_FIRST_PACKAGE_ACTIONS_BUILD }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Kairos-Automatic-Publication": "disabled" },
  });
}
