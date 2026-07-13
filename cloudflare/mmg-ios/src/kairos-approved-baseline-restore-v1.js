const SHOPIFY_TIMEOUT_MS = 25_000;
const tokenCache = new Map();

export async function restoreApprovedHomepageBaseline(env) {
  const config = readConfig(env);
  const auth = await resolveToken(config, env);
  const themes = await readThemes(config, auth);
  const mainTheme = themes.find(theme => theme?.role === "MAIN") || null;
  const stagingTheme = themes.find(theme => theme?.role !== "MAIN" && String(theme?.name || "").trim().toLowerCase() === "kairos staging") || null;

  if (!mainTheme?.id) throw new Error("The current live Shopify theme could not be verified.");
  if (!stagingTheme?.id) throw new Error("Kairos Staging could not be verified.");
  if (stagingTheme.processing || stagingTheme.processingFailed) throw new Error("Kairos Staging is not ready for baseline restoration.");

  const filename = "templates/index.json";
  const source = await readThemeFile(config, auth, mainTheme.id, filename);
  if (!source) throw new Error("The approved live homepage template could not be read.");

  const before = await readThemeFile(config, auth, stagingTheme.id, filename);
  const sourceHash = await hashText(source);
  const beforeHash = await hashText(before || "");

  await writeThemeFile(config, auth, stagingTheme.id, filename, source);

  const verified = await readThemeFile(config, auth, stagingTheme.id, filename);
  if (!verified) throw new Error("Shopify returned no staging homepage after baseline restoration.");
  const verifiedHash = await hashText(verified);
  if (verifiedHash !== sourceHash) throw new Error("The restored staging homepage did not match the approved live baseline.");

  return {
    status: "completed",
    actionType: "shopify.staging.approved-baseline.restore",
    completedAt: new Date().toISOString(),
    sourceTheme: summarize(mainTheme),
    targetTheme: summarize(stagingTheme),
    filename,
    sourceHash,
    previousStagingHash: beforeHash,
    verifiedHash,
    liveThemeChanged: false,
    stagingOnly: true,
  };
}

async function readThemes(config, auth) {
  const data = await graphql(config, auth, `query KairosThemes { themes(first: 20) { nodes { id name role processing processingFailed } } }`, {});
  return Array.isArray(data?.themes?.nodes) ? data.themes.nodes : [];
}

async function readThemeFile(config, auth, themeId, filename) {
  const data = await graphql(config, auth, `query KairosThemeFile($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } userErrors { code filename } } } }`, { themeId, filenames: [filename], first: 1 });
  const connection = data?.theme?.files;
  const errors = Array.isArray(connection?.userErrors) ? connection.userErrors.filter(error => error?.code && error.code !== "NOT_FOUND") : [];
  if (errors.length) throw new Error(`Shopify could not read ${filename}: ${errors.map(error => error.code).join(", ")}.`);
  const node = Array.isArray(connection?.nodes) ? connection.nodes.find(item => item?.filename === filename) : null;
  if (typeof node?.body?.content === "string") return node.body.content;
  if (typeof node?.body?.contentBase64 === "string") {
    try { return atob(node.body.contentBase64); } catch { return ""; }
  }
  return "";
}

async function writeThemeFile(config, auth, themeId, filename, content) {
  const data = await graphql(config, auth, `mutation KairosThemeFileRestore($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } userErrors { field message } } }`, {
    themeId,
    files: [{ filename, body: { type: "TEXT", value: content } }],
  });
  const payload = data?.themeFilesUpsert;
  const errors = Array.isArray(payload?.userErrors) ? payload.userErrors.filter(error => error?.message) : [];
  if (errors.length) throw new Error(errors.map(error => error.message).join("; "));
  const confirmed = Array.isArray(payload?.upsertedThemeFiles) && payload.upsertedThemeFiles.some(file => file?.filename === filename);
  if (!confirmed) throw new Error(`Shopify did not confirm restoring ${filename}.`);
}

function readConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw new Error("The Shopify store domain is invalid.");
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) throw new Error("The Shopify API version is invalid.");
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
    if (!response.ok || !token) throw new Error(String(body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`).slice(0, 500));
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return token;
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw new Error("Shopify credentials are not configured.");
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
  if (!response.ok) throw new Error(body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw new Error(body.errors.map(error => error?.message).filter(Boolean).join("; "));
  return body?.data || {};
}

async function safeJSON(response) { try { return await response.json(); } catch { return {}; } }
async function hashText(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || ""))); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function summarize(theme) { return { gid: theme.id, name: String(theme.name || ""), role: String(theme.role || "") }; }
