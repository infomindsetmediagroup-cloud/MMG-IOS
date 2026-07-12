const SHOPIFY_TIMEOUT_MS = 25000;
const tokenCache = new Map();

export async function readShopifyDashboardAnalytics(env) {
  const config = readConfig(env);
  const queries = [
    { id: "sessions", label: "Online store sessions", format: "integer", ql: "FROM sessions SHOW sessions DURING today" },
    { id: "conversion_rate", label: "Conversion rate", format: "percent", ql: "FROM sessions SHOW conversion_rate DURING today" },
    { id: "total_sales", label: "Total sales", format: "money", ql: "FROM sales SHOW total_sales DURING today" },
    { id: "orders", label: "Orders", format: "integer", ql: "FROM sales SHOW orders DURING today" },
    { id: "average_order_value", label: "Average order value", format: "money", ql: "FROM sales SHOW average_order_value DURING today" },
    { id: "customers", label: "Customers", format: "integer", ql: "FROM sales SHOW customers DURING today" },
    { id: "net_items_sold", label: "Net items sold", format: "integer", ql: "FROM sales SHOW net_items_sold DURING today" },
  ];

  let auth = await resolveBestToken(config, env);
  let results = await Promise.all(queries.map(item => runMetric(config, auth, item)));
  let tokenRefreshedOnAuthorizationFailure = false;

  if (results.every(item => item.status === "authorization-required")) {
    invalidateCachedToken(config, env);
    auth = await resolveBestToken(config, env, true);
    tokenRefreshedOnAuthorizationFailure = true;
    results = await Promise.all(queries.map(item => runMetric(config, auth, item)));
  }

  const unavailable = results.filter(item => item.status !== "available");
  const errors = [...new Set(unavailable.map(item => item.error).filter(Boolean))];
  const protectedCustomerDataRequired = errors.some(message => /protected customer data|level 2|customer data/i.test(message));
  const readReportsGranted = auth.grantedScopes.includes("read_reports");

  return {
    status: unavailable.length === results.length ? "unavailable" : unavailable.length ? "partial" : "ready",
    source: "shopifyql-admin-api",
    credentialPath: auth.credentialPath,
    period: "today",
    checkedAt: new Date().toISOString(),
    metrics: results,
    authorization: {
      scopeInspectionStatus: auth.scopeInspectionStatus,
      grantedScopes: auth.grantedScopes,
      readReportsGranted,
      protectedCustomerDataRequired,
      tokenRefreshedOnAuthorizationFailure,
      credentialCandidatesChecked: auth.credentialCandidatesChecked,
      exactErrors: errors,
    },
    requirements: [
      ...(!readReportsGranted ? ["No configured Shopify credential currently presents read_reports to the store installation."] : []),
      ...(protectedCustomerDataRequired ? ["Shopify is still requiring protected customer-data approval for one or more report fields."] : []),
    ],
  };
}

async function readGrantedScopes(config, auth) {
  try {
    const data = await shopifyGraphQL(config, auth, `query KairosGrantedScopes { currentAppInstallation { accessScopes { handle } } }`, {});
    const scopes = Array.isArray(data?.currentAppInstallation?.accessScopes)
      ? data.currentAppInstallation.accessScopes.map(item => String(item?.handle || "").trim()).filter(Boolean).sort()
      : [];
    return { status: "verified", scopes };
  } catch (error) {
    return { status: "unavailable", scopes: [], error: error instanceof Error ? error.message : "Scope inspection failed." };
  }
}

async function runMetric(config, auth, item) {
  try {
    const data = await shopifyGraphQL(config, auth, `query KairosAnalytics($query: String!) { shopifyqlQuery(query: $query) { tableData { columns { name dataType displayName } rows } parseErrors } }`, { query: item.ql });
    const payload = data?.shopifyqlQuery;
    const parseErrors = Array.isArray(payload?.parseErrors) ? payload.parseErrors.filter(Boolean) : [];
    if (parseErrors.length) return { ...item, status: "unavailable", value: null, error: parseErrors.join("; ") };
    const rows = Array.isArray(payload?.tableData?.rows) ? payload.tableData.rows : [];
    const row = rows[0] && typeof rows[0] === "object" ? rows[0] : {};
    const raw = row[item.id] ?? Object.values(row)[0] ?? null;
    if (raw === null || raw === undefined || raw === "") return { ...item, status: "available", value: null, displayValue: "—" };
    return { ...item, status: "available", value: raw, displayValue: formatValue(raw, item.format) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify analytics request failed.";
    const authorization = /read_reports|access denied|permission|protected customer data|level 2/i.test(message);
    return { ...item, status: authorization ? "authorization-required" : "unavailable", value: null, error: message.slice(0, 500) };
  }
}

function formatValue(raw, format) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  if (format === "percent") return `${(n <= 1 ? n * 100 : n).toFixed(2)}%`;
  if (format === "money") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function readConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw new Error("The Shopify store domain is invalid.");
  return { storeDomain, apiVersion };
}

function invalidateCachedToken(config, env) {
  for (const credential of clientCredentialCandidates(env)) {
    tokenCache.delete(tokenCacheKey(config, credential.clientId));
  }
}

async function resolveBestToken(config, env, forceRefresh = false) {
  const candidates = [];
  const adminToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();

  for (const credential of clientCredentialCandidates(env)) {
    try {
      candidates.push(await resolveClientCredentialsToken(config, credential, forceRefresh));
    } catch (error) {
      candidates.push({ credentialPath: credential.path, token: "", resolutionError: error instanceof Error ? error.message : "Client credential token request failed." });
    }
  }

  if (adminToken && !candidates.some(candidate => candidate.token === adminToken)) {
    candidates.push({ token: adminToken, credentialPath: "admin-access-token" });
  }

  const usable = candidates.filter(candidate => candidate.token);
  if (!usable.length) {
    const detail = candidates.map(candidate => candidate.resolutionError).filter(Boolean).join("; ");
    throw new Error(detail || "Shopify client credentials or an Admin access token must be configured.");
  }

  const inspected = await Promise.all(usable.map(async candidate => {
    const state = await readGrantedScopes(config, candidate);
    return {
      ...candidate,
      grantedScopes: state.scopes,
      scopeInspectionStatus: state.status,
      scopeInspectionError: state.error || "",
    };
  }));

  const selected = inspected.find(candidate => candidate.grantedScopes.includes("read_reports")) || inspected[0];
  return {
    ...selected,
    credentialCandidatesChecked: inspected.map(candidate => ({
      credentialPath: candidate.credentialPath,
      scopeInspectionStatus: candidate.scopeInspectionStatus,
      grantedScopes: candidate.grantedScopes,
    })),
  };
}

function clientCredentialCandidates(env) {
  const definitions = [
    ["client-credentials", env.SHOPIFY_CLIENT_ID, env.SHOPIFY_CLIENT_SECRET],
    ["api-key-credentials", env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET],
    ["app-client-credentials", env.SHOPIFY_APP_CLIENT_ID, env.SHOPIFY_APP_CLIENT_SECRET],
    ["client-secret-key-credentials", env.SHOPIFY_CLIENT_ID, env.SHOPIFY_CLIENT_SECRET_KEY],
  ];
  const seen = new Set();
  return definitions.flatMap(([path, rawClientId, rawClientSecret]) => {
    const clientId = String(rawClientId || "").trim();
    const clientSecret = String(rawClientSecret || "").trim();
    const key = `${clientId}:${clientSecret}`;
    if (!clientId || !clientSecret || seen.has(key)) return [];
    seen.add(key);
    return [{ path, clientId, clientSecret }];
  });
}

function tokenCacheKey(config, clientId) {
  return clientId ? `${config.storeDomain}:${clientId}` : "";
}

async function resolveClientCredentialsToken(config, credential, forceRefresh = false) {
  const key = tokenCacheKey(config, credential.clientId);

  if (!forceRefresh) {
    const cached = tokenCache.get(key);
    if (cached?.expiresAt > Date.now()) return { token: cached.token, credentialPath: credential.path };
  }

  const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: credential.clientId, client_secret: credential.clientSecret }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  if (!response.ok || !token) throw new Error(String(body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`));
  tokenCache.set(key, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
  return { token, credentialPath: credential.path };
}

async function shopifyGraphQL(config, auth, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) throw new Error(body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw new Error(body.errors.map(error => error?.message).filter(Boolean).join("; "));
  return body?.data || {};
}

async function safeJSON(response) {
  try { return await response.json(); } catch { return {}; }
}
