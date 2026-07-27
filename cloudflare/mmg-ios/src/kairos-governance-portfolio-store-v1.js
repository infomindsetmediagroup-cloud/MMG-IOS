import { createKairosGovernancePortfolio, evaluateKairosGovernancePortfolio, KAIROS_GOVERNANCE_PORTFOLIO_OVERSIGHT_BUILD } from "./kairos-governance-portfolio-oversight-v1.js";

export const KAIROS_GOVERNANCE_PORTFOLIO_STORE_BUILD = "kairos-governance-portfolio-store-20260727-1";
const INTERNAL_PATH = "/registry/kairos-governance-portfolios";
const COLLECTION_ROUTE = /^\/api\/kairos\/operations\/portfolios\/?$/i;
const EXPORT_ROUTE = /^\/api\/kairos\/operations\/portfolios\/export\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/operations\/portfolios\/([^/]+)\/?$/i;
const MAX_RECORDS = 200;

export async function handleKairosGovernancePortfolioAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT_ROUTE.test(pathname);
  const item = isExport ? null : pathname.match(ITEM_ROUTE);
  if (!COLLECTION_ROUTE.test(pathname) && !isExport && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated governance portfolio access is required." } }, 401);
  if (isExport) {
    if (request.method !== "GET") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } }, 405);
    return forward(env, { operation: "export" });
  }
  if (COLLECTION_ROUTE.test(pathname)) {
    if (request.method === "GET") return forward(env, { operation: "list" });
    if (request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      return forward(env, { operation: "create", input: enrichInput(input, identity, env) });
    }
    return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST." } }, 405);
  }
  const portfolioId = clean(item[1], 180);
  if (request.method === "GET") return forward(env, { operation: "read", portfolioId });
  if (request.method === "PATCH") {
    const input = await request.json().catch(() => ({}));
    return forward(env, { operation: "evaluate", portfolioId, input: enrichInput(input, identity, env) });
  }
  return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or PATCH." } }, 405);
}

export async function handleKairosGovernancePortfolioObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const body = await request.json().catch(() => ({}));
  if (body.operation === "create") return create(state, body.input);
  if (body.operation === "read") return read(state, body.portfolioId);
  if (body.operation === "list") return list(state);
  if (body.operation === "evaluate") return evaluate(state, body.portfolioId, body.input);
  if (body.operation === "export") return exportPackage(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown governance portfolio operation." } }, 400);
}

async function create(state, input) {
  try {
    const portfolio = createKairosGovernancePortfolio(input);
    const records = await load(state);
    if (records.some((item) => item.portfolioId === portfolio.portfolioId)) return json({ success: false, error: { code: "PORTFOLIO_EXISTS", message: "Governance portfolio already exists." } }, 409);
    records.push(portfolio); await save(state, records);
    return json({ success: true, portfolio, builds: builds() }, 201);
  } catch (error) { return failure(error); }
}
async function read(state, portfolioId) { const portfolio = (await load(state)).find((item) => item.portfolioId === clean(portfolioId, 180)); return portfolio ? json({ success: true, portfolio, builds: builds() }) : json({ success: false, error: { code: "PORTFOLIO_NOT_FOUND", message: "Governance portfolio was not found." } }, 404); }
async function list(state) { const portfolios = sorted(await load(state)); return json({ success: true, count: portfolios.length, portfolios, builds: builds() }); }
async function evaluate(state, portfolioId, input) {
  try {
    const records = await load(state); const index = records.findIndex((item) => item.portfolioId === clean(portfolioId, 180));
    if (index < 0) return json({ success: false, error: { code: "PORTFOLIO_NOT_FOUND", message: "Governance portfolio was not found." } }, 404);
    records[index] = evaluateKairosGovernancePortfolio(records[index], input); await save(state, records);
    return json({ success: true, portfolio: records[index], builds: builds() });
  } catch (error) { return failure(error); }
}
async function exportPackage(state) {
  const portfolios = sorted(await load(state));
  return json({ success: true, exportVersion: "kairos-governance-portfolio-export-v1", generatedAt: new Date().toISOString(), count: portfolios.length, portfolios, deploymentExecutionIncluded: false, rollbackExecutionIncluded: false, retryExecutionIncluded: false, automaticRemediationIncluded: false, builds: builds() });
}
function enrichInput(input, identity, env) { return { ...input, operatorIdentityHash: hashIdentity(identity), environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80), commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null }; }
async function load(state) { const value = await state.storage.get("kairos-governance-portfolio:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-governance-portfolio:records", records.slice(-MAX_RECORDS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
async function forward(env, body) { if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "PORTFOLIO_STORAGE_UNAVAILABLE", message: "Governance portfolio storage is unavailable." } }, 503); const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry")); return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })); }
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function builds() { return { oversight: KAIROS_GOVERNANCE_PORTFOLIO_OVERSIGHT_BUILD, store: KAIROS_GOVERNANCE_PORTFOLIO_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "PORTFOLIO_INVALID", message: error?.message || "Governance portfolio operation failed." } }, error?.status || 400); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Governance-Portfolio-Store": KAIROS_GOVERNANCE_PORTFOLIO_STORE_BUILD } }); }
