export const KAIROS_PRODUCTION_REVENUE_ROUTER_BUILD = "kairos-production-revenue-router-20260729-2";

const ACTIONS = Object.freeze({
  "bootstrap-live-runtime": { method: "POST", confirmation: "BOOTSTRAP LIVE REVENUE RUNTIME", handler: "bootstrapLiveRuntime" },
  "execute-content-batch": { method: "POST", confirmation: "EXECUTE FIRST CONTENT BATCH", handler: "executeContentBatch" },
  "review-content-asset": { method: "POST", handler: "reviewContentAsset" },
  "content-gate": { method: "GET", handler: "projectContentGate" },
  "execute-visual-batch": { method: "POST", confirmation: "EXECUTE FIRST VISUAL BATCH", handler: "executeVisualBatch" },
  "review-visual-asset": { method: "POST", handler: "reviewVisualAsset" },
  "visual-gate": { method: "GET", handler: "projectVisualGate" },
  "execute-package-batch": { method: "POST", confirmation: "EXECUTE FIRST PACKAGE BATCH", handler: "executePackageBatch" },
  "review-package-asset": { method: "POST", handler: "reviewPackageAsset" },
  "package-gate": { method: "GET", handler: "projectPackageGate" },
  "create-shopify-draft": { method: "POST", confirmation: "CREATE FIRST SHOPIFY DRAFT", handler: "createShopifyDraft" },
  "certify-launch": { method: "POST", confirmation: "CERTIFY FIRST REVENUE LAUNCH", handler: "certifyLaunch" },
  "status": { method: "GET", handler: "getStatus" },
});

export async function routeProductionRevenueAction(context = {}, request = {}) {
  const action = String(request.action || "");
  const route = ACTIONS[action];
  if (!route) throw runtimeError("REVENUE_ACTION_NOT_FOUND", `Unknown production revenue action: ${action}`, 404);
  if (String(request.method || "GET").toUpperCase() !== route.method) {
    throw runtimeError("REVENUE_METHOD_NOT_ALLOWED", `${route.method} is required for ${action}.`, 405);
  }
  requireOperator(request);
  if (route.confirmation && request.confirmation !== route.confirmation) {
    throw runtimeError("REVENUE_CONFIRMATION_REQUIRED", `Exact confirmation ${route.confirmation} is required.`, 409);
  }

  const handler = context[route.handler];
  if (typeof handler !== "function") {
    throw runtimeError("REVENUE_HANDLER_UNAVAILABLE", `Production handler ${route.handler} is unavailable.`, 503);
  }

  const result = await handler({
    ...request,
    automaticPublicationAllowed: false,
  });

  return Object.freeze({
    action,
    result,
    headers: Object.freeze({
      "cache-control": "no-store",
      "x-kairos-automatic-publication": "disabled",
      "x-kairos-production-revenue-router-build": KAIROS_PRODUCTION_REVENUE_ROUTER_BUILD,
    }),
    automaticPublicationAllowed: false,
  });
}

export function listProductionRevenueActions() {
  return Object.freeze(Object.entries(ACTIONS).map(([action, config]) => Object.freeze({ action, method: config.method, confirmation: config.confirmation || null })));
}

function requireOperator(request) {
  if (!request.authorization || !request.operatorEmail || !request.operatorIdentityHash) {
    throw runtimeError("KAIROS_OPERATOR_AUTH_REQUIRED", "Authenticated operator identity is required.", 401);
  }
}

function runtimeError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
