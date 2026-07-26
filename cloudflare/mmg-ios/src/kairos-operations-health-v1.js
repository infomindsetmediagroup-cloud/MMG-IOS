export const KAIROS_OPERATIONS_HEALTH_BUILD = "kairos-operations-health-20260725-1";

const ROUTE = /^\/api\/kairos\/operations\/health\/?$/i;

export async function handleKairosOperationsHealth(request, env) {
  const url = new URL(request.url);
  if (!ROUTE.test(url.pathname)) return null;
  if (request.method !== "GET") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } }, 405);
  if (!authenticate(request, env)) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated operations access is required." } }, 401);

  const durableObjects = await probeDurableObjects(env);
  const dependencies = {
    durableObjects,
    knowledgeVault: {
      status: durableObjects.status === "available" ? "available" : "unavailable",
      configured: Boolean(env?.KAIROS_PROJECTS),
      mode: "canonical-durable-storage",
    },
    shopify: {
      status: shopifyConfigured(env) ? "configured" : "unconfigured",
      configured: shopifyConfigured(env),
      domainConfigured: validShopDomain(env),
      tokenConfigured: Boolean(clean(env?.SHOPIFY_ADMIN_ACCESS_TOKEN, 4096)),
      apiVersion: clean(env?.SHOPIFY_ADMIN_API_VERSION, 40) || null,
      scopes: boundedScopes(env?.SHOPIFY_ADMIN_SCOPES),
    },
    modelProvider: modelProviderHealth(env),
  };
  const values = Object.values(dependencies).map((item) => item.status);
  const overall = values.includes("unavailable") ? "degraded" : values.every((item) => ["available", "configured"].includes(item)) ? "healthy" : "partial";
  return json({ success: true, overall, checkedAt: new Date().toISOString(), dependencies, build: KAIROS_OPERATIONS_HEALTH_BUILD });
}

async function probeDurableObjects(env) {
  if (!env?.KAIROS_PROJECTS?.get || !env?.KAIROS_PROJECTS?.idFromName) return { status: "unavailable", configured: false };
  try {
    const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
    const response = await stub.fetch(new Request("https://kairos.internal/registry/kairos-observability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "metrics" }),
    }));
    return { status: response.ok ? "available" : "unavailable", configured: true, responseStatus: response.status };
  } catch {
    return { status: "unavailable", configured: true };
  }
}

function modelProviderHealth(env) {
  const provider = clean(env?.KAIROS_MODEL_PROVIDER, 80).toLowerCase() || "deterministic";
  if (provider === "openai") {
    const configured = Boolean(clean(env?.OPENAI_API_KEY, 4096));
    return { status: configured ? "configured" : "unconfigured", provider, configured, model: clean(env?.KAIROS_MODEL_NAME, 160) || null };
  }
  return { status: "configured", provider, configured: true, model: clean(env?.KAIROS_MODEL_NAME, 160) || null };
}

function shopifyConfigured(env) { return validShopDomain(env) && Boolean(clean(env?.SHOPIFY_ADMIN_ACCESS_TOKEN, 4096)) && Boolean(clean(env?.SHOPIFY_ADMIN_API_VERSION, 40)); }
function validShopDomain(env) { return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(clean(env?.SHOPIFY_SHOP_DOMAIN || env?.SHOPIFY_STORE_DOMAIN, 255)); }
function boundedScopes(value) { return [...new Set(clean(value, 2000).split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 24); }
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Operations-Health": KAIROS_OPERATIONS_HEALTH_BUILD } }); }
