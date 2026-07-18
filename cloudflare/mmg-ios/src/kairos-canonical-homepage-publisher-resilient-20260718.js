import { hashText, httpError, inspectStagingSource, parseShopifyJson, semanticHash, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";
import { BUILD_PATH, CSS_FILE, CSS_SOURCE, JS_FILE, JS_SOURCE, KAIROS_CANONICAL_HOMEPAGE_BUILD, MANAGED_FILES, PUBLISH_CONFIRMATION, SECTION_FILE, SECTION_SOURCE, STAGING_CONFIRMATION, TEMPLATE_FILE, TEMPLATE_SOURCE } from "./kairos-canonical-homepage-source-20260718.js";

export const KAIROS_CANONICAL_HOMEPAGE_RESILIENT_BUILD = "kairos-canonical-homepage-resilient-20260718-1";
const READ_BACK_ATTEMPTS = 40;
const READ_BACK_DELAY_MS = 1000;
const SHOPIFY_TIMEOUT_MS = 25000;
const tokenCache = new Map();

export async function handleCanonicalHomepageResilient(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== BUILD_PATH) return null;
  const payload = await safeRequestJSON(request.clone());
  const mode = payload?.mode === "publish" ? "publish" : "build";
  const confirmation = mode === "publish" ? PUBLISH_CONFIRMATION : STAGING_CONFIRMATION;
  if (payload?.confirmation !== confirmation) throw httpError(403, "canonical_homepage_confirmation_required", `Provide the exact confirmation phrase: ${confirmation}.`);

  const inspection = await inspectStagingSource(null, request, env, KAIROS_CANONICAL_HOMEPAGE_RESILIENT_BUILD, MANAGED_FILES);
  const evidence = inspection?.evidence || {};
  validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);
  const candidates = await prepareCandidates();

  if (mode === "build") {
    await writeThemeFiles(env, evidence.stagingTheme.gid, candidates.map(({ filename, content }) => ({ filename, content })));
    await verifyThemeReadBack(env, evidence.stagingTheme.gid, candidates, "staging");
    const previewURL = stagingPreviewURL(env, evidence.stagingTheme.gid);
    return json({
      status: "completed",
      build: KAIROS_CANONICAL_HOMEPAGE_BUILD,
      resilientPublisher: KAIROS_CANONICAL_HOMEPAGE_RESILIENT_BUILD,
      mode,
      preview: { url: previewURL, desktopURL: previewURL, mobileURL: previewURL, theme: evidence.stagingTheme },
      production: { url: storefrontOrigin(env), publishedTheme: evidence.mainTheme, publishedThemeChanged: false, publishAuthorized: false },
      verification: { exactReadBack: true, stagingBundleVerified: true, publishedThemeReadBackVerified: false },
      safeguards: { stagingOnly: true, mainThemeMutation: false, eventualConsistencyWindowSeconds: 40 }
    });
  }

  await verifyThemeReadBack(env, evidence.stagingTheme.gid, candidates, "staging");
  await writeThemeFiles(env, evidence.mainTheme.gid, candidates.map(({ filename, content }) => ({ filename, content })));
  await verifyThemeReadBack(env, evidence.mainTheme.gid, candidates, "published");
  return json({
    status: "completed",
    build: KAIROS_CANONICAL_HOMEPAGE_BUILD,
    resilientPublisher: KAIROS_CANONICAL_HOMEPAGE_RESILIENT_BUILD,
    mode: "publish",
    production: { url: storefrontOrigin(env), publishedTheme: evidence.mainTheme, publishedThemeChanged: true, publishAuthorized: true },
    preview: { url: stagingPreviewURL(env, evidence.stagingTheme.gid), theme: evidence.stagingTheme },
    verification: { exactReadBack: true, stagingBundleVerifiedBeforePublish: true, publishedThemeReadBackVerified: true },
    safeguards: { stagingOnly: false, mainThemeMutation: true, sourceBundlePromotedWithoutReconstruction: true, eventualConsistencyWindowSeconds: 40 }
  });
}

async function prepareCandidates() {
  const candidates = [
    { filename: TEMPLATE_FILE, content: TEMPLATE_SOURCE, verification: "semantic-json" },
    { filename: SECTION_FILE, content: SECTION_SOURCE, verification: "exact-bytes" },
    { filename: CSS_FILE, content: CSS_SOURCE, verification: "exact-bytes" },
    { filename: JS_FILE, content: JS_SOURCE, verification: "exact-bytes" }
  ];
  for (const candidate of candidates) candidate.sha256 = await hashText(candidate.content);
  return candidates;
}

async function verifyThemeReadBack(env, themeGid, candidates, label) {
  let lastObserved = [];
  let lastError = null;
  for (let attempt = 1; attempt <= READ_BACK_ATTEMPTS; attempt += 1) {
    try {
      const files = await readThemeFiles(env, themeGid, candidates.map(candidate => candidate.filename));
      const map = new Map(files.map(file => [file.filename, file]));
      let matched = true;
      const observed = [];
      for (const candidate of candidates) {
        const actual = map.get(candidate.filename);
        if (!actual) { matched = false; observed.push(`${candidate.filename}:missing`); continue; }
        if (candidate.verification === "semantic-json") {
          const expected = await semanticHash(parseShopifyJson(candidate.content));
          const received = await semanticHash(parseShopifyJson(actual.content));
          observed.push(`${candidate.filename}:${received}`);
          if (expected !== received) matched = false;
        } else {
          observed.push(`${candidate.filename}:${actual.sha256}`);
          if (candidate.sha256 !== actual.sha256 || candidate.content !== actual.content) matched = false;
        }
      }
      lastObserved = observed;
      if (matched) return true;
    } catch (error) {
      lastError = error;
    }
    if (attempt < READ_BACK_ATTEMPTS) await delay(READ_BACK_DELAY_MS);
  }
  const detail = lastError instanceof Error ? ` Last read error: ${lastError.message}` : "";
  throw httpError(502, "canonical_homepage_readback_mismatch", `Shopify did not expose the current ${label} homepage revision after ${READ_BACK_ATTEMPTS} attempts. Observed ${lastObserved.join(", ") || "no readable files"}.${detail}`);
}

async function readThemeFiles(env, themeGid, filenames) {
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const data = await shopifyGraphQL(config, auth, `query KairosResilientThemeFiles($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } userErrors { code filename } } } }`, { themeId: themeGid, filenames, first: filenames.length });
  const connection = data?.theme?.files;
  const errors = Array.isArray(connection?.userErrors) ? connection.userErrors.filter(error => error?.code && error.code !== "NOT_FOUND") : [];
  if (errors.length) throw httpError(502, "theme_file_read_failed", errors.map(error => error.code).join(", "));
  const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
  const files = [];
  for (const filename of filenames) {
    const node = nodes.find(item => item?.filename === filename);
    const content = bodyToText(node?.body);
    if (content) files.push({ filename, content, sha256: await hashText(content) });
  }
  return files;
}

function validateThemeBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_kairos_staging_required", "Verified Kairos Staging is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN" || mainTheme.gid === stagingTheme.gid) throw httpError(409, "main_theme_boundary_invalid", "The Shopify MAIN theme boundary could not be verified.");
}
function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  return { storeDomain, apiVersion };
}
async function resolveAccessToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const key = `${config.storeDomain}:${clientId}`;
    const cached = tokenCache.get(key);
    if (cached?.expiresAt > Date.now()) return { token: cached.token };
    const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
    const body = await safeResponseJSON(response);
    const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
    if (!response.ok || !token) throw httpError(401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `HTTP ${response.status}`));
    tokenCache.set(key, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { token };
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw httpError(503, "shopify_not_configured", "Shopify credentials are not configured.");
  return { token };
}
async function shopifyGraphQL(config, auth, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) });
  const body = await safeResponseJSON(response);
  if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `HTTP ${response.status}`);
  if (Array.isArray(body?.errors) && body.errors.length) throw httpError(422, "shopify_graphql_error", body.errors.map(error => error?.message).filter(Boolean).join("; "));
  return body?.data || {};
}
function bodyToText(body) { if (typeof body?.content === "string") return body.content; if (typeof body?.contentBase64 === "string") { try { return atob(body.contentBase64); } catch { return ""; } } return ""; }
function storefrontOrigin(env) { return String(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com").replace(/\/+$/, ""); }
function stagingPreviewURL(env, gid) { const id = String(gid || "").split("/").pop(); return `${storefrontOrigin(env)}/?preview_theme_id=${encodeURIComponent(id)}`; }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function safeRequestJSON(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Canonical-Homepage-Resilient": KAIROS_CANONICAL_HOMEPAGE_RESILIENT_BUILD } }); }
