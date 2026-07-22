import { SHOPIFY_DOCTRINE } from "./shopify-doctrine.js";
import { createOperationManifest, getWorkflow, listWorkflows } from "./workflow-registry.js";
import { authorizeOperation } from "./scope-firewall.js";
import { ShopifyAdminClient } from "./shopify-client.js";
import { executeRegisteredOperation } from "./operation-registry.js";

const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});

export async function handleKairosApiRequest(request, env, ctx) {
  const requestId = request.headers.get("X-Request-ID") || crypto.randomUUID();
  try {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json(200, {
        ok: true,
        service: "mmg-kairos",
        runtime: "cloudflare",
        vercel: false,
        openAi: false,
        deterministic: true,
        shopifyWritesEnabled: isTrue(env?.KAIROS_SHOPIFY_WRITES_ENABLED),
        requestId,
      });
    }

    await authenticateRuntimeRequest(request, env);

    if (request.method === "GET" && url.pathname === "/api/kairos/doctrine") {
      return json(200, { doctrine: SHOPIFY_DOCTRINE, requestId });
    }

    if (request.method === "GET" && url.pathname === "/api/kairos/workflows") {
      return json(200, { workflows: listWorkflows(), requestId });
    }

    if (request.method === "POST" && url.pathname === "/api/kairos/manifest") {
      const body = await readJson(request);
      const manifest = createOperationManifest(body);
      if (manifest.writeApprovalRequired) {
        const headerApproval = request.headers.get("X-Kairos-Explicit-Approval");
        if (!headerApproval || headerApproval !== manifest.approvalRef) {
          throw apiError(
            "EXPLICIT_APPROVAL_CONFIRMATION_REQUIRED",
            "The approval reference must also be supplied in X-Kairos-Explicit-Approval.",
            403,
          );
        }
      }
      const signedManifest = await signManifest(manifest, env);
      return json(201, { manifest: signedManifest, requestId });
    }

    if (request.method === "POST" && url.pathname === "/api/kairos/execute") {
      const body = await readJson(request);
      await verifyManifestSignature(body?.manifest, env);
      const authorization = authorizeOperation({
        manifest: body.manifest,
        operationName: body?.operationName,
        args: body?.args,
        env,
        idempotencyKey: body?.idempotencyKey,
      });

      const replay = await readIdempotentReceipt(env, authorization);
      if (replay) return json(200, { receipt: replay, replayed: true, requestId });

      const shopifyClient = body.operationName.startsWith("shopify.")
        ? new ShopifyAdminClient(env)
        : null;
      const result = await executeRegisteredOperation({
        operationName: body.operationName,
        args: body.args || {},
        shopifyClient,
      });
      const receipt = await createReceipt({
        requestId,
        manifest: body.manifest,
        authorization,
        result,
      });
      await persistReceipt(env, ctx, receipt, authorization);
      return json(200, { receipt, replayed: false, requestId });
    }

    if (request.method === "POST" && url.pathname === "/api/kairos/verify-shopify") {
      const target = String(env?.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
      const manifest = createOperationManifest({
        workflowId: "shopify.verify.connection.v1",
        targetIds: [target],
      });
      const signedManifest = await signManifest(manifest, env);
      const authorization = authorizeOperation({
        manifest: signedManifest,
        operationName: "shopify.verifyInstallation",
        args: {},
        env,
      });
      const result = await executeRegisteredOperation({
        operationName: "shopify.verifyInstallation",
        args: {},
        shopifyClient: new ShopifyAdminClient(env),
      });
      const receipt = await createReceipt({ requestId, manifest: signedManifest, authorization, result });
      await persistReceipt(env, ctx, receipt, authorization);
      return json(200, { receipt, requestId });
    }

    return json(404, { error: { code: "NOT_FOUND", message: "Kairos API route not found." }, requestId });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json(status, {
      error: {
        code: error?.code || "INTERNAL_ERROR",
        message: status >= 500 && !error?.code ? "Kairos runtime failure." : String(error?.message || "Request failed."),
        ...(error?.details ? { details: error.details } : {}),
      },
      requestId,
    });
  }
}

async function authenticateRuntimeRequest(request, env) {
  const expected = String(env?.KAIROS_RUNTIME_TOKEN || "").trim();
  if (!expected) {
    throw apiError("RUNTIME_TOKEN_MISSING", "KAIROS_RUNTIME_TOKEN is not configured.", 503);
  }
  const authorization = request.headers.get("Authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!supplied || !(await constantTimeEqual(supplied, expected))) {
    throw apiError("UNAUTHORIZED", "A valid Kairos bearer token is required.", 401);
  }
}

async function signManifest(manifest, env) {
  const key = requireSigningKey(env);
  const signature = await hmac(key, canonicalJson(manifest));
  return Object.freeze({ ...manifest, signature });
}

async function verifyManifestSignature(manifest, env) {
  if (!manifest?.signature) throw apiError("MANIFEST_SIGNATURE_REQUIRED", "The manifest is unsigned.", 401);
  const { signature, ...unsigned } = manifest;
  const expected = await hmac(requireSigningKey(env), canonicalJson(unsigned));
  if (!(await constantTimeEqual(signature, expected))) {
    throw apiError("MANIFEST_SIGNATURE_INVALID", "The manifest signature is invalid.", 401);
  }
}

function requireSigningKey(env) {
  const key = String(env?.KAIROS_MANIFEST_SIGNING_KEY || "").trim();
  if (!key) {
    throw apiError(
      "MANIFEST_SIGNING_KEY_MISSING",
      "KAIROS_MANIFEST_SIGNING_KEY is not configured.",
      503,
    );
  }
  return key;
}

async function createReceipt({ requestId, manifest, authorization, result }) {
  const completedAt = new Date().toISOString();
  const receipt = {
    receiptVersion: "1.0",
    receiptId: crypto.randomUUID(),
    requestId,
    manifestId: manifest.manifestId,
    workflowId: manifest.workflowId,
    doctrineVersion: manifest.doctrineVersion,
    operationName: authorization.operationName,
    targetType: manifest.targetType,
    targetId: authorization.targetId,
    approvalRef: authorization.approvalRef,
    idempotencyKey: authorization.idempotencyKey,
    completedAt,
    result,
  };
  return Object.freeze({ ...receipt, digestSha256: await sha256(canonicalJson(receipt)) });
}

async function readIdempotentReceipt(env, authorization) {
  if (!authorization.idempotencyKey || !env?.KAIROS_RECEIPTS?.get) return null;
  const raw = await env.KAIROS_RECEIPTS.get(`idempotency:${authorization.idempotencyKey}`);
  if (!raw) return null;
  const receipt = JSON.parse(raw);
  if (
    receipt.operationName !== authorization.operationName ||
    receipt.targetId !== authorization.targetId ||
    receipt.manifestId !== authorization.manifestId
  ) {
    throw apiError(
      "IDEMPOTENCY_COLLISION",
      "The idempotency key was already used for a different operation scope.",
      409,
    );
  }
  return receipt;
}

async function persistReceipt(env, ctx, receipt, authorization) {
  if (!env?.KAIROS_RECEIPTS?.put) return;
  const options = { expirationTtl: 60 * 60 * 24 * 90 };
  const writes = [
    env.KAIROS_RECEIPTS.put(`receipt:${receipt.receiptId}`, JSON.stringify(receipt), options),
  ];
  if (authorization.idempotencyKey) {
    writes.push(
      env.KAIROS_RECEIPTS.put(
        `idempotency:${authorization.idempotencyKey}`,
        JSON.stringify(receipt),
        options,
      ),
    );
  }
  const work = Promise.all(writes);
  if (ctx?.waitUntil) ctx.waitUntil(work);
  else await work;
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 2_000_000) throw apiError("REQUEST_TOO_LARGE", "Request body exceeds 2 MB.", 413);
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw apiError("JSON_REQUIRED", "Content-Type application/json is required.", 415);
  }
  try {
    return await request.json();
  } catch {
    throw apiError("INVALID_JSON", "The request body is not valid JSON.", 400);
  }
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(signature));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function constantTimeEqual(left, right) {
  const [a, b] = await Promise.all([sha256(String(left)), sha256(String(right))]);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function canonicalJson(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function isTrue(value) {
  return String(value || "").toLowerCase() === "true";
}

function apiError(code, message, status, details = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}
