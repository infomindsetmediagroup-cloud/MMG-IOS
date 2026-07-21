import { createPublishingProject } from "./kairos-publishing-studio-v1.js";
import { createCustomerProject } from "./kairos-customer-portal-v1.js";

export const KAIROS_COMMERCE_ORCHESTRATOR_BUILD = "kairos-commerce-orchestrator-20260721-1";

const CACHE_SECONDS = 60 * 60 * 24 * 365;
const PUBLISH_READY_HANDLE = "publish-ready-book-build-service";
const PUBLISH_READY_SKU_PREFIX = "MMG-BOOK-BUILD-";
const PACKAGE_TITLES = new Set(["Starter", "Growth", "Professional"]);

export async function handleKairosCommerceOrchestrator(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/kairos/readiness") {
    return json({
      status: "ready",
      build: KAIROS_COMMERCE_ORCHESTRATOR_BUILD,
      verticalSlice: PUBLISH_READY_HANDLE,
      capabilities: {
        verifiedShopifyWebhook: true,
        idempotentOrderIngestion: true,
        packageRouting: ["Starter", "Growth", "Professional"],
        publishingProjectCreation: true,
        customerPortalProjectCreation: true,
        approvalGates: true,
        automaticLivePublication: false,
        automaticPricingMutation: false,
      },
      requiredSecrets: ["SHOPIFY_WEBHOOK_SECRET"],
    });
  }

  if (request.method === "POST" && url.pathname === "/api/shopify/webhooks/orders-paid") {
    const rawBody = await request.text();
    await verifyShopifyWebhook(request, rawBody, env);
    return ingestOrder(request, parseJSON(rawBody), "shopify-orders-paid");
  }

  if (request.method === "POST" && url.pathname === "/api/kairos/orders/ingest") {
    requireInternalAuthorization(request, env);
    return ingestOrder(request, await safeJSON(request), "internal-ingest");
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/kairos/commerce-projects/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop() || "");
    const record = await readRecord(request, id);
    return record ? json({ status: "completed", build: KAIROS_COMMERCE_ORCHESTRATOR_BUILD, record }) : json({ status: "not-found", build: KAIROS_COMMERCE_ORCHESTRATOR_BUILD }, 404);
  }

  return null;
}

async function ingestOrder(request, payload, source) {
  const order = normalizeOrder(payload);
  const relevantItems = order.lineItems.filter(isPublishReadyItem);
  if (!relevantItems.length) {
    return json({ status: "ignored", build: KAIROS_COMMERCE_ORCHESTRATOR_BUILD, reason: "No supported Kairos service product was present." }, 202);
  }

  const key = order.id || order.name;
  if (!key) throw httpError(400, "order_reference_required", "The order must include an ID or order name.");
  const existing = await readIdempotency(request, key);
  if (existing) return json({ status: "duplicate", build: KAIROS_COMMERCE_ORCHESTRATOR_BUILD, record: existing }, 200);

  const projects = [];
  for (const item of relevantItems) {
    const packageName = normalizePackage(item.variantTitle || item.sku);
    const projectTitle = `${order.name || order.id} · Publish-Ready Book Build · ${packageName}`;
    const objective = "Convert the customer's submitted manuscript and project requirements into a complete, quality-assured, publish-ready book package while preserving human approval for proofs, pricing, external publication, and final release.";

    const publishing = await createPublishingProject(request, {
      title: projectTitle,
      objective,
      type: "book",
      priority: "normal",
      approvalRequired: true,
      author: order.customer.name,
      sourceStatus: "Awaiting MMG Project Guide™ intake and manuscript upload",
      formats: ["editable-source", "print-ready-pdf", "digital-delivery-package"],
      channels: ["Shopify Customer Portal"],
      audience: "Defined during guided intake",
      releaseTarget: "Customer-approved delivery only",
    });

    const customerProject = await createCustomerProject(request, {
      customer: order.customer.name || order.customer.email || "Shopify customer",
      contact: order.customer.email,
      title: projectTitle,
      objective,
      approvalRequired: true,
      orderReference: order.name || order.id,
      scope: `Canonical service: Publish-Ready Book Build Service™. Package: ${packageName}. Quantity: ${item.quantity}.`,
      requirements: "Complete the MMG Project Guide™, verify manuscript readiness, confirm trim size and intended channels, document acceptance criteria, and obtain proof approval before final delivery.",
      uploadsNeeded: "Manuscript, author name, subtitle if applicable, trim size, target publishing channel, references, and any required brand or cover assets.",
      acceptanceCriteria: "Required files are present, formatting passes QA, package-specific deliverables are complete, customer proof approval is recorded, and no live publication occurs without explicit approval.",
      deliveryFormat: "Organized project folder containing editable/source files, final publish-ready files, QA record, and customer instructions.",
    });

    projects.push({
      serviceHandle: PUBLISH_READY_HANDLE,
      package: packageName,
      sku: item.sku,
      publishingProjectID: publishing.project.id,
      publishingWorkflowID: publishing.workflow.id,
      customerProjectID: customerProject.project.id,
      customerWorkflowID: customerProject.workflow.id,
      nextAction: "Send the MMG Project Guide™ and request the required manuscript and project inputs.",
    });
  }

  const record = {
    id: `commerce-${crypto.randomUUID()}`,
    build: KAIROS_COMMERCE_ORCHESTRATOR_BUILD,
    source,
    status: "intake-required",
    order: {
      id: order.id,
      name: order.name,
      customer: order.customer,
      processedAt: order.processedAt,
    },
    projects,
    safeguards: {
      humanApprovalRequired: true,
      proofsRequireApproval: true,
      pricingMutationAutomatic: false,
      liveStorePublicationAutomatic: false,
      marketplaceSubmissionAutomatic: false,
      fulfillmentCompletionAutomatic: false,
    },
    createdAt: new Date().toISOString(),
  };

  await caches.default.put(recordRequest(request, record.id), stored(record));
  await caches.default.put(idempotencyRequest(request, key), stored(record));
  return json({ status: "created", build: KAIROS_COMMERCE_ORCHESTRATOR_BUILD, record }, 201);
}

function normalizeOrder(payload = {}) {
  const customer = payload.customer || {};
  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : Array.isArray(payload.lineItems) ? payload.lineItems : [];
  return {
    id: clean(payload.admin_graphql_api_id || payload.id, 240),
    name: clean(payload.name || payload.order_number, 120),
    processedAt: clean(payload.processed_at || payload.processedAt || payload.created_at, 120),
    customer: {
      name: clean(`${customer.first_name || customer.firstName || ""} ${customer.last_name || customer.lastName || ""}`.trim() || customer.name, 240),
      email: clean(payload.email || customer.email, 320),
    },
    lineItems: lineItems.map(item => ({
      title: clean(item.title || item.product_title, 300),
      handle: clean(item.handle || item.product_handle || item.properties?.find?.(property => property?.name === "_product_handle")?.value, 240),
      variantTitle: clean(item.variant_title || item.variantTitle, 120),
      sku: clean(item.sku, 160),
      quantity: Math.max(1, Number(item.quantity || 1)),
    })),
  };
}

function isPublishReadyItem(item) {
  return item.handle === PUBLISH_READY_HANDLE || item.sku.startsWith(PUBLISH_READY_SKU_PREFIX) || /publish-ready book build service/i.test(item.title);
}

function normalizePackage(value) {
  const normalized = clean(value, 120).replace(PUBLISH_READY_SKU_PREFIX, "").toLowerCase();
  const packageName = normalized.includes("professional") || normalized === "pro" ? "Professional" : normalized.includes("growth") ? "Growth" : "Starter";
  return PACKAGE_TITLES.has(packageName) ? packageName : "Starter";
}

async function verifyShopifyWebhook(request, rawBody, env) {
  const secret = clean(env.SHOPIFY_WEBHOOK_SECRET, 1000);
  if (!secret) throw httpError(503, "shopify_webhook_secret_missing", "SHOPIFY_WEBHOOK_SECRET is not configured.");
  const supplied = clean(request.headers.get("X-Shopify-Hmac-Sha256"), 1000);
  if (!supplied) throw httpError(401, "shopify_hmac_missing", "Shopify HMAC header is required.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = bytesToBase64(new Uint8Array(signature));
  if (!timingSafeEqual(expected, supplied)) throw httpError(401, "shopify_hmac_invalid", "Shopify webhook signature is invalid.");
}

function requireInternalAuthorization(request, env) {
  const expected = clean(env.KAIROS_INTERNAL_TOKEN, 1000);
  if (!expected) throw httpError(503, "kairos_internal_token_missing", "KAIROS_INTERNAL_TOKEN is not configured.");
  const supplied = clean(request.headers.get("Authorization"), 1200).replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(expected, supplied)) throw httpError(401, "kairos_authorization_invalid", "Valid Kairos internal authorization is required.");
}

function timingSafeEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function readRecord(request, id) {
  if (!id) return null;
  const response = await caches.default.match(recordRequest(request, id));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

async function readIdempotency(request, key) {
  const response = await caches.default.match(idempotencyRequest(request, key));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

function parseJSON(value) { try { return value ? JSON.parse(value) : {}; } catch { throw httpError(400, "invalid_json", "Request body must contain valid JSON."); } }
async function safeJSON(request) { try { return await request.json(); } catch { throw httpError(400, "invalid_json", "Request body must contain valid JSON."); } }
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function recordRequest(request, id) { return new Request(new URL(`/_kairos/commerce-projects/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function idempotencyRequest(request, key) { return new Request(new URL(`/_kairos/commerce-idempotency/${encodeURIComponent(key)}`, request.url).toString(), { method: "GET" }); }
function httpError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Commerce-Orchestrator": KAIROS_COMMERCE_ORCHESTRATOR_BUILD } }); }
