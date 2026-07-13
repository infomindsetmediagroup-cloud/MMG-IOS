const MAX_LINKS = 120;
const TIMEOUT_MS = 8000;

const ROUTE_RULES = [
  { intent: /publish|book|author|manuscript/i, path: "/collections/books", stage: "publish" },
  { intent: /creator|content|template|capcut/i, path: "/pages/capcut-templates", stage: "create" },
  { intent: /ai|prompt|kairos/i, path: "/collections/digital-downloads", stage: "learn" },
  { intent: /merch|shop|wear/i, path: "/pages/mmg-creator-merch", stage: "buy" },
  { intent: /free|toolkit|resource/i, path: "/pages/free-creator-toolkit", stage: "discover" },
];

export async function auditHomepageLinks(origin) {
  const root = new URL(origin);
  const response = await fetch(root, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Storefront homepage returned HTTP ${response.status}.`);
  const html = await response.text();
  const links = extractLinks(html, root).slice(0, MAX_LINKS);
  const unique = [...new Map(links.map(link => [link.url, link])).values()];
  const results = [];
  for (const link of unique) results.push(await evaluateLink(link, root));
  const broken = results.filter(item => item.status === "broken");
  const lifecycle = results.filter(item => item.lifecycleDecision === "review" || item.lifecycleDecision === "replace");
  return {
    auditedAt: new Date().toISOString(),
    origin: root.origin,
    inspected: results.length,
    valid: results.filter(item => item.status === "valid").length,
    broken: broken.length,
    lifecycleReview: lifecycle.length,
    results,
    summary: `${results.length} links inspected; ${broken.length} broken; ${lifecycle.length} lifecycle corrections or reviews identified.`,
  };
}

async function evaluateLink(link, root) {
  const url = new URL(link.url);
  const internal = url.origin === root.origin;
  let statusCode = 0;
  let finalURL = url.toString();
  let status = "valid";
  let error = "";
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    statusCode = response.status;
    finalURL = response.url || finalURL;
    if (response.status === 404 || response.status === 410 || response.status >= 500) status = "broken";
  } catch (cause) {
    status = "broken";
    error = cause instanceof Error ? cause.message : "Request failed";
  }

  const recommendation = internal ? recommend(link.label, url.pathname) : null;
  let lifecycleDecision = "keep";
  let confidence = 1;
  let rationale = "Destination is reachable and no stronger MMG lifecycle mismatch was detected.";
  if (status === "broken" && recommendation) {
    lifecycleDecision = "replace";
    confidence = 0.96;
    rationale = "The current destination is broken and the link label maps to a verified MMG lifecycle route.";
  } else if (status === "broken") {
    lifecycleDecision = "review";
    confidence = 0.35;
    rationale = "The destination is broken, but the correct replacement cannot be determined safely from the label alone.";
  } else if (recommendation && normalizePath(url.pathname) !== normalizePath(recommendation.path)) {
    lifecycleDecision = "review";
    confidence = 0.72;
    rationale = `The link label suggests the ${recommendation.stage} stage, while the current destination may not be the most direct continuation.`;
  }

  return {
    label: link.label,
    source: "/",
    url: url.toString(),
    internal,
    status,
    statusCode,
    finalURL,
    error,
    lifecycleDecision,
    expectedStage: recommendation?.stage || "unknown",
    recommendedURL: recommendation ? new URL(recommendation.path, root).toString() : null,
    confidence,
    rationale,
  };
}

function extractLinks(html, root) {
  const output = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const href = String(match[1] || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    try {
      const url = new URL(href, root);
      const label = stripTags(match[2]).replace(/\s+/g, " ").trim().slice(0, 160);
      output.push({ url: url.toString(), label });
    } catch {}
  }
  return output;
}

function recommend(label, pathname) {
  const text = `${label} ${pathname}`;
  return ROUTE_RULES.find(rule => rule.intent.test(text)) || null;
}

function normalizePath(path) {
  return String(path || "/").replace(/\/+$/, "") || "/";
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}
