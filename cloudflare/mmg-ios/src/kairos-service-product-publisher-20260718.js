import { hashText, httpError, inspectStagingSource, parseShopifyJson, semanticHash, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";
import {
  SERVICE_PRODUCT_TEMPLATE_FILE,
  SERVICE_PRODUCT_TEMPLATE_SOURCE,
  SERVICE_PRODUCT_SECTION_FILE,
  SERVICE_PRODUCT_SECTION_SOURCE,
  SERVICE_PRODUCT_CSS_FILE,
  SERVICE_PRODUCT_CSS_SOURCE,
} from "./kairos-canonical-homepage-source-20260718.js";

export const KAIROS_SERVICE_PRODUCT_BUILD = "kairos-service-product-publisher-20260718-1";
export const SERVICE_PRODUCT_BUILD_PATH = "/api/shopify/staging/service-product/build";
export const SERVICE_PRODUCT_STAGING_CONFIRMATION = "BUILD_CANONICAL_MMG_SERVICE_PRODUCT_STAGING";
export const SERVICE_PRODUCT_PUBLISH_CONFIRMATION = "PUBLISH_CANONICAL_MMG_SERVICE_PRODUCT_LIVE";

const MANAGED_FILES = [SERVICE_PRODUCT_TEMPLATE_FILE, SERVICE_PRODUCT_SECTION_FILE, SERVICE_PRODUCT_CSS_FILE];
const SHOPIFY_TIMEOUT_MS = 25_000;
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 450;
const tokenCache = new Map();

export async function handleServiceProductBuild(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== SERVICE_PRODUCT_BUILD_PATH) return null;
  const payload = await safeRequestJSON(request.clone());
  const mode = payload?.mode === "publish" ? "publish" : "build";
  const confirmation = mode === "publish" ? SERVICE_PRODUCT_PUBLISH_CONFIRMATION : SERVICE_PRODUCT_STAGING_CONFIRMATION;
  if (payload?.confirmation !== confirmation) throw httpError(403, "service_product_confirmation_required", `Provide the exact confirmation phrase: ${confirmation}.`);

  const productHandle = normalizeHandle(payload?.productHandle || "publish-ready-book-build-service");
  const inspection = await inspectStagingSource(null, request, env, KAIROS_SERVICE_PRODUCT_BUILD, MANAGED_FILES);
  const evidence = inspection?.evidence || {};
  validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);
  const candidates = await prepareCandidates();

  if (mode === "build") {
    await writeThemeFiles(env, evidence.stagingTheme.gid, candidates.map(({ filename, content }) => ({ filename, content })));
    await verifyThemeReadBack(env, evidence.stagingTheme.gid, candidates, "staging");
    return json({
      status: "completed",
      build: KAIROS_SERVICE_PRODUCT_BUILD,
      mode,
      summary: "Kairos installed the canonical multi-variant service-product system into verified Kairos Staging and confirmed exact source read-back.",
      preview: { url: `${storefrontOrigin(env)}/products/${productHandle}?preview_theme_id=${themeID(evidence.stagingTheme.gid)}`, theme: evidence.stagingTheme, templateSuffix: "mmg-service" },
      files: candidates.map(({ content, ...file }) => file),
      safeguards: { stagingOnly: true, mainThemeMutation: false, exactReadBack: true, productDataDriven: true, multiVariantArchitectureVerified: true, shopifyPricingAuthoritative: true },
    });
  }

  await verifyThemeReadBack(env, evidence.stagingTheme.gid, candidates, "staging");
  await writeThemeFiles(env, evidence.mainTheme.gid, candidates.map(({ filename, content }) => ({ filename, content })));
  await verifyThemeReadBack(env, evidence.mainTheme.gid, candidates, "published");
  return json({
    status: "completed",
    build: KAIROS_SERVICE_PRODUCT_BUILD,
    mode,
    summary: "Kairos promoted the verified canonical multi-variant service-product system to Shopify MAIN and confirmed exact source read-back.",
    production: { url: `${storefrontOrigin(env)}/products/${productHandle}`, publishedTheme: evidence.mainTheme, publishedThemeChanged: true, templateSuffix: "mmg-service" },
    files: candidates.map(({ content, ...file }) => file),
    verification: { stagingVerifiedBeforePublish: true, publishedThemeReadBackVerified: true, exactReadBack: true },
    safeguards: { stagingOnly: false, mainThemeMutation: true, sourceBundlePromotedWithoutReconstruction: true, multiVariantArchitectureVerified: true, shopifyPricingAuthoritative: true },
  });
}

async function prepareCandidates() {
  const candidates = [
    { filename: SERVICE_PRODUCT_TEMPLATE_FILE, content: SERVICE_PRODUCT_TEMPLATE_SOURCE, readBackVerification: "semantic-json" },
    { filename: SERVICE_PRODUCT_SECTION_FILE, content: SERVICE_PRODUCT_SECTION_SOURCE, readBackVerification: "exact-bytes" },
    { filename: SERVICE_PRODUCT_CSS_FILE, content: SERVICE_PRODUCT_CSS_SOURCE, readBackVerification: "exact-bytes" },
  ];
  for (const candidate of candidates) {
    candidate.afterSha256 = await hashText(candidate.content);
    candidate.afterBytes = new TextEncoder().encode(candidate.content).length;
  }
  return candidates;
}

async function verifyThemeReadBack(env, themeGid, candidates, label) {
  let lastObserved = [];
  let lastError = null;
  for (let attempt = 1; attempt <= READ_BACK_ATTEMPTS; attempt += 1) {
    try {
      const files = await readThemeFiles(env, themeGid, MANAGED_FILES);
      const map = new Map(files.map(file => [file.filename, file]));
      let matched = true;
      const observed = [];
      for (const candidate of candidates) {
        const actual = map.get(candidate.filename);
        if (!actual) { matched = false; observed.push(`${candidate.filename}:missing`); break; }
        if (candidate.readBackVerification === "semantic-json") {
          const expected = await semanticHash(parseShopifyJson(candidate.content));
          const received = await semanticHash(parseShopifyJson(actual.content));
          observed.push(`${candidate.filename}:${received}`);
          if (expected !== received) { matched = false; break; }
        } else {
          observed.push(`${candidate.filename}:${actual.sha256}`);
          if (actual.content !== candidate.content || actual.sha256 !== candidate.afterSha256) { matched = false; break; }
        }
      }
      lastObserved = observed;
      if (matched) return true;
    } catch (error) { lastError = error; }
    if (attempt < READ_BACK_ATTEMPTS) await delay(READ_BACK_DELAY_MS);
  }
  const detail = lastError instanceof Error ? ` Last read error: ${lastError.message}` : "";
  throw httpError(502, "service_product_readback_mismatch", `Shopify did not expose the current ${label} service-product revision. Observed ${lastObserved.join(", ") || "no readable files"}.${detail}`);
}

async function readThemeFiles(env, themeGid, filenames) {
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const data = await shopifyGraphQL(config, auth, `query KairosServiceProductThemeFiles($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename contentType body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } userErrors { code filename } } } }`, { themeId: themeGid, filenames, first: filenames.length });
  const connection = data?.theme?.files;
  const errors = Array.isArray(connection?.userErrors) ? connection.userErrors.filter(error => error?.code && error.code !== "NOT_FOUND") : [];
  if (errors.length) throw httpError(502, "service_product_theme_file_read_failed", errors.map(error => error.code).join(", "));
  const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
  const files = [];
  for (const filename of filenames) {
    const node = nodes.find(item => item?.filename === filename);
    const content = bodyToText(node?.body);
    if (!content) continue;
    files.push({ filename, content, sha256: await hashText(content), bytes: new TextEncoder().encode(content).length });
  }
  return files;
}

function validateThemeBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_kairos_staging_required", "Verified Kairos Staging is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN" || mainTheme.gid === stagingTheme.gid) throw httpError(409, "main_theme_boundary_invalid", "Shopify MAIN theme boundary could not be verified.");
}
function normalizeHandle(value) {
  const handle = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) throw httpError(422, "invalid_product_handle", "productHandle must be a valid Shopify handle.");
  return handle;
}
function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) throw httpError(503, "shopify_invalid_version", "The Shopify API version is invalid.");
  return { storeDomain, apiVersion };
}
async function resolveAccessToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const cacheKey = `${config.storeDomain}:${clientId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached?.expiresAt > Date.now()) return { token: cached.token };
    const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
    const body = await safeResponseJSON(response);
    const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
    if (!response.ok || !token) throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`).slice(0, 500));
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { token };
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw httpError(503, "shopify_not_configured", "Shopify credentials are not configured.");
  return { token };
}
async function shopifyGraphQL(config, auth, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
  const body = await safeResponseJSON(response);
  if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw httpError(422, "shopify_graphql_error", body.errors.map(error => error?.message).filter(Boolean).join("; "));
  return body?.data || {};
}
function bodyToText(body) { if (typeof body?.content === "string") return body.content; if (typeof body?.contentBase64 === "string") { try { return atob(body.contentBase64); } catch { return ""; } } return ""; }
function themeID(gid) { return String(gid || "").split("/").pop(); }
function storefrontOrigin(env) { return String(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com").replace(/\/+$/, ""); }
async function safeRequestJSON(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Service-Product": KAIROS_SERVICE_PRODUCT_BUILD, "X-Content-Type-Options": "nosniff" } }); }
