import { routeKairosProductionFetch } from "./kairos-production-fetch-chain-v1.js";
import { bootstrapLiveRevenueRuntime } from "./kairos-live-runtime-bootstrap-v1.js";
import { executeFirstRevenueRunStoreAction } from "./kairos-first-revenue-run-store-v1.js";

export const KAIROS_PRODUCTION_REVENUE_RUNTIME_COMPOSITION_BUILD = "kairos-production-revenue-runtime-composition-20260729-1";
const PRODUCT_PATH = "/registry/kairos-revenue-products";
const FIRST_RUN_PATH = "/registry/kairos-first-revenue-runs";

export async function handleProductionRevenueRuntime(request, env, next) {
  const runtimeEnv = normalizeRuntimeEnv(env || {});
  const revenueStore = createRevenueStore(runtimeEnv);
  const firstRunStore = createFirstRunStore(runtimeEnv);

  return routeKairosProductionFetch({
    env: runtimeEnv,
    revenueStore,
    revenueHandlers: {
      bootstrapLiveRuntime: (input) => bootstrapLiveRevenueRuntime({
        env: runtimeEnv,
        revenueStore,
        firstRunStore,
      }, input),
    },
    authenticateOperator: (incoming) => authenticateOperator(incoming, runtimeEnv),
    next,
  }, request);
}

export async function handleFirstRevenueRunObjectRequest(state, request) {
  const url = new URL(request.url);
  if (url.pathname !== FIRST_RUN_PATH) return null;
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED", message: "POST is required." }, 405);

  const payload = await readJson(request);
  try {
    const result = await executeFirstRevenueRunStoreAction(state, payload.action, payload.input || {});
    return json(result, 200);
  } catch (error) {
    return json({
      error: error?.code || "FIRST_REVENUE_RUN_STORE_ERROR",
      message: error instanceof Error ? error.message : "First revenue run storage failed.",
      automaticPublicationAllowed: false,
    }, Number(error?.status || 500));
  }
}

function createRevenueStore(env) {
  return Object.freeze({
    async getRevenueProduct(revenueProductId) {
      const response = await projectStub(env).fetch(internalRequest(PRODUCT_PATH, {
        operation: "read",
        revenueProductId,
      }));
      const payload = await response.json();
      if (response.status === 404) return null;
      if (!response.ok) throw runtimeError(payload?.error?.code || "REVENUE_PRODUCT_READ_FAILED", payload?.error?.message || "Revenue product could not be read.", response.status);
      return payload.product || null;
    },
  });
}

function createFirstRunStore(env) {
  return Object.freeze({
    async bootstrap(input) {
      const response = await projectStub(env).fetch(internalRequest(FIRST_RUN_PATH, {
        action: "start",
        input,
      }));
      const payload = await response.json();
      if (!response.ok) throw runtimeError(payload?.error || "FIRST_REVENUE_RUN_BOOTSTRAP_FAILED", payload?.message || "First revenue run could not be started.", response.status);
      return payload.run || null;
    },
  });
}

function projectStub(env) {
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get) {
    throw runtimeError("REVENUE_STORAGE_UNAVAILABLE", "Kairos revenue storage is unavailable.", 503);
  }
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
}

function normalizeRuntimeEnv(env) {
  return Object.freeze({
    ...env,
    KAIROS_PRODUCTION_MODEL: env.KAIROS_PRODUCTION_MODEL || env.KAIROS_MODEL_NAME || env.KAIROS_OPENAI_MODEL,
    REVENUE_ASSETS_R2: env.REVENUE_ASSETS_R2 || env.KAIROS_REVENUE_ASSETS,
    REVENUE_RUNS: env.REVENUE_RUNS || env.KAIROS_PROJECTS,
  });
}

function authenticateOperator(request, env) {
  const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320).toLowerCase();
  const authorization = request.headers.get("authorization") || "";
  const configuredToken = String(env.KAIROS_API_ACCESS_TOKEN || "");
  const tokenAuthorized = configuredToken && authorization === `Bearer ${configuredToken}`;
  if (!email && !tokenAuthorized) return null;
  const identity = email || "api-token-operator";
  return Object.freeze({
    authorization: email ? "cf-access" : authorization,
    email: email || "api-token@kairos.internal",
    identityHash: `kid_${fnv1a(identity)}`,
  });
}

function internalRequest(path, payload) {
  return new Request(`https://kairos.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Automatic-Publication": "disabled",
      "X-Kairos-Revenue-Runtime-Composition": KAIROS_PRODUCTION_REVENUE_RUNTIME_COMPOSITION_BUILD,
    },
  });
}

function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function fnv1a(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }
function runtimeError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
