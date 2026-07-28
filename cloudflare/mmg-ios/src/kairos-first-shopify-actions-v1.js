import { executeFirstShopifyDraftHandoff } from "./kairos-first-shopify-draft-handoff-v1.js";
import { certifyFirstRevenueLaunch } from "./kairos-first-launch-certification-v1.js";

export const KAIROS_FIRST_SHOPIFY_ACTIONS_BUILD = "kairos-first-shopify-actions-20260728-1";

export async function dispatchFirstShopifyAction(context = {}, request = {}) {
  requireOperator(request);
  const action = request.action;

  if (action === "create-first-shopify-draft") {
    const result = await executeFirstShopifyDraftHandoff(context, request);
    return response(200, result);
  }

  if (action === "certify-first-revenue-launch") {
    const product = await context.revenueStore?.getRevenueProduct?.(request.revenueProductId);
    if (!product) return response(404, { error: "REVENUE_PRODUCT_NOT_FOUND" });
    const certification = certifyFirstRevenueLaunch(product, request);
    if (certification.certified) {
      const persisted = await context.revenueStore?.attachLaunchCertification?.(product.revenueProductId, certification);
      if (!persisted) return response(500, { error: "LAUNCH_CERTIFICATION_PERSIST_FAILED" });
    }
    return response(certification.certified ? 200 : 409, certification);
  }

  return response(404, { error: "FIRST_SHOPIFY_ACTION_NOT_FOUND" });
}

function requireOperator(request) {
  if (!request.authorization || !request.operatorEmail || !request.operatorIdentityHash) {
    const error = new Error("Authenticated operator identity is required.");
    error.code = "KAIROS_OPERATOR_AUTH_REQUIRED";
    error.status = 401;
    throw error;
  }
}

function response(status, body) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "cache-control": "no-store",
      "x-kairos-automatic-publication": "disabled",
      "x-kairos-build": KAIROS_FIRST_SHOPIFY_ACTIONS_BUILD,
    }),
    body: Object.freeze(body),
  });
}
