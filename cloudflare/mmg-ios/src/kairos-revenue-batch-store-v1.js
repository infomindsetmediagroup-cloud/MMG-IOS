import { executeRevenueBatchAction, KAIROS_REVENUE_BATCH_ACTIONS_BUILD } from "./kairos-revenue-batch-actions-v1.js";

export const KAIROS_REVENUE_BATCH_STORE_BUILD = "kairos-revenue-batch-store-20260728-1";

export async function executeStoredRevenueBatchAction(store = {}, revenueProductId = "", action = "", input = {}, env = {}) {
  const id = clean(revenueProductId, 180);
  if (!id) throw storeError("REVENUE_PRODUCT_ID_REQUIRED", "Revenue product id is required.");
  const product = await loadProduct(store, id);
  if (!product) throw storeError("REVENUE_PRODUCT_NOT_FOUND", "Revenue product was not found.", 404);
  const result = await executeRevenueBatchAction(product, action, input, env);
  const next = Object.freeze({
    ...result.product,
    batchMutationReceipts: Object.freeze([
      ...(Array.isArray(product.batchMutationReceipts) ? product.batchMutationReceipts : []),
      Object.freeze({
        action,
        batchType: result.execution?.batchType || result.approval?.batchType || null,
        executionId: result.execution?.batchExecutionId || null,
        approvedAt: result.approval?.approvedAt || null,
        performedAt: new Date().toISOString(),
        publicationPerformed: false,
      }),
    ].slice(-100)),
    automaticPublicationAllowed: false,
    updatedAt: new Date().toISOString(),
  });
  await saveProduct(store, next);
  return Object.freeze({ product: next, execution: result.execution || null, approval: result.approval || null, automaticPublicationAllowed: false, builds: Object.freeze({ actions: KAIROS_REVENUE_BATCH_ACTIONS_BUILD, store: KAIROS_REVENUE_BATCH_STORE_BUILD }) });
}

async function loadProduct(store, id) {
  if (typeof store.getRevenueProduct === "function") return store.getRevenueProduct(id);
  if (store.products instanceof Map) return store.products.get(id) || null;
  throw storeError("REVENUE_BATCH_STORE_UNAVAILABLE", "Revenue batch store is unavailable.", 503);
}

async function saveProduct(store, product) {
  if (typeof store.putRevenueProduct === "function") return store.putRevenueProduct(product);
  if (store.products instanceof Map) { store.products.set(product.revenueProductId, product); return product; }
  throw storeError("REVENUE_BATCH_STORE_UNAVAILABLE", "Revenue batch store is unavailable.", 503);
}

function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function storeError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
