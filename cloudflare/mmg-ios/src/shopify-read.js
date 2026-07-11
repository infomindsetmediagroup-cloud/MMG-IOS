import { json, readJson, requireEnv, requireSession, runtimeError, sha256 } from "./runtime-core.js";
import { callStructuredOpenAI } from "./kairos-api.js";

export async function handleThemePlan(request, env) {
  if (request.method !== "POST") return json({ error: { code: "method_not_allowed", message: "Use POST." } }, 405);
  const session = await requireSession(request, env);
  requireEnv(env, ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN"]);
  const body = await readJson(request);
  const objective = typeof body.objective === "string" ? body.objective.trim().slice(0, 8000) : "";
  if (!objective) throw runtimeError(400, "invalid_objective", "A website-change objective is required.");
  const theme = await getMainTheme(env);
  const sources = await readThemeSources(env, theme.id);
  if (!sources.length) throw runtimeError(502, "theme_sources_unavailable", "Kairos could not read the current published theme sources.");
  const schema = {
    type: "object", additionalProperties: false,
    required: ["summary", "recommendedChanges", "expectedBenefits", "risks", "rollbackPlan", "mutationPlan"],
    properties: {
      summary: { type: "string" },
      recommendedChanges: { type: "array", maxItems: 5, items: { type: "string" } },
      expectedBenefits: { type: "array", maxItems: 3, items: { type: "string" } },
      risks: { type: "array", maxItems: 3, items: { type: "string" } },
      rollbackPlan: { type: "array", maxItems: 3, items: { type: "string" } },
      mutationPlan: {
        type: "object", additionalProperties: false, required: ["themeId", "files"],
        properties: {
          themeId: { type: "string" },
          files: { type: "array", minItems: 1, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["key", "value", "expectedSha256"], properties: { key: { type: "string" }, value: { type: "string" }, expectedSha256: { type: "string" } } } },
        },
      },
    },
  };
  const plan = await callStructuredOpenAI(env, "Create an exact Shopify theme mutation plan from only the supplied current source. Keep the executive summary brief. Return complete replacement content and change the fewest files necessary.", { objective, theme, sources }, schema, "shopify_mutation_plan");
  validatePlan(plan, theme.id, sources);
  return json({ ...plan, affectedAssets: plan.mutationPlan.files.map(file => file.key), actionID: crypto.randomUUID(), completedAt: new Date().toISOString(), auditId: crypto.randomUUID(), sourceEvidence: { themeId: theme.id, themeName: theme.name, files: sources.map(source => ({ key: source.key, sha256: source.sha256 })) }, executionContext: { authorizationMode: "session", operator: session.operator, sessionId: session.sessionId } });
}

export async function getMainTheme(env) {
  const response = await shopifyFetch(env, "/themes.json?role=main", { method: "GET" });
  const body = await safeJson(response);
  const theme = Array.isArray(body.themes) ? body.themes.find(entry => entry.role === "main") : null;
  if (!response.ok || !theme) throw runtimeError(502, "main_theme_unavailable", "Shopify did not return the published theme.");
  return { id: String(theme.id), name: theme.name || "Published theme" };
}

export async function readAsset(env, themeId, key) {
  const response = await shopifyFetch(env, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, { method: "GET" });
  if (response.status === 404) return { key, existed: false };
  const body = await safeJson(response);
  if (!response.ok || !body.asset || typeof body.asset.value !== "string") throw runtimeError(502, "theme_asset_read_failed", `Shopify could not read ${key}.`);
  return { key, existed: true, value: body.asset.value, sha256: await sha256(body.asset.value) };
}

export function shopifyFetch(env, path, init) {
  return fetch(`https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION || "2026-07"}${path}`, { ...init, headers: { "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_ACCESS_TOKEN, Accept: "application/json", ...(init.headers || {}) } });
}

async function readThemeSources(env, themeId) {
  const response = await shopifyFetch(env, `/themes/${themeId}/assets.json?fields=key`, { method: "GET" });
  const listing = await safeJson(response);
  const keys = Array.isArray(listing.assets) ? listing.assets.map(asset => asset.key).filter(Boolean) : [];
  const css = keys.find(key => /^assets\/(base|theme|styles?|application).*\.css$/i.test(key));
  const selected = ["templates/index.json", "layout/theme.liquid", "config/settings_data.json", css].filter(Boolean).filter(key => keys.includes(key));
  const sources = [];
  let total = 0;
  for (const key of selected) {
    const asset = await readAsset(env, themeId, key);
    if (!asset.existed) continue;
    const bytes = new TextEncoder().encode(asset.value).length;
    if (total + bytes > 180000) continue;
    total += bytes;
    sources.push({ key, value: asset.value, sha256: asset.sha256 });
  }
  return sources;
}

function validatePlan(plan, themeId, sources) {
  if (!plan?.mutationPlan || String(plan.mutationPlan.themeId) !== String(themeId) || !Array.isArray(plan.mutationPlan.files)) throw runtimeError(502, "invalid_mutation_plan", "Kairos returned an invalid mutation plan.");
  const byKey = new Map(sources.map(source => [source.key, source]));
  for (const file of plan.mutationPlan.files) {
    const source = byKey.get(file.key);
    if (!source || file.expectedSha256 !== source.sha256) throw runtimeError(502, "ungrounded_mutation_plan", `The proposed mutation for ${file.key} is not grounded in current source.`);
    if (!file.value || file.value.includes("...") || file.value.includes("[existing content]")) throw runtimeError(502, "incomplete_mutation_content", `The proposed replacement for ${file.key} is incomplete.`);
  }
}

async function safeJson(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return {}; } }
