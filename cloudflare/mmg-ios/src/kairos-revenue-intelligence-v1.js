import { createWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-revenue-intelligence-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 30;

export async function runRevenueReview(request, payload = {}) {
  const objective = clean(payload.objective || "Review current verified commerce performance.", 3000);
  const requestedPeriod = clean(payload.period || "current verified snapshot", 180);
  const analytics = await fetchAuthoritativeAnalytics(request);
  const metrics = Array.isArray(analytics?.analytics?.metrics) ? analytics.analytics.metrics : [];
  const available = metrics.filter(metric => metric.status === "available");
  const restricted = metrics.filter(metric => metric.status === "authorization-required");
  const values = Object.fromEntries(available.map(metric => [metric.id || metric.label, metric]));
  const now = new Date().toISOString();

  const report = {
    id: `revenue-review-${crypto.randomUUID()}`,
    build: BUILD,
    status: available.length ? "verified-snapshot-ready" : "authorization-required",
    objective,
    requestedPeriod,
    coverage: {
      label: analytics?.analytics?.period || "today/current Shopify snapshot",
      requestedPeriodSatisfied: requestedPeriod.toLowerCase().includes("today") || requestedPeriod.toLowerCase().includes("current"),
      qualification: "This review reports only metrics returned by the authoritative Shopify analytics endpoint. It does not infer missing history or unsupported period totals.",
      generatedAt: now,
    },
    metrics: available.map(metric => ({
      id: metric.id || slug(metric.label),
      label: metric.label || metric.id,
      value: metric.value ?? null,
      displayValue: metric.displayValue ?? "—",
      status: "verified",
      source: "ShopifyQL",
    })),
    findings: buildFindings(values, available, restricted),
    restrictions: {
      restrictedMetricCount: restricted.length,
      authorization: analytics?.analytics?.authorization || null,
      inventedData: false,
      extrapolationPerformed: false,
      externalPublicationAutomatic: false,
    },
    nextActions: buildNextActions(values, restricted),
  };

  let workflow = null;
  if (payload.createWorkflow !== false) {
    workflow = await createWorkflow(request, {
      title: `Revenue Review · ${requestedPeriod}`,
      objective: `${objective} Use only the verified revenue snapshot attached to review ${report.id}.`,
      center: "business",
      priority: payload.priority || "normal",
      approvalRequired: false,
      owner: "Revenue Intelligence",
      source: "business/revenue-intelligence",
      tasks: [
        { title: "Confirm analytics coverage", description: report.coverage.qualification },
        { title: "Review verified metrics", description: `Inspect ${available.length} available Shopify metric${available.length === 1 ? "" : "s"}.` },
        { title: "Identify revenue constraints", description: "Document conversion, order, pricing, or authorization constraints supported by evidence." },
        { title: "Choose bounded business action", description: "Select a measurable next action without inventing projections." },
        { title: "Measure the next verified snapshot", description: "Run the next authoritative review and compare only supported periods." },
      ],
    });
  }

  await caches.default.put(reportRequest(request, report.id), stored(report));
  await caches.default.put(latestRequest(request), stored(report));
  return { report, workflow };
}

export async function readRevenueReview(request, reportID) {
  const response = await caches.default.match(reportRequest(request, reportID));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

export async function readLatestRevenueReview(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

async function fetchAuthoritativeAnalytics(request) {
  const url = new URL("/api/analytics/shopify", request.url);
  url.searchParams.set("revenueReview", crypto.randomUUID());
  const headers = new Headers();
  const cookie = request.headers.get("Cookie");
  const authorization = request.headers.get("Authorization");
  if (cookie) headers.set("Cookie", cookie);
  if (authorization) headers.set("Authorization", authorization);
  headers.set("X-MMG-Revenue-Intelligence", BUILD);
  const response = await fetch(new Request(url.toString(), { method: "GET", headers }));
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: { message: text } }; }
  if (!response.ok) throw new Error(body?.error?.message || body?.message || "Shopify analytics could not be read.");
  return body;
}

function buildFindings(values, available, restricted) {
  const findings = [];
  const sales = findMetric(values, ["total_sales", "total sales"]);
  const orders = findMetric(values, ["orders"]);
  const conversion = findMetric(values, ["conversion_rate", "conversion rate"]);
  const aov = findMetric(values, ["average_order_value", "average order value"]);
  if (sales) findings.push({ severity: "info", title: "Verified sales snapshot", detail: `${sales.label}: ${sales.displayValue}.` });
  if (orders) findings.push({ severity: Number(orders.value) === 0 ? "attention" : "info", title: "Order activity", detail: `${orders.label}: ${orders.displayValue}.` });
  if (conversion) findings.push({ severity: Number(conversion.value) === 0 ? "attention" : "info", title: "Conversion signal", detail: `${conversion.label}: ${conversion.displayValue}.` });
  if (aov) findings.push({ severity: "info", title: "Order value", detail: `${aov.label}: ${aov.displayValue}.` });
  if (!available.length) findings.push({ severity: "blocked", title: "Revenue evidence unavailable", detail: "The current Shopify authorization did not return verified commerce metrics." });
  if (restricted.length) findings.push({ severity: "attention", title: "Partial analytics coverage", detail: `${restricted.length} metric${restricted.length === 1 ? " is" : "s are"} blocked by current authorization.` });
  return findings;
}

function buildNextActions(values, restricted) {
  const actions = [];
  const orders = findMetric(values, ["orders"]);
  const conversion = findMetric(values, ["conversion_rate", "conversion rate"]);
  if (restricted.length) actions.push("Resolve the documented Shopify analytics authorization gap before making period-wide conclusions.");
  if (orders && Number(orders.value) === 0) actions.push("Review the current acquisition-to-checkout path and choose one measurable conversion intervention.");
  if (conversion && Number(conversion.value) === 0) actions.push("Inspect visitor evidence, product-page readiness, and checkout friction before changing pricing.");
  actions.push("Run another verified snapshot after the selected action and preserve the comparison evidence.");
  return actions;
}

function findMetric(values, candidates) {
  for (const [key, metric] of Object.entries(values)) {
    const normalized = `${key} ${metric.label || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (candidates.some(candidate => normalized.includes(candidate.replaceAll("_", " ")))) return metric;
  }
  return null;
}
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function slug(value) { return clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function reportRequest(request, id) { return new Request(new URL(`/_kairos/revenue-intelligence/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/revenue-intelligence/latest", request.url).toString(), { method: "GET" }); }
