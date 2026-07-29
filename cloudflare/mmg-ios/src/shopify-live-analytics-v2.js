const BUILD = "kairos-shopify-analytics-20260729-4";
const TIMEOUT_MS = 25000;

const METRICS = Object.freeze([
  { id: "sessions", label: "Online store sessions", format: "integer", ql: "FROM sessions SHOW sessions DURING today" },
  { id: "conversion_rate", label: "Conversion rate", format: "percent", ql: "FROM sessions SHOW conversion_rate DURING today" },
  { id: "total_sales", label: "Total sales", format: "money", ql: "FROM sales SHOW total_sales DURING today" },
  { id: "orders", label: "Orders", format: "integer", ql: "FROM sales SHOW orders DURING today" },
  { id: "average_order_value", label: "Average order value", format: "money", ql: "FROM sales SHOW average_order_value DURING today" },
  { id: "customers", label: "Customers", format: "integer", ql: "FROM sales SHOW customers DURING today" },
  { id: "net_items_sold", label: "Net items sold", format: "integer", ql: "FROM sales SHOW net_items_sold DURING today" },
]);

export async function readShopifyDashboardAnalyticsV2(env = {}) {
  const config = readConfig(env);
  const selection = await selectWorkingCredential(config, env);

  if (!selection.auth) {
    return unavailable(selection.attempts, selection.configuration);
  }

  const metrics = await Promise.all(METRICS.map((metric) => runMetric(config, selection.auth, metric)));
  const unavailableMetrics = metrics.filter((metric) => metric.status !== "available");
  const errors = [...new Set(unavailableMetrics.map((metric) => metric.error).filter(Boolean))];
  const scopes = selection.auth.grantedScopes;

  return Object.freeze({
    status: unavailableMetrics.length === metrics.length ? "unavailable" : unavailableMetrics.length ? "partial" : "ready",
    source: "shopifyql-admin-api",
    build: BUILD,
    credentialPath: selection.auth.credentialPath,
    period: "today",
    checkedAt: new Date().toISOString(),
    metrics: Object.freeze(metrics),
    authorization: Object.freeze({
      scopeInspectionStatus: selection.auth.scopeInspectionStatus,
      grantedScopes: Object.freeze(scopes),
      readReportsGranted: scopes.includes("read_reports") || selection.auth.shopifyQLVerified,
      protectedCustomerDataRequired: errors.some((message) => /protected customer data|level 2|customer data/i.test(message)),
      credentialCandidatesChecked: Object.freeze(selection.attempts),
      exactErrors: Object.freeze(errors),
      shopifyQLVerified: selection.auth.shopifyQLVerified,
    }),
    requirements: Object.freeze(errors),
  });
}

async function selectWorkingCredential(config, env) {
  const definitions = credentialDefinitions(env);
  const attempts = [];

  for (const definition of definitions) {
    try {
      const token = definition.type === "client_credentials"
        ? await exchangeClientCredentials(config, definition)
        : definition.token;
      const scopeState = await inspectScopes(config, token);
      await runShopifyQL(config, token, "FROM sales SHOW orders DURING today");
      attempts.push(publicAttempt(definition.path, "verified", scopeState.status, scopeState.scopes));
      return {
        auth: Object.freeze({
          token,
          credentialPath: definition.path,
          grantedScopes: scopeState.scopes,
          scopeInspectionStatus: scopeState.status,
          shopifyQLVerified: true,
        }),
        attempts: Object.freeze(attempts),
        configuration: configuration(env),
      };
    } catch (error) {
      attempts.push(publicAttempt(definition.path, "rejected", "unavailable", [], error));
    }
  }

  return { auth: null, attempts: Object.freeze(attempts), configuration: configuration(env) };
}

function credentialDefinitions(env) {
  const definitions = [];
  const seen = new Set();
  const clientPairs = [
    ["client-credentials", env.SHOPIFY_CLIENT_ID, env.SHOPIFY_CLIENT_SECRET],
    ["api-key-credentials", env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET],
    ["app-client-credentials", env.SHOPIFY_APP_CLIENT_ID, env.SHOPIFY_APP_CLIENT_SECRET],
    ["client-secret-key-credentials", env.SHOPIFY_CLIENT_ID, env.SHOPIFY_CLIENT_SECRET_KEY],
  ];

  for (const [path, rawId, rawSecret] of clientPairs) {
    const clientId = clean(rawId);
    const clientSecret = clean(rawSecret);
    const key = `${clientId}:${clientSecret}`;
    if (!clientId || !clientSecret || seen.has(key)) continue;
    seen.add(key);
    definitions.push({ type: "client_credentials", path, clientId, clientSecret });
  }

  const staticTokens = [
    ["admin-access-token", env.SHOPIFY_ADMIN_ACCESS_TOKEN],
    ["access-token-alias", env.SHOPIFY_ACCESS_TOKEN],
    ["admin-token-alias", env.SHOPIFY_ADMIN_TOKEN],
  ];

  for (const [path, rawToken] of staticTokens) {
    const token = clean(rawToken);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    definitions.push({ type: "static", path, token });
  }

  return definitions;
}

async function exchangeClientCredentials(config, definition) {
  const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: definition.clientId,
      client_secret: definition.clientSecret,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  const token = clean(body?.access_token);
  if (!response.ok || !token) {
    throw new Error(clean(body?.error_description || body?.error || body?.message) || `Shopify token exchange returned HTTP ${response.status}.`);
  }
  return token;
}

async function inspectScopes(config, token) {
  try {
    const data = await graphQL(config, token, "query KairosGrantedScopes { currentAppInstallation { accessScopes { handle } } }", {});
    const scopes = Array.isArray(data?.currentAppInstallation?.accessScopes)
      ? data.currentAppInstallation.accessScopes.map((item) => clean(item?.handle)).filter(Boolean).sort()
      : [];
    return { status: "verified", scopes };
  } catch {
    return { status: "unavailable", scopes: [] };
  }
}

async function runMetric(config, auth, metric) {
  try {
    const payload = await runShopifyQL(config, auth.token, metric.ql);
    const rows = Array.isArray(payload?.tableData?.rows) ? payload.tableData.rows : [];
    const row = rows[0] && typeof rows[0] === "object" ? rows[0] : {};
    const raw = row[metric.id] ?? Object.values(row)[0] ?? null;
    return Object.freeze({
      ...metric,
      status: "available",
      value: raw,
      displayValue: raw === null || raw === undefined || raw === "" ? "—" : formatValue(raw, metric.format),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify analytics request failed.";
    const authorization = /read_reports|access denied|permission|protected customer data|level 2|unauthorized|invalid access token/i.test(message);
    return Object.freeze({ ...metric, status: authorization ? "authorization-required" : "unavailable", value: null, error: message.slice(0, 500) });
  }
}

async function runShopifyQL(config, token, query) {
  const data = await graphQL(
    config,
    token,
    "query KairosAnalytics($query: String!) { shopifyqlQuery(query: $query) { tableData { columns { name dataType displayName } rows } parseErrors } }",
    { query },
  );
  const payload = data?.shopifyqlQuery;
  const parseErrors = Array.isArray(payload?.parseErrors) ? payload.parseErrors.filter(Boolean) : [];
  if (parseErrors.length) throw new Error(parseErrors.join("; "));
  if (!payload) throw new Error("ShopifyQL returned no analytics payload.");
  return payload;
}

async function graphQL(config, token, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) throw new Error(body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw new Error(body.errors.map((item) => item?.message).filter(Boolean).join("; "));
  return body?.data || {};
}

function unavailable(attempts, config) {
  const errors = attempts.map((attempt) => `${attempt.credentialPath}: ${attempt.error}`).filter(Boolean);
  return Object.freeze({
    status: "unavailable",
    source: "shopifyql-admin-api",
    build: BUILD,
    checkedAt: new Date().toISOString(),
    metrics: Object.freeze(METRICS.map((metric) => Object.freeze({ ...metric, status: "authorization-required", value: null }))),
    authorization: Object.freeze({
      scopeInspectionStatus: "unavailable",
      grantedScopes: Object.freeze([]),
      readReportsGranted: false,
      protectedCustomerDataRequired: false,
      credentialCandidatesChecked: attempts,
      exactErrors: Object.freeze(errors),
      configuration: config,
    }),
    requirements: Object.freeze(errors.length ? errors : ["No usable Shopify credential was available to the Worker runtime."]),
  });
}

function publicAttempt(credentialPath, status, scopeInspectionStatus, grantedScopes, error) {
  return Object.freeze({
    credentialPath,
    status,
    scopeInspectionStatus,
    grantedScopes: Object.freeze(grantedScopes),
    error: error instanceof Error ? error.message.slice(0, 300) : error ? String(error).slice(0, 300) : "",
  });
}

function configuration(env) {
  return Object.freeze({
    clientCredentials: Boolean(clean(env.SHOPIFY_CLIENT_ID) && clean(env.SHOPIFY_CLIENT_SECRET)),
    apiKeyCredentials: Boolean(clean(env.SHOPIFY_API_KEY) && clean(env.SHOPIFY_API_SECRET)),
    appClientCredentials: Boolean(clean(env.SHOPIFY_APP_CLIENT_ID) && clean(env.SHOPIFY_APP_CLIENT_SECRET)),
    clientSecretKeyCredentials: Boolean(clean(env.SHOPIFY_CLIENT_ID) && clean(env.SHOPIFY_CLIENT_SECRET_KEY)),
    adminAccessToken: Boolean(clean(env.SHOPIFY_ADMIN_ACCESS_TOKEN)),
    accessTokenAlias: Boolean(clean(env.SHOPIFY_ACCESS_TOKEN)),
    adminTokenAlias: Boolean(clean(env.SHOPIFY_ADMIN_TOKEN)),
  });
}

function readConfig(env) {
  const storeDomain = clean(env.SHOPIFY_STORE_DOMAIN).toLowerCase();
  const apiVersion = clean(env.SHOPIFY_API_VERSION || "2026-07");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw new Error("The Shopify store domain is invalid.");
  return { storeDomain, apiVersion };
}

function formatValue(raw, format) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return String(raw);
  if (format === "percent") return `${(value <= 1 ? value * 100 : value).toFixed(2)}%`;
  if (format === "money") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

async function safeJSON(response) {
  try { return await response.json(); } catch { return {}; }
}

function clean(value) {
  return String(value || "").trim();
}
