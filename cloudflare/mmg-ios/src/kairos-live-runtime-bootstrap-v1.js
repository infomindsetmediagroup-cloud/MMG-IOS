import { projectProductionRevenueReadiness } from "./kairos-production-readiness-v1.js";

export const KAIROS_LIVE_RUNTIME_BOOTSTRAP_BUILD = "kairos-live-runtime-bootstrap-20260728-1";

export async function bootstrapLiveRevenueRuntime(context = {}, input = {}) {
  requireExact(input.confirmation, "BOOTSTRAP LIVE REVENUE RUNTIME");
  requireOperator(input);

  const product = await context.revenueStore?.getRevenueProduct?.(input.revenueProductId);
  if (!product) throw runtimeError("REVENUE_PRODUCT_NOT_FOUND", "Revenue product was not found.", 404);

  const readiness = projectProductionRevenueReadiness(context.env || {}, product);
  if (!readiness.ready) {
    throw runtimeError("PRODUCTION_RUNTIME_NOT_READY", "Production runtime bindings or product configuration are incomplete.", 409, { blockers: readiness.blockers });
  }

  const bindingProbe = await verifyLiveBindings(context.env || {});
  if (!bindingProbe.ready) {
    throw runtimeError("LIVE_BINDING_VERIFICATION_FAILED", "One or more live production bindings failed verification.", 503, { blockers: bindingProbe.blockers });
  }

  const run = await context.firstRunStore?.bootstrap?.({
    revenueProductId: product.revenueProductId,
    operatorEmail: input.operatorEmail,
    operatorIdentityHash: input.operatorIdentityHash,
    confirmation: "BOOTSTRAP FIRST REVENUE RUN",
  });
  if (!run?.runId) throw runtimeError("FIRST_REVENUE_RUN_BOOTSTRAP_FAILED", "The first live revenue run was not created.", 500);

  return Object.freeze({
    runId: run.runId,
    revenueProductId: product.revenueProductId,
    status: run.status || "ready",
    nextAction: "execute-content-batch",
    readiness,
    bindingProbe,
    automaticPublicationAllowed: false,
    build: KAIROS_LIVE_RUNTIME_BOOTSTRAP_BUILD,
  });
}

export async function verifyLiveBindings(env = {}) {
  const checks = [];
  checks.push(check("openai-key", typeof env.OPENAI_API_KEY === "string" && env.OPENAI_API_KEY.length > 20));
  checks.push(check("production-model", typeof env.KAIROS_PRODUCTION_MODEL === "string" && env.KAIROS_PRODUCTION_MODEL.length > 0));
  checks.push(check("r2-binding", typeof env.REVENUE_ASSETS_R2?.put === "function" && typeof env.REVENUE_ASSETS_R2?.get === "function"));
  checks.push(check("durable-object-binding", typeof env.REVENUE_RUNS?.idFromName === "function" && typeof env.REVENUE_RUNS?.get === "function"));
  checks.push(check("shopify-domain", typeof env.SHOPIFY_STORE_DOMAIN === "string" && env.SHOPIFY_STORE_DOMAIN.includes(".")));
  checks.push(check("shopify-token", typeof env.SHOPIFY_ADMIN_ACCESS_TOKEN === "string" && env.SHOPIFY_ADMIN_ACCESS_TOKEN.length > 20));
  const blockers = checks.filter((item) => !item.passed).map((item) => item.id);
  return Object.freeze({ ready: blockers.length === 0, checks: Object.freeze(checks), blockers: Object.freeze(blockers) });
}

function check(id, passed) { return Object.freeze({ id, passed: Boolean(passed) }); }
function requireOperator(input) {
  if (!input.authorization || !input.operatorEmail || !input.operatorIdentityHash) throw runtimeError("KAIROS_OPERATOR_AUTH_REQUIRED", "Authenticated operator identity is required.", 401);
}
function requireExact(actual, expected) {
  if (actual !== expected) throw runtimeError("REVENUE_CONFIRMATION_REQUIRED", `Exact confirmation ${expected} is required.`, 409);
}
function runtimeError(code, message, status = 400, details = {}) {
  const error = new Error(message); error.code = code; error.status = status; Object.assign(error, details); return error;
}
