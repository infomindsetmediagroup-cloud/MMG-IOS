const BUILD = "shopify-website-registry-20260712-1";
const CACHE_SECONDS = 60 * 60 * 6;

const CANONICAL_NODES = [
  node("home", "Homepage", "/", "discover", "ecosystem-entry", ["free-toolkit", "knowledge-library", "publishing", "customer-portal"]),
  node("free-toolkit", "Free Creator Toolkit", "/pages/free-creator-toolkit", "discover", "lead-entry", ["knowledge-library", "capcut-templates", "digital-downloads"]),
  node("knowledge-library", "Knowledge Library", "/pages/knowledge-library", "learn", "education-hub", ["digital-downloads", "publishing", "customer-portal"]),
  node("capcut-templates", "CapCut Templates", "/pages/capcut-templates", "create", "creator-resource", ["free-toolkit", "digital-downloads"]),
  node("digital-downloads", "Digital Downloads", "/collections/digital-downloads", "learn", "commerce-collection", ["publishing", "customer-portal"]),
  node("publishing", "Publishing Services", "/pages/publishing-services", "publish", "service-pathway", ["customer-portal", "manuscript-intake"]),
  node("manuscript-intake", "Manuscript Intake", "/pages/manuscript-intake", "publish", "production-intake", ["customer-portal"]),
  node("customer-portal", "Customer Portal", "/pages/customer-portal", "grow", "project-hub", []),
  node("links", "MMG Links", "/pages/mindset-media-group-links", "discover", "navigation-hub", ["free-toolkit", "knowledge-library", "publishing"]),
  node("merch", "MMG Creator Merch", "/pages/mmg-creator-merch", "grow", "commerce-page", ["home", "digital-downloads"])
];

export async function handleWebsiteRegistryRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/shopify/website-registry" && request.method === "GET") return readRegistry(request, env);
  if (url.pathname === "/api/shopify/website-registry/sync" && request.method === "POST") return syncRegistry(request, env);
  if (url.pathname === "/api/shopify/website-registry/validate" && request.method === "POST") return validateJourney(request, env);
  return null;
}

async function readRegistry(request, env) {
  const cached = await readStored(request, env);
  if (cached) return json(cached);
  return json(await buildRegistry(env, false));
}

async function syncRegistry(request, env) {
  const registry = await buildRegistry(env, true);
  await writeStored(request, env, registry);
  return json(registry, 201);
}

async function validateJourney(request, env) {
  const body = await request.json().catch(() => ({}));
  const registry = await readStored(request, env) || await buildRegistry(env, false);
  const requested = Array.isArray(body?.nodeIDs) ? body.nodeIDs.map(String) : [];
  const nodes = requested.length ? registry.nodes.filter(item => requested.includes(item.id)) : registry.nodes;
  const ids = new Set(nodes.map(item => item.id));
  const edges = registry.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to));
  const incoming = new Map(nodes.map(item => [item.id, 0]));
  const outgoing = new Map(nodes.map(item => [item.id, 0]));
  for (const edge of edges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
  }
  const findings = [];
  for (const item of nodes) {
    if (item.id !== "home" && !incoming.get(item.id)) findings.push(finding("orphan-page", item.id, "No verified incoming pathway reaches this page."));
    if (!outgoing.get(item.id) && item.role !== "project-hub") findings.push(finding("dead-end", item.id, "This page has no registered next-step pathway."));
    if (item.status !== "reachable") findings.push(finding("unreachable", item.id, `Storefront probe returned ${item.httpStatus || "no response"}.`));
  }
  return json({
    status: findings.some(item => item.severity === "blocking") ? "needs-attention" : "validated",
    build: BUILD,
    checkedAt: new Date().toISOString(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    findings,
    journeyStages: summarizeStages(nodes),
    nextAction: findings.length ? "Route the findings into Website Production → Connect Customer Journey." : "The registered journey has no structural dead ends in the selected scope."
  });
}

async function buildRegistry(env, probe) {
  const store = String(env.SHOPIFY_STOREFRONT_DOMAIN || env.SHOPIFY_STORE_DOMAIN || "07kd8e-qw.myshopify.com").trim().toLowerCase();
  const discovered = probe ? await discoverSitemap(store) : [];
  const nodes = [];
  for (const canonical of CANONICAL_NODES) {
    const evidence = probe ? await probePage(`https://${store}${canonical.path}`) : { status: "not-probed", httpStatus: null, title: "", finalURL: "" };
    nodes.push({ ...canonical, ...evidence, verifiedAt: probe ? new Date().toISOString() : null });
  }
  for (const path of discovered) {
    if (nodes.some(item => item.path === path)) continue;
    const id = `discovered-${slug(path)}`;
    nodes.push({ ...node(id, titleFromPath(path), path, inferStage(path), inferRole(path), []), status: "discovered", httpStatus: null, title: "", finalURL: "", verifiedAt: null, canonical: false });
  }
  const edges = CANONICAL_NODES.flatMap(item => item.next.map(to => ({ id: `${item.id}--${to}`, from: item.id, to, type: "recommended-next-step", verified: nodes.some(node => node.id === to) })));
  const unreachable = nodes.filter(item => item.status === "unreachable").length;
  const deadEnds = nodes.filter(item => item.role !== "project-hub" && !edges.some(edge => edge.from === item.id)).length;
  return {
    status: probe ? "synced" : "baseline-ready",
    build: BUILD,
    generatedAt: new Date().toISOString(),
    store,
    source: probe ? "storefront-sitemap-and-route-probe" : "canonical-mmg-baseline",
    nodes,
    edges,
    summary: { pages: nodes.length, pathways: edges.length, unreachable, deadEnds, canonicalPages: CANONICAL_NODES.length, discoveredPages: Math.max(0, nodes.length - CANONICAL_NODES.length) },
    journey: ["discover", "learn", "create", "publish", "grow", "legacy"],
    doctrine: { primaryMessage: "Your Knowledge Has Value.", rule: "Every public page must lead to a verified next step; no isolated pages and no dead ends." }
  };
}

async function discoverSitemap(store) {
  try {
    const response = await fetch(`https://${store}/sitemap.xml`, { headers: { "User-Agent": "Kairos-Website-Registry/1.0" }, redirect: "follow" });
    if (!response.ok) return [];
    const xml = await response.text();
    const paths = [];
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
      try {
        const url = new URL(decode(match[1]));
        if (url.hostname === store && !url.pathname.endsWith("sitemap.xml")) paths.push(url.pathname);
      } catch {}
    }
    return [...new Set(paths)].slice(0, 200);
  } catch { return []; }
}

async function probePage(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Kairos-Website-Registry/1.0", Accept: "text/html" } });
    const html = (response.headers.get("content-type") || "").includes("text/html") ? await response.text() : "";
    const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
    return { status: response.ok ? "reachable" : "unreachable", httpStatus: response.status, title, finalURL: response.url, latencyMs: Date.now() - started };
  } catch (error) {
    return { status: "unreachable", httpStatus: 0, title: "", finalURL: url, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "Probe failed" };
  }
}

async function readStored(request, env) {
  if (env.WEBSITE_REGISTRY && typeof env.WEBSITE_REGISTRY.get === "function") return env.WEBSITE_REGISTRY.get("website-registry:v1", "json");
  const response = await caches.default.match(storageRequest(request));
  return response ? response.json() : null;
}
async function writeStored(request, env, value) {
  if (env.WEBSITE_REGISTRY && typeof env.WEBSITE_REGISTRY.put === "function") return env.WEBSITE_REGISTRY.put("website-registry:v1", JSON.stringify(value));
  return caches.default.put(storageRequest(request), new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_SECONDS}` } }));
}
function storageRequest(request) { const url = new URL(request.url); return new Request(`${url.origin}/__kairos/website-registry/v1`); }
function node(id, label, path, stage, role, next) { return { id, label, path, stage, role, next, canonical: true, primaryCTA: next[0] || null }; }
function finding(type, nodeID, message) { return { type, nodeID, severity: type === "unreachable" ? "blocking" : "warning", message }; }
function summarizeStages(nodes) { return Object.fromEntries(["discover","learn","create","publish","grow","legacy"].map(stage => [stage, nodes.filter(item => item.stage === stage).length])); }
function inferStage(path) { if (/publish|manuscript|book/i.test(path)) return "publish"; if (/product|collection|merch/i.test(path)) return "grow"; if (/template|creator/i.test(path)) return "create"; if (/library|learn|education/i.test(path)) return "learn"; return "discover"; }
function inferRole(path) { if (/products\//.test(path)) return "product-page"; if (/collections\//.test(path)) return "commerce-collection"; if (/pages\//.test(path)) return "content-page"; return "storefront-route"; }
function slug(path) { return String(path).replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "home"; }
function titleFromPath(path) { return slug(path).split("-").map(value => value.charAt(0).toUpperCase() + value.slice(1)).join(" "); }
function decode(value) { return String(value || "").replace(/&amp;/g, "&"); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
