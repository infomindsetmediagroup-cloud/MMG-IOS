import { buildKairosRevenueProduct, approveKairosRevenueProduct, KAIROS_REVENUE_ENGINE_BUILD } from "./kairos-revenue-engine-v1.js";
import { createKairosRevenueProductionJobs, authorizeKairosRevenueJob, KAIROS_REVENUE_PRODUCTION_JOBS_BUILD } from "./kairos-revenue-production-jobs-v1.js";
import { registerKairosRevenueAsset, completeKairosRevenueJob, KAIROS_REVENUE_ASSET_REGISTRATION_BUILD } from "./kairos-revenue-asset-registration-v1.js";
import { createKairosShopifyPublicationHandoff, KAIROS_SHOPIFY_PUBLICATION_HANDOFF_BUILD } from "./kairos-shopify-publication-handoff-v1.js";
import { executeKairosRevenueJob, KAIROS_OPENAI_REVENUE_EXECUTOR_BUILD } from "./kairos-openai-revenue-executor-v1.js";
import { createKairosRevenueExecutionReceipt, KAIROS_REVENUE_EXECUTION_RECEIPT_BUILD } from "./kairos-revenue-execution-receipt-v1.js";
import { storeKairosRevenueExecutionAsset, KAIROS_REVENUE_ASSET_STORAGE_BUILD } from "./kairos-revenue-asset-storage-v1.js";
import { getKairosRevenueExecutionQueue, requireNextKairosRevenueJob, KAIROS_REVENUE_JOB_SEQUENCER_BUILD } from "./kairos-revenue-job-sequencer-v1.js";
import { attachKairosShopifyDraftReceipt, createKairosShopifyDraft, KAIROS_SHOPIFY_DRAFT_CREATOR_BUILD } from "./kairos-shopify-draft-creator-v1.js";
import { attachKairosRevenueLaunchCertification, certifyKairosRevenueLaunchReadiness, KAIROS_REVENUE_LAUNCH_READINESS_BUILD } from "./kairos-revenue-launch-readiness-v1.js";

export const KAIROS_REVENUE_PRODUCT_STORE_BUILD = "kairos-revenue-product-store-20260728-5";
const INTERNAL_PATH = "/registry/kairos-revenue-products";
const COLLECTION = /^\/api\/kairos\/revenue\/products\/?$/i;
const EXPORT = /^\/api\/kairos\/revenue\/products\/export\/?$/i;
const ITEM = /^\/api\/kairos\/revenue\/products\/([^/]+)\/?$/i;
const ACTION = /^\/api\/kairos\/revenue\/products\/([^/]+)\/(plan-jobs|approve|authorize-job|execute-job|execute-next|execution-queue|complete-job|register-asset|shopify-handoff|create-shopify-draft|certify-launch|export)\/?$/i;
const MAX_RECORDS = 300;

export async function handleKairosRevenueProductAPI(request, env) {
  const pathname = new URL(request.url).pathname;
  const isExport = EXPORT.test(pathname);
  const action = isExport ? null : pathname.match(ACTION);
  const item = isExport || action ? null : pathname.match(ITEM);
  if (!COLLECTION.test(pathname) && !isExport && !action && !item) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success: false, error: { code: "AUTH_REQUIRED", message: "Authenticated Kairos revenue access is required." } }, 401);
  if (isExport) return request.method === "GET" ? forward(env, { operation: "export" }) : method("GET");
  if (COLLECTION.test(pathname)) {
    if (request.method === "GET") return forward(env, { operation: "list" });
    if (request.method === "POST") return forward(env, { operation: "create", input: enrich(await body(request), identity, env) });
    return method("GET or POST");
  }
  if (action) {
    const actionName = action[2];
    const allowsGet = actionName === "export" || actionName === "execution-queue";
    if (request.method !== "POST" && !(allowsGet && request.method === "GET")) return method(allowsGet ? "GET or POST" : "POST");
    const input = enrich(request.method === "GET" ? {} : await body(request), identity, env);
    const revenueProductId = clean(action[1], 180);
    if (actionName === "execute-job" || actionName === "execute-next") return executeAction(env, revenueProductId, input, actionName === "execute-next");
    if (actionName === "create-shopify-draft") return createShopifyDraftAction(env, revenueProductId, input);
    return forward(env, { operation: actionName, revenueProductId, input });
  }
  if (request.method === "GET") return forward(env, { operation: "read", revenueProductId: clean(item[1], 180) });
  if (request.method === "PATCH") return forward(env, { operation: "update", revenueProductId: clean(item[1], 180), input: enrich(await body(request), identity, env) });
  return method("GET or PATCH");
}

export async function handleKairosRevenueProductObjectRequest(state, request) {
  if (new URL(request.url).pathname !== INTERNAL_PATH) return null;
  const input = await body(request);
  if (input.operation === "create") return create(state, input.input);
  if (input.operation === "read") return read(state, input.revenueProductId);
  if (input.operation === "list") return list(state);
  if (input.operation === "update") return mutate(state, input.revenueProductId, (record) => buildKairosRevenueProduct({ ...record, ...input.input, revenueProductId: record.revenueProductId }));
  if (input.operation === "plan-jobs") return mutate(state, input.revenueProductId, (record) => ({ ...record, productionJobs: createKairosRevenueProductionJobs(record, input.input), updatedAt: now() }));
  if (input.operation === "approve") return mutate(state, input.revenueProductId, (record) => ({ ...approveKairosRevenueProduct(record, { ...input.input, approvedByIdentityHash: input.input.operatorIdentityHash }), updatedAt: now() }));
  if (input.operation === "authorize-job") return mutate(state, input.revenueProductId, (record) => authorizeJob(record, input.input));
  if (input.operation === "execution-queue") return queueResponse(state, input.revenueProductId);
  if (input.operation === "record-stored-execution") return mutate(state, input.revenueProductId, (record) => recordStoredExecution(record, input.input));
  if (input.operation === "record-shopify-draft") return mutate(state, input.revenueProductId, (record) => attachKairosShopifyDraftReceipt(record, input.input.receipt));
  if (input.operation === "certify-launch") return mutate(state, input.revenueProductId, (record) => attachKairosRevenueLaunchCertification(record, certifyKairosRevenueLaunchReadiness(record, input.input)));
  if (input.operation === "complete-job") return mutate(state, input.revenueProductId, (record) => completeKairosRevenueJob(record, input.input));
  if (input.operation === "register-asset") return mutate(state, input.revenueProductId, (record) => rebuild(registerKairosRevenueAsset(record, input.input)));
  if (input.operation === "shopify-handoff") return mutate(state, input.revenueProductId, (record) => ({ ...record, publicationHandoff: createKairosShopifyPublicationHandoff(record, input.input), updatedAt: now() }));
  if (input.operation === "export") return exportAll(state);
  return json({ success: false, error: { code: "OPERATION_INVALID", message: "Unknown revenue product operation." } }, 400);
}

async function createShopifyDraftAction(env, revenueProductId, input) {
  try {
    const readResponse = await forward(env, { operation: "read", revenueProductId });
    const readPayload = await readResponse.json();
    if (!readResponse.ok) return json(readPayload, readResponse.status);
    const receipt = await createKairosShopifyDraft(readPayload.product, input, env);
    const persisted = await forward(env, { operation: "record-shopify-draft", revenueProductId, input: { receipt } });
    const payload = await persisted.json();
    return json({ success: persisted.ok, receipt, product: payload.product, queue: payload.queue, builds: builds() }, persisted.status);
  } catch (error) { return failure(error); }
}

async function executeAction(env, revenueProductId, input, executeNext) {
  try {
    const readResponse = await forward(env, { operation: "read", revenueProductId });
    const readPayload = await readResponse.json();
    if (!readResponse.ok) return json(readPayload, readResponse.status);
    const product = readPayload.product;
    const sequence = requireNextKairosRevenueJob(product, executeNext ? "" : clean(input.jobId, 180));
    const job = (Array.isArray(product.productionJobs) ? product.productionJobs : []).find((item) => item.jobId === sequence.entry.jobId);
    const execution = await executeKairosRevenueJob(product, job, env, input);
    const generatedReceipt = createKairosRevenueExecutionReceipt(execution, input.asset || {});
    const storedAsset = await storeKairosRevenueExecutionAsset(execution, generatedReceipt, env);
    const receipt = Object.freeze({ ...generatedReceipt, asset: Object.freeze({ ...generatedReceipt.asset, storageRef: storedAsset.storageRef, byteSize: storedAsset.byteSize, status: "stored" }), registrationReady: true });
    const persisted = await forward(env, { operation: "record-stored-execution", revenueProductId, input: { execution: summarizeExecution(execution), receipt, asset: { ...storedAsset, operatorIdentityHash: input.operatorIdentityHash }, jobId: job.jobId, completedAt: execution.completedAt } });
    const persistedPayload = await persisted.json();
    return json({ success: persisted.ok, execution: summarizeExecution(execution), receipt, storedAsset, queue: persistedPayload.queue, product: persistedPayload.product, builds: builds() }, persisted.status);
  } catch (error) { return failure(error); }
}

async function create(state, input) {
  try {
    const product = { ...buildKairosRevenueProduct(input), productionJobs: Object.freeze([]), executionReceipts: Object.freeze([]), projectId: clean(input.projectId, 180) || null, environment: clean(input.environment, 80), commitSha: clean(input.commitSha, 80) || null, createdAt: now(), updatedAt: now() };
    const records = await load(state);
    if (records.some((item) => item.revenueProductId === product.revenueProductId)) return json({ success: false, error: { code: "REVENUE_PRODUCT_EXISTS", message: "Revenue product already exists." } }, 409);
    records.push(product); await save(state, records);
    return json({ success: true, product, queue: getKairosRevenueExecutionQueue(product), builds: builds() }, 201);
  } catch (error) { return failure(error); }
}
async function read(state, id) { const product = (await load(state)).find((item) => item.revenueProductId === clean(id, 180)); return product ? json({ success: true, product, queue: getKairosRevenueExecutionQueue(product), builds: builds() }) : json({ success: false, error: { code: "REVENUE_PRODUCT_NOT_FOUND", message: "Revenue product was not found." } }, 404); }
async function list(state) { const products = sorted(await load(state)); return json({ success: true, count: products.length, products: products.map((product) => ({ ...product, executionQueue: getKairosRevenueExecutionQueue(product) })), builds: builds() }); }
async function queueResponse(state, id) { const product = (await load(state)).find((item) => item.revenueProductId === clean(id, 180)); return product ? json({ success: true, queue: getKairosRevenueExecutionQueue(product), builds: builds() }) : json({ success: false, error: { code: "REVENUE_PRODUCT_NOT_FOUND", message: "Revenue product was not found." } }, 404); }
async function mutate(state, id, callback) { try { const records = await load(state); const index = records.findIndex((item) => item.revenueProductId === clean(id, 180)); if (index < 0) return json({ success: false, error: { code: "REVENUE_PRODUCT_NOT_FOUND", message: "Revenue product was not found." } }, 404); records[index] = callback(records[index]); await save(state, records); return json({ success: true, product: records[index], queue: getKairosRevenueExecutionQueue(records[index]), builds: builds() }); } catch (error) { return failure(error); } }
function authorizeJob(record, input) { const jobId = clean(input.jobId, 180); const jobs = (Array.isArray(record.productionJobs) ? record.productionJobs : []).map((job) => job.jobId === jobId ? authorizeKairosRevenueJob(job, { ...input, authorizedByIdentityHash: input.operatorIdentityHash }) : job); if (!jobs.some((job) => job.jobId === jobId)) throw storeError("REVENUE_JOB_NOT_FOUND", "Revenue production job was not found.", 404); return { ...record, productionJobs: Object.freeze(jobs), updatedAt: now() }; }
function recordStoredExecution(record, input) { const registered = registerKairosRevenueAsset(record, input.asset || {}); const completed = completeKairosRevenueJob(registered, { jobId: input.jobId, completedAt: input.completedAt, outputAssetIds: [input.asset?.assetId] }); const receipts = [...(Array.isArray(record.executionReceipts) ? record.executionReceipts : []), input.receipt || {}].slice(-100); return rebuild({ ...completed, executionReceipts: Object.freeze(receipts), lastExecution: Object.freeze(input.execution || {}), updatedAt: now() }); }
function summarizeExecution(execution) { return Object.freeze({ executionId: execution.executionId, jobId: execution.jobId, outputType: execution.outputType, model: execution.model, usage: execution.usage, completedAt: execution.completedAt, requiresEditorialQA: true }); }
function rebuild(record) { const rebuilt = buildKairosRevenueProduct({ ...record, assets: record.assets, revenueProductId: record.revenueProductId, approval: record.approval }); return { ...record, ...rebuilt, productionJobs: record.productionJobs, executionReceipts: record.executionReceipts, lastExecution: record.lastExecution, createdAt: record.createdAt, updatedAt: now() }; }
async function exportAll(state) { const products = sorted(await load(state)); return json({ success: true, exportVersion: "kairos-revenue-product-export-v5", generatedAt: now(), count: products.length, products, commerceMutationIncluded: products.some((item) => Boolean(item.shopifyDraftReceipt)), externalPublicationIncluded: false, deploymentExecutionIncluded: false, builds: builds() }); }
function enrich(input, identity, env) { return { ...input, operatorIdentityHash: hashIdentity(identity), environment: clean(input.environment || env?.KAIROS_ENVIRONMENT || "production", 80), commitSha: clean(input.commitSha || env?.KAIROS_COMMIT_SHA, 80) || null }; }
async function forward(env, input) { if (!env?.KAIROS_PROJECTS) return json({ success: false, error: { code: "REVENUE_STORAGE_UNAVAILABLE", message: "Kairos revenue storage is unavailable." } }, 503); const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry")); return stub.fetch(new Request(`https://kairos.internal${INTERNAL_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })); }
async function load(state) { const value = await state.storage.get("kairos-revenue-products:records"); return Array.isArray(value) ? value : []; }
async function save(state, records) { await state.storage.put("kairos-revenue-products:records", records.slice(-MAX_RECORDS)); }
function sorted(records) { return records.slice().sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0)); }
function authenticate(request, env) { const email = clean(request.headers.get("cf-access-authenticated-user-email"), 320); if (email) return email.toLowerCase(); const auth = request.headers.get("authorization") || ""; const token = String(env?.KAIROS_API_ACCESS_TOKEN || ""); return token && auth === `Bearer ${token}` ? "service-token" : ""; }
function hashIdentity(value) { let hash = 2166136261; for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`; }
function builds() { return { engine: KAIROS_REVENUE_ENGINE_BUILD, jobs: KAIROS_REVENUE_PRODUCTION_JOBS_BUILD, assets: KAIROS_REVENUE_ASSET_REGISTRATION_BUILD, assetStorage: KAIROS_REVENUE_ASSET_STORAGE_BUILD, sequencer: KAIROS_REVENUE_JOB_SEQUENCER_BUILD, handoff: KAIROS_SHOPIFY_PUBLICATION_HANDOFF_BUILD, executor: KAIROS_OPENAI_REVENUE_EXECUTOR_BUILD, receipts: KAIROS_REVENUE_EXECUTION_RECEIPT_BUILD, shopifyDraft: KAIROS_SHOPIFY_DRAFT_CREATOR_BUILD, launchReadiness: KAIROS_REVENUE_LAUNCH_READINESS_BUILD, store: KAIROS_REVENUE_PRODUCT_STORE_BUILD }; }
function failure(error) { return json({ success: false, error: { code: error?.code || "REVENUE_PRODUCT_INVALID", message: error?.message || "Revenue product operation failed." } }, error?.status || 400); }
function method(allowed) { return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` } }, 405); }
async function body(request) { return request.json().catch(() => ({})); }
function now() { return new Date().toISOString(); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function storeError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Revenue-Engine": KAIROS_REVENUE_ENGINE_BUILD, "X-Kairos-Revenue-Product-Store": KAIROS_REVENUE_PRODUCT_STORE_BUILD, "X-Kairos-Revenue-Production-Jobs": KAIROS_REVENUE_PRODUCTION_JOBS_BUILD, "X-Kairos-Revenue-Asset-Registration": KAIROS_REVENUE_ASSET_REGISTRATION_BUILD, "X-Kairos-Revenue-Asset-Storage": KAIROS_REVENUE_ASSET_STORAGE_BUILD, "X-Kairos-Revenue-Job-Sequencer": KAIROS_REVENUE_JOB_SEQUENCER_BUILD, "X-Kairos-Shopify-Publication-Handoff": KAIROS_SHOPIFY_PUBLICATION_HANDOFF_BUILD, "X-Kairos-OpenAI-Revenue-Executor": KAIROS_OPENAI_REVENUE_EXECUTOR_BUILD, "X-Kairos-Shopify-Draft-Creator": KAIROS_SHOPIFY_DRAFT_CREATOR_BUILD, "X-Kairos-Revenue-Launch-Readiness": KAIROS_REVENUE_LAUNCH_READINESS_BUILD } }); }
