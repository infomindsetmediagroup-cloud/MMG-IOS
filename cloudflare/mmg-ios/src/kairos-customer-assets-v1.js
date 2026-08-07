export const KAIROS_CUSTOMER_ASSETS_BUILD = "kairos-customer-assets-20260807-1-private-r2";

const COLLECTION_ROUTE = /^\/api\/kairos\/customer\/projects\/([^/]+)\/files\/?$/i;
const ITEM_ROUTE = /^\/api\/kairos\/customer\/projects\/([^/]+)\/files\/([^/]+)\/?$/i;
const INTERNAL_PROJECT_PATH = "/registry/kairos-customer-runtime-projections";
const DEFAULT_STOREFRONT_DOMAIN = "themindsetmediagroup.com";
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "txt", "rtf", "md", "epub",
  "png", "jpg", "jpeg", "webp", "gif", "svg",
  "zip", "csv", "xlsx", "pptx",
]);

export async function handleKairosCustomerAssetAPI(request, env) {
  const url = new URL(request.url);
  const itemMatch = url.pathname.match(ITEM_ROUTE);
  const collectionMatch = itemMatch ? null : url.pathname.match(COLLECTION_ROUTE);
  if (!itemMatch && !collectionMatch) return null;

  if (request.method === "OPTIONS") return corsPreflight(request, env);

  const identity = await authenticateCustomer(request, env);
  if (!identity) {
    return json(request, env, {
      success: false,
      error: { code: "CUSTOMER_AUTH_REQUIRED", message: "Authenticated Shopify customer access is required." },
    }, 401);
  }

  const projectId = decodeSegment((itemMatch || collectionMatch)[1]);
  if (!projectId) return badRequest(request, env, "CUSTOMER_PROJECT_ID_INVALID", "Project ID is required.");

  const projectAccess = await authorizeProject(env, identity.kairosCustomerId, projectId);
  if (!projectAccess.ok) return copyResponse(request, env, projectAccess.response);

  if (!env?.KAIROS_CUSTOMER_ASSETS) {
    return json(request, env, {
      success: false,
      error: { code: "CUSTOMER_ASSET_STORAGE_UNAVAILABLE", message: "Private customer asset storage is unavailable." },
    }, 503);
  }

  const namespace = await assetNamespace(identity.shopifyCustomerId, projectId);

  if (itemMatch) {
    if (request.method !== "GET") return method(request, env, "GET");
    return downloadAsset(request, env, namespace, decodeSegment(itemMatch[2]));
  }

  if (request.method === "GET") return listAssets(request, env, namespace);
  if (request.method === "PUT" || request.method === "POST") {
    return uploadAsset(request, env, namespace, projectId);
  }
  return method(request, env, "GET, PUT, POST");
}

async function listAssets(request, env, namespace) {
  const listing = await env.KAIROS_CUSTOMER_ASSETS.list({
    prefix: namespace,
    limit: 100,
    include: ["httpMetadata", "customMetadata"],
  });

  const assets = (listing.objects || []).map((object) => publicAsset(object)).filter(Boolean);
  return json(request, env, {
    success: true,
    count: assets.length,
    truncated: Boolean(listing.truncated),
    assets,
    build: KAIROS_CUSTOMER_ASSETS_BUILD,
  });
}

async function uploadAsset(request, env, namespace, projectId) {
  const fileName = safeFileName(
    request.headers.get("x-kairos-file-name") || new URL(request.url).searchParams.get("filename"),
  );
  if (!fileName) {
    return badRequest(request, env, "CUSTOMER_ASSET_FILENAME_REQUIRED", "A supported file name is required.");
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return badRequest(request, env, "CUSTOMER_ASSET_TYPE_UNSUPPORTED", "This file type is not supported.");
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  const maxBytes = positiveInteger(env?.KAIROS_CUSTOMER_ASSET_MAX_BYTES, DEFAULT_MAX_BYTES);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return badRequest(request, env, "CUSTOMER_ASSET_LENGTH_REQUIRED", "A non-empty file with a known size is required.");
  }
  if (contentLength > maxBytes) {
    return json(request, env, {
      success: false,
      error: { code: "CUSTOMER_ASSET_TOO_LARGE", message: `File exceeds the ${maxBytes}-byte upload limit.` },
    }, 413);
  }

  const assetId = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const contentType = clean(request.headers.get("content-type"), 255) || "application/octet-stream";
  const key = `${namespace}${assetId}-${fileName}`;

  await env.KAIROS_CUSTOMER_ASSETS.put(key, request.body, {
    httpMetadata: { contentType },
    customMetadata: {
      assetId,
      projectId: clean(projectId, 180),
      originalName: fileName,
      uploadedAt,
    },
  });

  return json(request, env, {
    success: true,
    asset: { assetId, fileName, contentType, size: contentLength, uploadedAt },
    build: KAIROS_CUSTOMER_ASSETS_BUILD,
  }, 201);
}

async function downloadAsset(request, env, namespace, assetId) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(assetId)) {
    return notFound(request, env);
  }

  const listing = await env.KAIROS_CUSTOMER_ASSETS.list({
    prefix: `${namespace}${assetId}-`,
    limit: 1,
    include: ["httpMetadata", "customMetadata"],
  });
  const candidate = listing.objects?.[0];
  if (!candidate) return notFound(request, env);

  const object = await env.KAIROS_CUSTOMER_ASSETS.get(candidate.key);
  if (!object) return notFound(request, env);

  const fileName = safeFileName(object.customMetadata?.originalName) || "download";
  const headers = responseHeaders(request, env);
  headers.set("Content-Type", clean(object.httpMetadata?.contentType, 255) || "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  if (Number.isFinite(object.size)) headers.set("Content-Length", String(object.size));
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

async function authenticateCustomer(request, env) {
  const authorization = clean(request.headers.get("authorization"), 4096);
  if (!authorization) return null;
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return null;

  const storefrontDomain = storefrontDomainFromEnv(env);
  try {
    const discoveryResponse = await fetch(`https://${storefrontDomain}/.well-known/customer-account-api`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!discoveryResponse.ok) return null;
    const discovery = await discoveryResponse.json().catch(() => ({}));
    const graphqlEndpoint = clean(discovery?.graphql_api, 1024);
    if (!graphqlEndpoint || !/^https:\/\//i.test(graphqlEndpoint)) return null;

    const identityResponse = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: accessToken,
      },
      body: JSON.stringify({
        operationName: "KairosCustomerIdentity",
        query: "query KairosCustomerIdentity { customer { id } }",
        variables: {},
      }),
    });
    if (!identityResponse.ok) return null;
    const payload = await identityResponse.json().catch(() => ({}));
    if (Array.isArray(payload?.errors) && payload.errors.length) return null;
    const shopifyCustomerId = clean(payload?.data?.customer?.id, 255);
    if (!/^gid:\/\/shopify\/Customer\/\d+$/i.test(shopifyCustomerId)) return null;
    return {
      shopifyCustomerId,
      kairosCustomerId: mapKairosCustomerId(shopifyCustomerId, env),
    };
  } catch {
    return null;
  }
}

async function authorizeProject(env, customerId, projectId) {
  if (!env?.KAIROS_PROJECTS) {
    return {
      ok: false,
      response: new Response(JSON.stringify({
        success: false,
        error: { code: "CUSTOMER_RUNTIME_STORAGE_UNAVAILABLE", message: "Customer runtime storage is unavailable." },
      }), { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } }),
    };
  }
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry"));
  const response = await stub.fetch(new Request(`https://kairos.internal${INTERNAL_PROJECT_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "customer-read", customerId, projectId }),
  }));
  return response.ok ? { ok: true } : { ok: false, response };
}

function mapKairosCustomerId(shopifyCustomerId, env) {
  const rawMap = clean(env?.KAIROS_SHOPIFY_CUSTOMER_MAP, 65535);
  if (rawMap) {
    try {
      const parsed = JSON.parse(rawMap);
      const mapped = clean(parsed?.[shopifyCustomerId], 180);
      if (mapped) return mapped;
    } catch {
      // Invalid optional mapping must never weaken authentication.
    }
  }
  return clean(shopifyCustomerId, 180);
}

function storefrontDomainFromEnv(env) {
  const explicit = clean(env?.KAIROS_SHOPIFY_STOREFRONT_DOMAIN, 255);
  if (explicit) return explicit.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const origin = clean(env?.MMG_STOREFRONT_ORIGIN, 1024);
  if (origin) {
    try { return new URL(origin).hostname; } catch { /* fall through */ }
  }
  return DEFAULT_STOREFRONT_DOMAIN;
}

async function assetNamespace(shopifyCustomerId, projectId) {
  const customerDigest = await sha256Hex(shopifyCustomerId);
  const projectDigest = await sha256Hex(projectId);
  return `customers/${customerDigest}/projects/${projectDigest}/assets/`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicAsset(object) {
  const assetId = clean(object.customMetadata?.assetId, 100);
  const fileName = safeFileName(object.customMetadata?.originalName);
  if (!assetId || !fileName) return null;
  return {
    assetId,
    fileName,
    size: Number(object.size || 0),
    contentType: clean(object.httpMetadata?.contentType, 255) || "application/octet-stream",
    uploadedAt: clean(object.customMetadata?.uploadedAt, 64) || null,
  };
}

function safeFileName(value) {
  const text = clean(value, 180)
    .replace(/[\\/]+/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._()\- ]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return text && text !== "." && text !== ".." ? text : "";
}

function decodeSegment(value) {
  try { return clean(decodeURIComponent(String(value || "")), 180); } catch { return ""; }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function copyResponse(request, env, response) {
  const headers = responseHeaders(request, env);
  for (const [key, value] of response.headers) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function notFound(request, env) {
  return json(request, env, {
    success: false,
    error: { code: "CUSTOMER_ASSET_NOT_FOUND", message: "File was not found." },
  }, 404);
}

function badRequest(request, env, code, message) {
  return json(request, env, { success: false, error: { code, message } }, 400);
}

function method(request, env, allowed) {
  const response = json(request, env, {
    success: false,
    error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed}.` },
  }, 405);
  response.headers.set("Allow", allowed);
  return response;
}

function corsPreflight(request, env) {
  const headers = responseHeaders(request, env);
  headers.set("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Kairos-File-Name");
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

function json(request, env, value, status = 200) {
  const headers = responseHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { status, headers });
}

function responseHeaders(request, env) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Kairos-Customer-Assets": KAIROS_CUSTOMER_ASSETS_BUILD,
    "X-Content-Type-Options": "nosniff",
  });
  const allowedOrigin = clean(env?.MMG_STOREFRONT_ORIGIN, 1024) || "https://themindsetmediagroup.com";
  const origin = clean(request.headers.get("origin"), 1024);
  if (origin && origin === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}
