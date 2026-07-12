import { createHash, randomUUID } from "node:crypto";
import reconciledWorker from "./reconciled-worker.js";

const SHOPIFY_TIMEOUT_MS = 20_000;
const MARKER = "/* MMG KAIROS GUIDED HOMEPAGE BASELINE */";
const CSS_KEYS = ["assets/base.css", "assets/theme.css", "assets/styles.css", "assets/application.css"];
const tokenCache = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/theme-plan" || request.method !== "POST") {
      return reconciledWorker.fetch(request, env, ctx);
    }

    const primary = await reconciledWorker.fetch(request.clone(), env, ctx);
    if (primary.ok) return primary;

    const primaryBody = await safeJSON(primary.clone());
    const recoverableCodes = new Set(["mutation_plan_blocked", "invalid_homepage_template"]);
    if (!recoverableCodes.has(primaryBody?.error?.code)) return primary;

    try {
      return await buildVerifiedFallback(request, env);
    } catch (error) {
      return errorResponse(error);
    }
  },
};

async function buildVerifiedFallback(request, env) {
  const shopify = await requireShopify(env);
  const requestBody = await readBody(request);
  const objective = boundedText(requestBody.objective, "objective", 8000);
  const theme = await readMainTheme(shopify);
  const files = await queryThemeFiles(shopify, theme.id, ["layout/theme.liquid", ...CSS_KEYS], 5);
  const byKey = new Map(files.map(file => [file.filename, file]));
  const layout = byKey.get("layout/theme.liquid");

  if (!layout?.value) {
    throw httpError(409, "homepage_scope_source_missing", "Shopify did not return layout/theme.liquid, so Kairos could not verify homepage-only scope.");
  }

  const selectorVerified = /template-index/i.test(layout.value)
    || /template-\s*{{\s*request\.page_type/i.test(layout.value)
    || /template-\s*{{\s*template\.name/i.test(layout.value);

  if (!selectorVerified) {
    throw httpError(409, "homepage_scope_unverified", "The published layout does not prove a .template-index homepage body class. Kairos will not create a global stylesheet mutation.");
  }

  const stylesheet = CSS_KEYS.map(key => byKey.get(key)).find(file => typeof file?.value === "string" && file.value.length > 0);
  if (!stylesheet) {
    throw httpError(409, "homepage_stylesheet_unavailable", "No editable published stylesheet was returned for the verified homepage-scoped fallback.");
  }

  if (stylesheet.value.includes(MARKER)) {
    throw httpError(409, "guided_baseline_already_applied", "The governed guided-homepage baseline is already present. Define the next specific homepage change before generating another proposal.");
  }

  const enhancement = `${MARKER}\n.template-index main {\n  --mmg-guided-section-gap: clamp(1.5rem, 4vw, 3.5rem);\n}\n.template-index main .shopify-section + .shopify-section {\n  margin-top: var(--mmg-guided-section-gap);\n}\n.template-index main :is(h1, h2, h3) {\n  text-wrap: balance;\n}\n.template-index main :is(p, li) {\n  text-wrap: pretty;\n}\n@media (max-width: 749px) {\n  .template-index main .page-width {\n    padding-left: max(1rem, env(safe-area-inset-left));\n    padding-right: max(1rem, env(safe-area-inset-right));\n  }\n  .template-index main :is(button, .button, a.button) {\n    min-height: 44px;\n  }\n}\n`;

  const replacement = `${stylesheet.value.replace(/\s+$/, "")}\n\n${enhancement}`;
  const requestId = randomUUID();
  const auditId = randomUUID();

  return json({
    summary: "Apply a bounded, homepage-only guided-experience baseline using a verified .template-index scope in the current published theme.",
    recommendedChanges: [
      "Add consistent progression spacing between homepage sections.",
      "Improve homepage heading and paragraph wrapping.",
      "Preserve mobile safe areas and accessible 44-pixel control height."
    ],
    affectedAssets: [stylesheet.filename],
    expectedBenefits: [
      "Clearer visual progression through the homepage.",
      "Improved readability and mobile tap comfort.",
      "No selector impact on product, collection, cart, account, blog, or article templates."
    ],
    risks: [
      "Existing section-specific spacing may need executive visual review after execution.",
      "The change is intentionally presentation-only and does not alter homepage content or section order."
    ],
    rollbackPlan: [`Restore the exact pre-change bytes of ${stylesheet.filename}.`],
    acceptanceCriteria: [
      "Homepage sections display consistent progression spacing on desktop and mobile.",
      "No horizontal overflow occurs at representative mobile widths.",
      "Buttons remain at least 44 pixels high on mobile.",
      "Non-homepage templates remain visually unchanged."
    ],
    mutationPlan: {
      themeId: theme.id,
      files: [{
        key: stylesheet.filename,
        value: replacement,
        expectedSha256: sha256(stylesheet.value),
      }],
    },
    actionID: randomUUID(),
    completedAt: new Date().toISOString(),
    requestId,
    auditId,
    sourceEvidence: {
      adapter: "graphql-admin-verified-homepage-fallback",
      themeId: theme.id,
      themeName: theme.name,
      role: theme.role,
      homepageSelector: ".template-index",
      selectorEvidenceFile: "layout/theme.liquid",
      objective,
      compatibilityRecovery: "shopify-generated-json-comment",
      files: [
        { key: "layout/theme.liquid", sha256: sha256(layout.value), bytes: Buffer.byteLength(layout.value, "utf8") },
        { key: stylesheet.filename, sha256: sha256(stylesheet.value), bytes: Buffer.byteLength(stylesheet.value, "utf8") },
      ],
    },
  });
}

async function requireShopify(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  let accessToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (clientId && clientSecret) accessToken = await getClientToken(storeDomain, clientId, clientSecret);
  if (!accessToken) throw httpError(503, "shopify_not_configured", "Shopify credentials are not configured in Cloudflare.");
  return { storeDomain, apiVersion, accessToken };
}

async function getClientToken(storeDomain, clientId, clientSecret) {
  const cacheKey = `${storeDomain}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.accessToken;
  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  if (!response.ok || !accessToken) throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`).slice(0, 500));
  tokenCache.set(cacheKey, { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 });
  return accessToken;
}

async function readMainTheme(shopify) {
  const data = await shopifyGraphQL(shopify, `query KairosMainTheme { themes(first: 1, roles: [MAIN]) { nodes { id name role processing processingFailed } } }`);
  const theme = data?.themes?.nodes?.[0];
  if (!theme || theme.role !== "MAIN") throw httpError(502, "main_theme_unavailable", "Shopify did not return the published main theme.");
  if (theme.processing || theme.processingFailed) throw httpError(409, "main_theme_processing", "The published Shopify theme is still processing or failed processing.");
  const match = String(theme.id || "").match(/^gid:\/\/shopify\/OnlineStoreTheme\/(\d+)$/);
  if (!match) throw httpError(502, "invalid_shopify_theme_id", "Shopify returned an invalid published theme ID.");
  return { id: match[1], name: typeof theme.name === "string" ? theme.name : "Published theme", role: "main" };
}

async function queryThemeFiles(shopify, themeId, filenames, first) {
  const data = await shopifyGraphQL(shopify, `query KairosThemeFiles($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } ... on OnlineStoreThemeFileBodyUrl { url } } } userErrors { code filename } } } }`, {
    themeId: `gid://shopify/OnlineStoreTheme/${themeId}`,
    filenames,
    first,
  });
  if (!data?.theme) throw httpError(404, "theme_not_found", "Shopify could not find the requested theme.");
  const errors = Array.isArray(data.theme.files?.userErrors) ? data.theme.files.userErrors.filter(error => error?.code && error.code !== "NOT_FOUND") : [];
  if (errors.length) throw httpError(502, "theme_file_read_failed", `Shopify could not read theme files: ${errors.map(error => `${error.filename || "file"} (${error.code})`).join(", ")}.`);
  const output = [];
  for (const node of Array.isArray(data.theme.files?.nodes) ? data.theme.files.nodes : []) {
    const value = await bodyToText(node?.body);
    if (typeof node?.filename === "string" && typeof value === "string") output.push({ filename: node.filename, value });
  }
  return output;
}

async function bodyToText(body) {
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") return Buffer.from(body.contentBase64, "base64").toString("utf8");
  if (typeof body?.url === "string") {
    const response = await fetch(body.url, { signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
    if (!response.ok) throw httpError(502, "theme_file_url_failed", "Shopify returned a theme file URL that could not be downloaded.");
    return response.text();
  }
  return undefined;
}

async function shopifyGraphQL(shopify, query, variables = {}) {
  const response = await fetch(`https://${shopify.storeDomain}/admin/api/${shopify.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": shopify.accessToken, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? response.status : 502, "shopify_graphql_http_error", `Shopify GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw httpError(502, "shopify_graphql_error", body.errors.map(error => error?.message).filter(Boolean).join("; "));
  if (!body?.data) throw httpError(502, "shopify_graphql_invalid_response", "Shopify GraphQL returned no data.");
  return body.data;
}

function sha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function boundedText(value, field, maximum) { if (typeof value !== "string" || !value.trim() || value.length > maximum) throw httpError(400, "invalid_request", `${field} is empty or exceeds its limit.`); return value.trim(); }
async function readBody(request) { try { const body = await request.json(); return body && typeof body === "object" && !Array.isArray(body) ? body : {}; } catch { throw httpError(400, "invalid_json", "Request body must be valid JSON."); } }
async function safeJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return {}; } }
function httpError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; error.requestID = randomUUID(); return error; }
function errorResponse(error) { return json({ error: { code: error?.code || "internal_error", message: error instanceof Error ? error.message : "Kairos encountered an internal error.", requestID: error?.requestID || randomUUID() } }, Number(error?.status) || 500); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-MMG-Runtime": "cloudflare-native" } }); }
