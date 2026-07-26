export const KAIROS_KNOWLEDGE_VAULT_BUILD = "kairos-knowledge-vault-20260725-2-lifecycle";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const SEARCH_PATH = "/registry/kairos-knowledge/search";
const INDEX_KEY = "kairos-knowledge:index";
const MAX_RESULTS = 8;
const MAX_EXCERPT = 1800;

const CANONICAL_FOUNDATION = Object.freeze([
  Object.freeze({
    id: "mmg-governance-foundation",
    title: "MMG governed execution foundation",
    department: "executive",
    authority: "constitutional",
    tags: ["governance", "approval", "execution", "production"],
    content: "Kairos may analyze, draft, validate, and propose controlled actions. External production mutations require explicit approval through an authorized action route. Kairos must never claim execution without verified tool evidence.",
  }),
  Object.freeze({
    id: "mmg-experience-first",
    title: "MMG experience-first doctrine",
    department: "customer",
    authority: "constitutional",
    tags: ["experience", "friction", "clarity", "progress", "customer"],
    content: "Design the MMG ecosystem as one coherent experience. Minimize friction, repeated input, prompt memorization, and navigation complexity while preserving clarity, authenticated boundaries, visible progress, and successful task completion.",
  }),
  Object.freeze({
    id: "mmg-publishing-pipeline",
    title: "Canonical MMG publishing pipeline",
    department: "publishing",
    authority: "operational",
    tags: ["publishing", "manuscript", "digital asset", "delivery", "source"],
    content: "Preserve source authority, editorial integrity, editable source files, final deliverables, customer instructions, product metadata, Digital Asset Edition requirements, delivery verification, and approval boundaries throughout publishing production.",
  }),
  Object.freeze({
    id: "mmg-shopify-governance",
    title: "Shopify AI Toolkit and mutation governance",
    department: "commerce",
    authority: "operational",
    tags: ["shopify", "commerce", "product", "pricing", "inventory", "mutation"],
    content: "Use Shopify-aware validation for Liquid, GraphQL, app configuration, extensions, metafields, metaobjects, Functions, and controlled store operations. Documentation, generation, and static validation may run automatically. Production-affecting mutations require explicit approval or an approved governed workflow.",
  }),
  Object.freeze({
    id: "mmg-website-production",
    title: "MMG website production standard",
    department: "website",
    authority: "operational",
    tags: ["website", "shopify", "responsive", "accessibility", "links"],
    content: "Preserve approved content, purpose, links, information architecture, responsive behavior, accessibility, Shopify compatibility, authenticated boundaries, and verified canonical routes. Keep drafts and staging work separate from production changes.",
  }),
  Object.freeze({
    id: "mmg-door-opener",
    title: "MMG Door Opener doctrine",
    department: "executive",
    authority: "brand",
    tags: ["brand", "stewardship", "knowledge", "opportunity", "trust"],
    content: "MMG is not a gatekeeper; it is a door opener. Practice knowledge stewardship, reduce fragmentation, expand opportunity, build trust, and help people move from scattered ideas and tools into coherent execution.",
  }),
]);

export async function retrieveKairosKnowledge(env, input = {}) {
  const query = clean(input.query, 12000);
  if (!query) return emptyResult();
  const department = clean(input.department, 120).toLowerCase();
  const limit = clamp(input.limit, 1, MAX_RESULTS, 5);
  const staticMatches = rankRecords(CANONICAL_FOUNDATION, query, department).slice(0, limit);
  const storedMatches = await retrieveStored(env, { query, department, limit });
  const merged = dedupe([...storedMatches, ...staticMatches]).slice(0, limit);
  return {
    build: KAIROS_KNOWLEDGE_VAULT_BUILD,
    query,
    department: department || null,
    results: merged,
    evidenceCount: merged.length,
    sourceMode: storedMatches.length ? "canonical-storage-plus-foundation" : "canonical-foundation",
  };
}

export async function handleKairosKnowledgeObjectRequest(state, request) {
  const url = new URL(request.url);
  if (url.pathname !== SEARCH_PATH) return null;
  if (request.method !== "POST") return json({ error: { code: "KNOWLEDGE_METHOD_NOT_ALLOWED", message: "Use POST for Knowledge Vault retrieval." } }, 405);
  const body = await request.json().catch(() => ({}));
  const query = clean(body.query, 12000);
  const department = clean(body.department, 120).toLowerCase();
  const limit = clamp(body.limit, 1, MAX_RESULTS, 5);
  if (!query) return json({ build: KAIROS_KNOWLEDGE_VAULT_BUILD, results: [] });
  const index = Array.isArray(await state.storage.get(INDEX_KEY)) ? await state.storage.get(INDEX_KEY) : [];
  const records = [];
  for (const id of index.slice(-500)) {
    const record = await state.storage.get(`kairos-knowledge:record:${id}`);
    if (record?.id && record?.content && record.status === "active" && record.visibility !== "private-internal") records.push(record);
  }
  return json({ build: KAIROS_KNOWLEDGE_VAULT_BUILD, results: rankRecords(records, query, department).slice(0, limit) });
}

async function retrieveStored(env, body) {
  if (!env?.KAIROS_PROJECTS) return [];
  try {
    const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
    const response = await stub.fetch(new Request(`https://kairos.internal${SEARCH_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload.results) ? payload.results : [];
  } catch {
    return [];
  }
}

function rankRecords(records, query, department) {
  const terms = tokenize(query);
  return records.map((record) => {
    const haystack = `${record.title || ""} ${record.department || ""} ${(record.tags || []).join(" ")} ${record.content || ""}`.toLowerCase();
    let score = terms.reduce((total, term) => total + (haystack.includes(term) ? Math.min(8, term.length) : 0), 0);
    if (department && String(record.department || "").toLowerCase() === department) score += 20;
    if (record.authority === "constitutional") score += 4;
    return { score, record };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map(({ score, record }) => publicRecord(record, score));
}

function publicRecord(record, score) {
  return {
    id: clean(record.id, 160),
    title: clean(record.title, 240),
    department: clean(record.department, 120) || null,
    authority: clean(record.authority, 80) || "operational",
    excerpt: clean(record.content, MAX_EXCERPT),
    source: clean(record.source, 300) || "MMG canonical doctrine",
    version: Number(record.version || 0) || null,
    updatedAt: clean(record.updatedAt, 80) || null,
    relevance: score,
  };
}

function dedupe(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = record.id || `${record.title}:${record.excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tokenize(value) { return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [])].slice(0, 48); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
function clamp(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function emptyResult() { return { build: KAIROS_KNOWLEDGE_VAULT_BUILD, query: "", department: null, results: [], evidenceCount: 0, sourceMode: "none" }; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
