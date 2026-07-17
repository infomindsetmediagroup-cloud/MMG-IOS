const SHOPIFY_TIMEOUT_MS = 25_000;
const DUPLICATE_TIMEOUT_MS = 180_000;
const DUPLICATE_POLL_MS = 2_000;
const tokenCache = new Map();

const STAGING_NAME = "Kairos Staging";
const REQUIRED_FILES = Object.freeze([
  "layout/theme.liquid",
  "config/settings_schema.json",
  "config/settings_data.json",
  "templates/index.json",
]);

export const KAIROS_FULL_THEME_BASELINE_BUILD = "kairos-full-theme-main-baseline-20260717-1";

export async function restoreApprovedHomepageBaseline(env) {
  const config = readConfig(env);
  const auth = await resolveToken(config, env);
  const themes = await readThemes(config, auth);
  const mainTheme = themes.find(theme => theme?.role === "MAIN") || null;
  const existingStaging = themes.find(theme => theme?.role !== "MAIN" && normalizeName(theme?.name) === normalizeName(STAGING_NAME)) || null;

  if (!mainTheme?.id) throw controlledError("main_theme_not_found", "The current live Shopify MAIN theme could not be verified.");

  const stamp = compactTimestamp();
  let archivedTheme = null;
  let duplicatedTheme = null;

  try {
    if (existingStaging?.id) {
      archivedTheme = await renameTheme(config, auth, existingStaging.id, `Kairos Archive ${stamp}`);
    }

    duplicatedTheme = await duplicateTheme(config, auth, mainTheme.id, STAGING_NAME);
    const readyTheme = await waitForReadyTheme(config, auth, duplicatedTheme.id);
    const verification = await verifyHomepageBaseline(config, auth, mainTheme, readyTheme);

    return {
      status: "completed",
      build: KAIROS_FULL_THEME_BASELINE_BUILD,
      actionType: "shopify.staging.full-theme-main-duplicate",
      completedAt: new Date().toISOString(),
      sourceTheme: summarize(mainTheme),
      targetTheme: summarize(readyTheme),
      archivedTheme: archivedTheme ? summarize(archivedTheme) : null,
      sourceHash: verification.files.find(file => file.filename === "templates/index.json")?.sourceSha256 || "",
      previousStagingHash: "archived-full-theme",
      verifiedHash: verification.files.find(file => file.filename === "templates/index.json")?.targetSha256 || "",
      verification,
      fullThemeDuplicate: true,
      sourceOfTruth: "current-live-main-theme",
      liveThemeChanged: false,
      stagingOnly: true,
    };
  } catch (error) {
    await recoverFailedRefresh(config, auth, duplicatedTheme, archivedTheme, stamp);
    throw error;
  }
}

async function verifyHomepageBaseline(config, auth, mainTheme, stagingTheme) {
  const mainTemplate = await readThemeFiles(config, auth, mainTheme.id, ["templates/index.json"]);
  const templateSource = mainTemplate.get("templates/index.json")?.content || "";
  if (!templateSource) throw controlledError("main_homepage_template_missing", "The current MAIN homepage template could not be read.");

  const sectionFiles = deriveSectionFiles(parseShopifyJson(templateSource));
  const filenames = [...new Set([...REQUIRED_FILES, ...sectionFiles])].slice(0, 50);
  const deadline = Date.now() + DUPLICATE_TIMEOUT_MS;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const [sourceFiles, targetFiles] = await Promise.all([
        readThemeFiles(config, auth, mainTheme.id, filenames),
        readThemeFiles(config, auth, stagingTheme.id, filenames),
      ]);
      const files = [];
      for (const filename of filenames) {
        const source = sourceFiles.get(filename);
        const target = targetFiles.get(filename);
        if (!source?.content) {
          if (REQUIRED_FILES.includes(filename)) throw controlledError("main_required_file_missing", `MAIN is missing required theme file ${filename}.`);
          continue;
        }
        if (!target?.content) throw controlledError("duplicate_file_missing", `The fresh staging duplicate is missing ${filename}.`);
        if (source.sha256 !== target.sha256 || source.content !== target.content) {
          throw controlledError("duplicate_file_mismatch", `The fresh staging duplicate does not exactly match MAIN for ${filename}.`);
        }
        files.push({
          filename,
          sourceSha256: source.sha256,
          targetSha256: target.sha256,
          matched: true,
        });
      }
      for (const required of REQUIRED_FILES) {
        if (!files.some(file => file.filename === required)) throw controlledError("duplicate_required_file_unverified", `The fresh staging duplicate could not verify ${required}.`);
      }
      return {
        status: "verified",
        fullThemeDuplicate: true,
        requiredFilesVerified: true,
        homepageSectionFilesVerified: sectionFiles.filter(filename => files.some(file => file.filename === filename)),
        files,
      };
    } catch (error) {
      lastError = error;
      await sleep(DUPLICATE_POLL_MS);
    }
  }

  throw controlledError(
    lastError?.code || "duplicate_verification_timeout",
    lastError instanceof Error ? lastError.message : "The fresh staging duplicate could not be verified before timeout.",
  );
}

async function recoverFailedRefresh(config, auth, duplicatedTheme, archivedTheme, stamp) {
  try {
    if (duplicatedTheme?.id) await renameTheme(config, auth, duplicatedTheme.id, `Kairos Failed ${stamp}`);
  } catch {}
  try {
    if (archivedTheme?.id) await renameTheme(config, auth, archivedTheme.id, STAGING_NAME);
  } catch {}
}

async function readThemes(config, auth) {
  const data = await graphql(config, auth, `query KairosThemes { themes(first: 50) { nodes { id name role processing processingFailed createdAt updatedAt } } }`, {});
  return Array.isArray(data?.themes?.nodes) ? data.themes.nodes : [];
}

async function renameTheme(config, auth, themeId, name) {
  const data = await graphql(config, auth, `mutation KairosThemeRename($id: ID!, $input: OnlineStoreThemeInput!) { themeUpdate(id: $id, input: $input) { theme { id name role processing processingFailed createdAt updatedAt } userErrors { field message } } }`, {
    id: themeId,
    input: { name },
  });
  const payload = data?.themeUpdate;
  const errors = Array.isArray(payload?.userErrors) ? payload.userErrors.filter(error => error?.message) : [];
  if (errors.length) throw controlledError("theme_rename_rejected", errors.map(error => error.message).join("; "));
  if (!payload?.theme?.id) throw controlledError("theme_rename_unconfirmed", `Shopify did not confirm renaming theme ${themeId}.`);
  return payload.theme;
}

async function duplicateTheme(config, auth, sourceThemeId, name) {
  const data = await graphql(config, auth, `mutation KairosThemeDuplicate($id: ID!, $name: String) { themeDuplicate(id: $id, name: $name) { newTheme { id name role processing processingFailed createdAt updatedAt } userErrors { code field message } } }`, {
    id: sourceThemeId,
    name,
  });
  const payload = data?.themeDuplicate;
  const errors = Array.isArray(payload?.userErrors) ? payload.userErrors.filter(error => error?.message) : [];
  if (errors.length) throw controlledError("theme_duplicate_rejected", errors.map(error => error.message).join("; "));
  if (!payload?.newTheme?.id) throw controlledError("theme_duplicate_unconfirmed", "Shopify did not return the fresh staging theme.");
  return payload.newTheme;
}

async function waitForReadyTheme(config, auth, themeId) {
  const deadline = Date.now() + DUPLICATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const data = await graphql(config, auth, `query KairosThemeReady($id: ID!) { theme(id: $id) { id name role processing processingFailed createdAt updatedAt } }`, { id: themeId });
    const theme = data?.theme || null;
    if (!theme?.id) throw controlledError("duplicated_theme_not_found", "Shopify no longer returns the duplicated staging theme.");
    if (theme.processingFailed) throw controlledError("duplicated_theme_processing_failed", "Shopify reported that the duplicated staging theme failed processing.");
    if (!theme.processing) return theme;
    await sleep(DUPLICATE_POLL_MS);
  }
  throw controlledError("duplicated_theme_processing_timeout", "The fresh staging theme did not finish processing before timeout.");
}

async function readThemeFiles(config, auth, themeId, filenames) {
  const normalized = [...new Set((Array.isArray(filenames) ? filenames : []).map(value => String(value || "").trim()).filter(Boolean))];
  if (!normalized.length || normalized.length > 50) throw controlledError("theme_file_request_invalid", "Theme verification requires between one and fifty files.");
  const data = await graphql(config, auth, `query KairosThemeFiles($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename contentType body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } userErrors { code filename } } } }`, {
    themeId,
    filenames: normalized,
    first: normalized.length,
  });
  const connection = data?.theme?.files;
  const errors = Array.isArray(connection?.userErrors) ? connection.userErrors.filter(error => error?.code && error.code !== "NOT_FOUND") : [];
  if (errors.length) throw controlledError("theme_file_read_failed", errors.map(error => `${error.filename || "theme file"}: ${error.code}`).join("; "));
  const map = new Map();
  for (const node of Array.isArray(connection?.nodes) ? connection.nodes : []) {
    const content = bodyToText(node?.body);
    if (!node?.filename || !content) continue;
    map.set(node.filename, {
      filename: node.filename,
      content,
      sha256: await hashText(content),
      contentType: node?.contentType || "",
    });
  }
  return map;
}

function deriveSectionFiles(document) {
  return [...new Set(Object.values(document?.sections || {})
    .map(section => String(section?.type || "").trim().toLowerCase())
    .filter(type => /^[a-z0-9_-]+$/.test(type) && type !== "apps")
    .map(type => `sections/${type}.liquid`))].slice(0, 44);
}

function parseShopifyJson(source) {
  const text = String(source || "").replace(/^\uFEFF/, "");
  const trimmed = text.trimStart();
  const candidate = trimmed.startsWith("/*")
    ? text.slice(text.indexOf("*/", text.length - trimmed.length + 2) + 2).trimStart()
    : text;
  try { return JSON.parse(candidate); }
  catch (error) { throw controlledError("shopify_json_invalid", `The MAIN homepage template is invalid JSON: ${error instanceof Error ? error.message : "parse failed"}.`); }
}

function readConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw controlledError("shopify_invalid_domain", "The Shopify store domain is invalid.");
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) throw controlledError("shopify_invalid_version", "The Shopify API version is invalid.");
  return { storeDomain, apiVersion };
}

async function resolveToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const cacheKey = `${config.storeDomain}:${clientId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached?.expiresAt > Date.now()) return cached.token;
    const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
    });
    const body = await safeJSON(response);
    const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
    if (!response.ok || !token) throw controlledError("shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`).slice(0, 500));
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return token;
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw controlledError("shopify_not_configured", "Shopify credentials are not configured.");
  return token;
}

async function graphql(config, token, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) throw controlledError("shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw controlledError("shopify_graphql_error", body.errors.map(error => error?.message).filter(Boolean).join("; "));
  return body?.data || {};
}

function bodyToText(body) {
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") {
    try { return atob(body.contentBase64); } catch { return ""; }
  }
  return "";
}

function normalizeName(value) { return String(value || "").trim().toLowerCase(); }
function compactTimestamp() { return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14); }
function summarize(theme) { return { gid: theme.id, name: String(theme.name || ""), role: String(theme.role || ""), processing: Boolean(theme.processing), processingFailed: Boolean(theme.processingFailed) }; }
function controlledError(code, message) { return Object.assign(new Error(message), { code, status: 409 }); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function safeJSON(response) { try { return await response.json(); } catch { return {}; } }
async function hashText(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || ""))); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
