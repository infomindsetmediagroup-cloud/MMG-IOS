import { auditHomepageLinks } from "./kairos-link-lifecycle-engine-v1.js";

const BUILD = "kairos-website-intelligence-supervisor-20260713-1";
const TIMEOUT_MS = 10000;
const REPORT_CACHE_SECONDS = 60 * 60 * 18;

export async function runWebsiteIntelligenceSupervisor(request, env, trigger = "manual") {
  const origin = String(env.MMG_STOREFRONT_ORIGIN || "").trim();
  if (!origin) throw new Error("MMG storefront origin is not configured.");

  const startedAt = new Date().toISOString();
  const [homepage, links, sitemap] = await Promise.all([
    inspectHomepage(origin),
    auditHomepageLinks(origin),
    inspectSitemap(origin),
  ]);

  const findings = [
    ...homepage.findings,
    ...links.results.filter(item => item.status === "broken" || item.lifecycleDecision !== "keep").map(item => ({
      area: "Website Links",
      severity: item.status === "broken" ? "high" : "review",
      title: item.status === "broken" ? "Broken website link" : "Customer path may need improvement",
      summary: item.label || item.url,
      currentURL: item.url,
      recommendedURL: item.recommendedURL,
      confidence: item.confidence,
      rationale: item.rationale,
      authority: item.status === "broken" && item.confidence >= 0.9 ? "automatic-staging" : "approval-required",
    })),
    ...sitemap.findings,
  ];

  const approvalItems = findings
    .filter(item => item.authority === "approval-required")
    .map((item, index) => ({
      id: `website-${index + 1}`,
      businessArea: item.area,
      title: item.title,
      summary: item.summary,
      recommendation: item.recommendedURL || item.recommendation || "Review and approve the proposed correction.",
      confidence: item.confidence ?? null,
      actions: ["approve", "deny", "fix", "view-evidence"],
      evidence: item,
    }));

  const report = {
    status: "completed",
    build: BUILD,
    trigger,
    startedAt,
    completedAt: new Date().toISOString(),
    storefront: origin,
    summary: buildSummary(findings, approvalItems),
    health: {
      homepageReachable: homepage.reachable,
      homepageStatusCode: homepage.statusCode,
      linksInspected: links.inspected,
      brokenLinks: links.broken,
      lifecycleReviews: links.lifecycleReview,
      sitemapReachable: sitemap.reachable,
    },
    readyForApproval: approvalItems,
    automaticWork: findings.filter(item => item.authority === "automatic-staging"),
    informational: findings.filter(item => item.authority === "informational"),
    safeguards: {
      liveMutationPerformed: false,
      stagingMutationPerformed: false,
      externalPublishingPerformed: false,
      approvalRequiredForMaterialChanges: true,
    },
  };

  await storeLatestReport(request, report);
  return report;
}

export async function readLatestWebsiteIntelligenceReport(request) {
  const key = reportRequest(request);
  const response = await caches.default.match(key);
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

async function inspectHomepage(origin) {
  const response = await fetch(origin, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const html = await response.text();
  const findings = [];
  if (!response.ok) findings.push(finding("Website", "critical", "Homepage is unavailable", `The storefront returned HTTP ${response.status}.`, "approval-required"));
  if (!/<title>[^<]+<\/title>/i.test(html)) findings.push(finding("Search Visibility", "medium", "Homepage title is missing", "Add a clear customer-facing page title.", "approval-required"));
  if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{30,}["']/i.test(html)) findings.push(finding("Search Visibility", "medium", "Homepage description needs attention", "Add a useful search description for the MMG homepage.", "approval-required"));
  if (!/<h1\b/i.test(html)) findings.push(finding("Accessibility", "medium", "Homepage needs a primary heading", "Confirm a single meaningful primary heading is present in the rendered page.", "approval-required"));
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
  const missingAlt = images.filter(tag => !/\balt\s*=\s*["'][^"']*["']/i.test(tag)).length;
  if (missingAlt) findings.push({ ...finding("Accessibility", "medium", "Images need accessibility text", `${missingAlt} rendered image${missingAlt === 1 ? "" : "s"} appear to be missing alt text.`, "approval-required"), count: missingAlt });
  return { reachable: response.ok, statusCode: response.status, finalURL: response.url, findings };
}

async function inspectSitemap(origin) {
  const sitemapURL = new URL("/sitemap.xml", origin).toString();
  try {
    const response = await fetch(sitemapURL, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const findings = [];
    if (!response.ok) findings.push(finding("Search Visibility", "medium", "Sitemap needs attention", `The sitemap returned HTTP ${response.status}.`, "approval-required"));
    return { reachable: response.ok, statusCode: response.status, url: sitemapURL, findings };
  } catch (error) {
    return { reachable: false, statusCode: 0, url: sitemapURL, findings: [finding("Search Visibility", "medium", "Sitemap could not be checked", error instanceof Error ? error.message : "Sitemap request failed.", "approval-required")] };
  }
}

function finding(area, severity, title, summary, authority) {
  return { area, severity, title, summary, authority, confidence: null };
}

function buildSummary(findings, approvals) {
  if (!findings.length) return "Website review completed. No immediate issues were found.";
  return `Website review completed with ${findings.length} finding${findings.length === 1 ? "" : "s"}; ${approvals.length} item${approvals.length === 1 ? " is" : "s are"} ready for approval.`;
}

async function storeLatestReport(request, report) {
  await caches.default.put(reportRequest(request), new Response(JSON.stringify(report), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${REPORT_CACHE_SECONDS}` },
  }));
}

function reportRequest(request) {
  return new Request(new URL("/_kairos/website-intelligence/latest", request.url).toString(), { method: "GET" });
}
