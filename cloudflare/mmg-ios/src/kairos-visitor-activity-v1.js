import { createWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-visitor-activity-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 30;

export async function runVisitorReview(request, payload = {}) {
  const objective = clean(payload.objective || "Review current verified visitor activity.", 2400);
  const requestedPeriod = clean(payload.period || "current verified snapshot", 180);
  const analytics = await fetchAnalytics(request);
  const metrics = Array.isArray(analytics?.analytics?.metrics) ? analytics.analytics.metrics : [];
  const available = metrics.filter(metric => metric.status === "available");
  const restricted = metrics.filter(metric => metric.status === "authorization-required");
  const visitorMetrics = available.filter(metric => /session|visitor|customer|conversion|bounce|traffic|view/i.test(`${metric.id || ""} ${metric.label || ""}`));
  const now = new Date().toISOString();

  const report = {
    id: `visitor-review-${crypto.randomUUID()}`,
    build: BUILD,
    status: visitorMetrics.length ? "verified-visitor-snapshot-ready" : "authorization-or-coverage-required",
    objective,
    requestedPeriod,
    coverage: {
      label: analytics?.analytics?.period || "current Shopify snapshot",
      generatedAt: now,
      qualification: "This review reports only aggregate visitor and customer metrics returned by the authoritative Shopify analytics endpoint. It does not identify individual visitors or infer unsupported history.",
    },
    metrics: visitorMetrics.map(metric => ({
      id: metric.id || slug(metric.label),
      label: metric.label || metric.id,
      value: metric.value ?? null,
      displayValue: metric.displayValue ?? "—",
      source: "ShopifyQL",
      status: "verified",
    })),
    findings: buildFindings(visitorMetrics, restricted),
    privacy: {
      individualVisitorIdentification: false,
      inferredIdentity: false,
      personalProfiling: false,
      aggregateEvidenceOnly: true,
      inventedData: false,
    },
    nextActions: buildActions(visitorMetrics, restricted),
  };

  let workflow = null;
  if (payload.createWorkflow !== false) {
    workflow = await createWorkflow(request, {
      title: `Visitor Activity · ${requestedPeriod}`,
      objective: `${objective} Use only the verified aggregate evidence attached to report ${report.id}.`,
      center: "customers",
      priority: payload.priority || "normal",
      approvalRequired: false,
      owner: "Visitor Activity",
      source: "customers/visitor-activity",
      tasks: [
        { title: "Confirm visitor-data coverage", description: report.coverage.qualification },
        { title: "Review verified behavior signals", description: `Inspect ${visitorMetrics.length} supported aggregate visitor metric${visitorMetrics.length === 1 ? "" : "s"}.` },
        { title: "Identify journey friction", description: "Document only evidence-supported acquisition, engagement, conversion, or navigation friction." },
        { title: "Choose one customer-experience action", description: "Select one bounded improvement with a measurable success condition." },
        { title: "Measure the next visitor snapshot", description: "Run the next authoritative review and preserve comparable evidence." },
      ],
    });
  }

  await caches.default.put(reportRequest(request, report.id), stored(report));
  await caches.default.put(latestRequest(request), stored(report));
  return { report, workflow };
}

export async function readVisitorReview(request, reportID) {
  const response = await caches.default.match(reportRequest(request, reportID));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

export async function readLatestVisitorReview(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

async function fetchAnalytics(request) {
  const url = new URL("/api/analytics/shopify", request.url);
  url.searchParams.set("visitorReview", crypto.randomUUID());
  const headers = new Headers();
  const cookie = request.headers.get("Cookie");
  const authorization = request.headers.get("Authorization");
  if (cookie) headers.set("Cookie", cookie);
  if (authorization) headers.set("Authorization", authorization);
  headers.set("X-MMG-Visitor-Activity", BUILD);
  const response = await fetch(new Request(url.toString(), { method: "GET", headers }));
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: { message: text } }; }
  if (!response.ok) throw new Error(body?.error?.message || body?.message || "Visitor analytics could not be read.");
  return body;
}

function buildFindings(metrics, restricted) {
  const findings = metrics.map(metric => ({ severity: Number(metric.value) === 0 ? "attention" : "info", title: metric.label || metric.id, detail: `${metric.displayValue ?? metric.value ?? "—"} in the verified aggregate snapshot.` }));
  if (!metrics.length) findings.push({ severity: "blocked", title: "Visitor evidence unavailable", detail: "The current analytics response did not contain supported visitor metrics." });
  if (restricted.length) findings.push({ severity: "attention", title: "Partial analytics coverage", detail: `${restricted.length} metric${restricted.length === 1 ? " is" : "s are"} restricted by current authorization.` });
  return findings;
}
function buildActions(metrics, restricted) {
  const actions = [];
  if (restricted.length) actions.push("Resolve the documented analytics authorization gap before making broader journey conclusions.");
  if (!metrics.length) actions.push("Confirm that Shopify visitor analytics are available for the connected store.");
  actions.push("Choose one measurable visitor or customer-journey improvement based on verified evidence.");
  actions.push("Run another aggregate snapshot after the change and preserve the comparison.");
  return actions;
}
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function slug(value) { return clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function reportRequest(request, id) { return new Request(new URL(`/_kairos/visitor-activity/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/visitor-activity/latest", request.url).toString(), { method: "GET" }); }
