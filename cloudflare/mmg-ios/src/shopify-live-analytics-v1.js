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
    { id: "units_sold", label: "Units sold", format: "integer", ql: "FROM sales SHOW units_sold DURING today" },
  ];

  let auth = await resolveToken(config, env);
  let scopeState = await readGrantedScopes(config, auth);
  let results = await Promise.all(queries.map(item => runMetric(config, auth, item)));

  if (auth.credentialPath === "client-credentials" && results.every(item => item.status === "authorization-required")) {
    invalidateCachedToken(config, env);
    auth = await resolveToken(config, env, true);
    scopeState = await readGrantedScopes(config, auth);
    results = await Promise.all(queries.map(item => runMetric(config, auth, item)));
  }

  const unavailable = results.filter(item => item.status !== "available");
  const errors = [...new Set(unavailable.map(item => item.error).filter(Boolean))];
  const protectedCustomerDataRequired = errors.some(message => /protected customer data|level 2|customer data/i.test(message));
  const readReportsGranted = scopeState.scopes.includes("read_reports");

  return {
    status: unavailable.length === results.length ? "unavailable" : unavailable.length ? "partial" : "ready",
    source: "shopifyql-admin-api",
    credentialPath: auth.credentialPath,
    period: "today",
    checkedAt: new Date().toISOString(),
    metrics: results,
    authorization: {
      scopeInspectionStatus: scopeState.status,
      grantedScopes: scopeState.scopes,
      readReportsGranted,
      protectedCustomerDataRequired,
      tokenRefreshedOnAuthorizationFailure: auth.credentialPath === "client-credentials",
      exactErrors: errors,
    },
    requirements: [
      ...(!readReportsGranted ? ["Add and release the read_reports scope in the Shopify app version."] : []),
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

function tokenCacheKey(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  return clientId ? `${config.storeDomain}:${clientId}` : "";
}

function invalidateCachedToken(config, env) {
  const key = tokenCacheKey(config, env);
  if (key) tokenCache.delete(key);
}

async function resolveToken(config, env, forceRefresh = false) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const key = tokenCacheKey(config, env);
    if (!forceRefresh) {
      const cached = tokenCache.get(key);
      if (cached?.expiresAt > Date.now()) return { token: cached.token, credentialPath: "client-credentials" };
    }
    const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
    });
    const body = await safeJSON(response);
    const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
    if (!response.ok || !token) throw new Error(String(body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`));
    tokenCache.set(key, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { token, credentialPath: "client-credentials" };
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw new Error("Shopify client credentials or an Admin access token must be configured.");
  return { token, credentialPath: "admin-access-token" };
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
