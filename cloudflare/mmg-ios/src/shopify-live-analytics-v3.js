import { readShopifyDashboardAnalyticsV2 } from "./shopify-live-analytics-v2.js";

const BUILD = "kairos-shopify-analytics-20260729-5";
const TIMEOUT_MS = 25000;

export async function readShopifyDashboardAnalyticsV3(env = {}) {
  const preferred = await readShopifyDashboardAnalyticsV2(env);
  if (preferred.status === "ready" || preferred.status === "partial") return preferred;

  const config = readConfig(env);
  const candidates = await credentialCandidates(config, env);
  const attempts = [];

  for (const candidate of candidates) {
    try {
      const fallback = await readOrdersAnalytics(config, candidate.token);
      return {
        status: "partial",
        source: "shopify-admin-orders-fallback",
        build: BUILD,
        credentialPath: candidate.path,
        period: "today",
        checkedAt: new Date().toISOString(),
        metrics: fallback.metrics,
        authorization: {
          scopeInspectionStatus: "orders-api-verified",
          grantedScopes: [],
          readReportsGranted: false,
          protectedCustomerDataRequired: false,
          credentialCandidatesChecked: attempts.concat([{ credentialPath: candidate.path, status: "verified-orders-api" }]),
          exactErrors: ["ShopifyQL/read_reports unavailable; core metrics are calculated from the read-only Orders API."],
          shopifyQLVerified: false,
        },
        requirements: ["Sessions and conversion rate require read_reports. Core commerce metrics are live through the Orders API fallback."],
      };
    } catch (error) {
      attempts.push({ credentialPath: candidate.path, status: "rejected", error: safeMessage(error) });
    }
  }

  return {
    ...preferred,
    build: BUILD,
    authorization: {
      ...(preferred.authorization || {}),
      credentialCandidatesChecked: attempts,
      exactErrors: attempts.map((item) => `${item.credentialPath}: ${item.error}`),
    },
  };
}

async function readOrdersAnalytics(config, token) {
  const start = startOfTodayISO();
  const query = `query KairosOrdersFallback($query: String!) {
    orders(first: 250, query: $query, sortKey: CREATED_AT) {
      nodes {
        id
        createdAt
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        customer { id }
        lineItems(first: 100) { nodes { currentQuantity } }
      }
    }
  }`;
  const data = await graphQL(config, token, query, { query: `created_at:>=${start}` });
  const orders = Array.isArray(data?.orders?.nodes) ? data.orders.nodes : [];
  let totalSales = 0;
  let items = 0;
  const customers = new Set();
  let currency = "USD";

  for (const order of orders) {
    const money = order?.currentTotalPriceSet?.shopMoney;
    const amount = Number(money?.amount || 0);
    if (Number.isFinite(amount)) totalSales += amount;
    if (money?.currencyCode) currency = money.currencyCode;
    if (order?.customer?.id) customers.add(order.customer.id);
    for (const item of order?.lineItems?.nodes || []) items += Number(item?.currentQuantity || 0);
  }

  const count = orders.length;
  const aov = count ? totalSales / count : 0;
  return {
    metrics: [
      unavailableMetric("sessions", "Online store sessions", "read_reports required"),
      unavailableMetric("conversion_rate", "Conversion rate", "read_reports required"),
      metric("total_sales", "Total sales", totalSales, money(totalSales, currency)),
      metric("orders", "Orders", count, integer(count)),
      metric("average_order_value", "Average order value", aov, money(aov, currency)),
      metric("customers", "Customers", customers.size, integer(customers.size)),
      metric("net_items_sold", "Net items sold", items, integer(items)),
    ],
  };
}

async function credentialCandidates(config, env) {
  const candidates = [];
  const seen = new Set();
  const staticTokens = [
    ["admin-access-token", env.SHOPIFY_ADMIN_ACCESS_TOKEN],
    ["access-token-alias", env.SHOPIFY_ACCESS_TOKEN],
    ["admin-token-alias", env.SHOPIFY_ADMIN_TOKEN],
  ];
  for (const [path, value] of staticTokens) {
    const token = clean(value);
    if (token && !seen.has(token)) { seen.add(token); candidates.push({ path, token }); }
  }

  const pairs = [
    ["client-credentials", env.SHOPIFY_CLIENT_ID, env.SHOPIFY_CLIENT_SECRET],
    ["api-key-credentials", env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET],
    ["app-client-credentials", env.SHOPIFY_APP_CLIENT_ID, env.SHOPIFY_APP_CLIENT_SECRET],
    ["client-secret-key-credentials", env.SHOPIFY_CLIENT_ID, env.SHOPIFY_CLIENT_SECRET_KEY],
  ];
  for (const [path, rawId, rawSecret] of pairs) {
    const clientId = clean(rawId);
    const clientSecret = clean(rawSecret);
    if (!clientId || !clientSecret) continue;
    try {
      const token = await exchange(config, clientId, clientSecret);
      if (!seen.has(token)) { seen.add(token); candidates.push({ path, token }); }
    } catch {}
  }
  return candidates;
}

async function exchange(config, clientId, clientSecret) {
  const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  const token = clean(body?.access_token);
  if (!response.ok || !token) throw new Error(body?.error_description || body?.error || `Shopify token exchange returned HTTP ${response.status}.`);
  return token;
}

async function graphQL(config, token, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw new Error(body.errors.map((item) => item?.message).filter(Boolean).join("; "));
  return body?.data || {};
}

function readConfig(env) {
  const storeDomain = clean(env.SHOPIFY_STORE_DOMAIN).toLowerCase();
  const apiVersion = clean(env.SHOPIFY_API_VERSION || "2026-07");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw new Error("The Shopify store domain is invalid.");
  return { storeDomain, apiVersion };
}
function startOfTodayISO() { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); }
function metric(id, label, value, displayValue) { return { id, label, status: "available", value, displayValue }; }
function unavailableMetric(id, label, error) { return { id, label, status: "authorization-required", value: null, error }; }
function money(value, currency) { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(Number(value) || 0); }
function integer(value) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0); }
function safeMessage(error) { return error instanceof Error ? error.message.slice(0, 300) : String(error || "Unknown error").slice(0, 300); }
function clean(value) { return String(value || "").trim(); }
