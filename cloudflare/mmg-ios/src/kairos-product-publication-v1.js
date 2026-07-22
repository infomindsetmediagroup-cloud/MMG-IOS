const BUILD = "kairos-product-publication-20260722-2";
const TTL = 60 * 60 * 24;
const tokenCache = new Map();
const APPROVED_TEMPLATE_SUFFIXES = new Set(["mmg-book-product", "mmg-ai-image-mastery", "mmg-digital-download"]);

export async function handleProductPublication(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/shopify/product-publication/prepare" && request.method === "POST") return prepare(request, env);
  if (url.pathname === "/api/shopify/product-publication/execute" && request.method === "POST") return execute(request, env);
  if (url.pathname === "/api/shopify/product-publication/rollback" && request.method === "POST") return rollback(request, env);
  const match = url.pathname.match(/^\/api\/shopify\/product-publication\/records\/([a-f0-9-]+)$/i);
  if (match && request.method === "GET") return readRecord(request, match[1]);
  return null;
}

async function prepare(request, env) {
  try {
    const body = await request.json();
    const projectId = String(body?.projectId || "").trim();
    const price = normalizePrice(body?.price);
    if (!/^[a-f0-9-]{20,}$/i.test(projectId)) throw err(400, "project_id_required", "A completed Kairos product project is required.");
    if (!price) throw err(400, "price_required", "Set the approved Shopify price before preparing the product.");

    const status = await fetchProjectJSON(request, projectId, "");
    if (status?.status !== "completed") throw err(409, "project_not_complete", "The complete-product project must finish before Shopify handoff.");
    const product = await fetchProjectJSON(request, projectId, "/artifacts/product-package.json");
    if (!product?.title || !product?.handle || !product?.shopifyHTML) throw err(422, "product_package_invalid", "The project did not produce a valid Shopify product package.");

    const existing = await findProduct(env, product.handle);
    const releaseId = crypto.randomUUID();
    const templateSuffix = normalizeTemplateSuffix(body?.templateSuffix, product.title);
    const desired = {
      title: String(product.title).slice(0, 255),
      handle: String(product.handle).slice(0, 255),
      descriptionHtml: String(product.shopifyHTML),
      productType: String(body?.productType || product.productType || "Digital Download").slice(0, 255),
      tags: Array.isArray(product.tags) ? product.tags.map(String).slice(0, 40) : [],
      seo: { title: String(product?.seo?.title || product.title).slice(0, 70), description: String(product?.seo?.metaDescription || product.shortDescription || "").slice(0, 320) },
      status: "DRAFT",
      templateSuffix,
      price,
    };
    const record = {
      releaseId,
      projectId,
      build: BUILD,
      status: "awaiting-executive-approval",
      createdAt: new Date().toISOString(),
      action: existing ? "update-draft-product" : "create-draft-product",
      existing: existing ? snapshot(existing) : null,
      desired,
      source: { title: status.title, author: status.author || null, wordCount: status.wordCount, pageCount: status.pageCount, coverProvided: Boolean(status.coverProvided), artifacts: status.artifacts || [] },
      confirmationRequired: existing ? "UPDATE PRODUCT DRAFT" : "CREATE PRODUCT DRAFT",
      safeguards: { draftOnly: true, storefrontPublicationAuthorized: false, priceApprovalRequired: false, canonicalPriceApplied: true, templateAllowlisted: true, liveProductUntouchedUntilSeparateApproval: true, rollbackRequired: true },
    };
    await save(request, record);
    return json(record, 201);
  } catch (error) { return failure(error, "product_publication_prepare_failed"); }
}

async function execute(request, env) {
  try {
    const body = await request.json();
    const record = await load(request, String(body?.releaseId || ""));
    if (!record) throw err(404, "product_release_not_found", "The product release package expired or was not found.");
    if (record.status !== "awaiting-executive-approval") throw err(409, "product_release_state_invalid", "This product release is not awaiting approval.");
    if (String(body?.confirmation || "") !== record.confirmationRequired) throw err(403, "product_confirmation_required", `Type ${record.confirmationRequired} to authorize the draft product operation.`);

    const current = await findProduct(env, record.desired.handle);
    if (record.existing && (!current || current.id !== record.existing.id || current.updatedAt !== record.existing.updatedAt)) throw err(409, "product_changed", "The Shopify product changed after preparation. Prepare a new release.");
    if (!record.existing && current) throw err(409, "product_now_exists", "A Shopify product with this handle now exists. Prepare a new release.");

    const product = current ? await updateProduct(env, current.id, record.desired) : await createProduct(env, record.desired);
    await updateVariantPrice(env, product.id, record.desired.price);
    const verified = await findProduct(env, record.desired.handle);
    if (!verified || verified.id !== product.id || verified.status !== "DRAFT") throw err(502, "product_draft_verification_failed", "Shopify did not verify the approved draft product.");
    if ((verified.templateSuffix || "") !== record.desired.templateSuffix) throw err(502, "product_template_verification_failed", "Shopify did not verify the approved custom product template.");

    const updated = {
      ...record,
      status: "draft-created-and-verified",
      executedAt: new Date().toISOString(),
      executedBy: String(body?.actor || "Executive").slice(0, 120),
      result: snapshot(verified),
      previewURL: `https://${storeDomain(env)}/products/${encodeURIComponent(verified.handle)}`,
      rollback: { created: !record.existing, productId: verified.id, prior: record.existing },
      nextAction: "Install the generated product media, review the exact custom-template preview, then use Product Launch Control for live publication.",
    };
    await save(request, updated);
    return json(updated);
  } catch (error) { return failure(error, "product_publication_execute_failed"); }
}

async function rollback(request, env) {
  try {
    const body = await request.json();
    const record = await load(request, String(body?.releaseId || ""));
    if (!record?.rollback) throw err(409, "rollback_unavailable", "No product rollback package is available.");
    if (String(body?.confirmation || "") !== "ROLL BACK PRODUCT DRAFT") throw err(403, "rollback_confirmation_required", "Type ROLL BACK PRODUCT DRAFT to authorize rollback.");
    const current = await findProductById(env, record.rollback.productId);
    if (!current) throw err(404, "product_missing", "The Shopify draft product no longer exists.");
    if (record.rollback.created) await deleteProduct(env, current.id);
    else await updateProduct(env, current.id, { ...record.rollback.prior, status: record.rollback.prior.status || "DRAFT", seo: record.rollback.prior.seo || {} });
    const updated = { ...record, status: "rolled-back", rolledBackAt: new Date().toISOString(), rolledBackBy: String(body?.actor || "Executive").slice(0, 120) };
    await save(request, updated);
    return json(updated);
  } catch (error) { return failure(error, "product_publication_rollback_failed"); }
}

async function fetchProjectJSON(request, projectId, suffix) {
  const origin = new URL(request.url).origin;
  const response = await fetch(`${origin}/api/publishing/jobs/${encodeURIComponent(projectId)}${suffix}`, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw err(response.status || 502, "project_artifact_unavailable", body?.error?.message || "Kairos could not retrieve the completed product package.");
  return body;
}

async function findProduct(env, handle) {
  const data = await gql(env, `query($q:String!){products(first:2,query:$q){nodes{id title handle descriptionHtml productType tags status templateSuffix updatedAt seo{title description} variants(first:1){nodes{id price}}}}}`, { q: `handle:${handle}` });
  return data?.products?.nodes?.[0] || null;
}

async function findProductById(env, id) {
  const data = await gql(env, `query($id:ID!){product(id:$id){id title handle descriptionHtml productType tags status templateSuffix updatedAt seo{title description} variants(first:1){nodes{id price}}}}`, { id });
  return data?.product || null;
}

async function createProduct(env, desired) {
  const data = await gql(env, `mutation($product:ProductCreateInput!){productCreate(product:$product){product{id} userErrors{field message}}}`, { product: input(desired) });
  reject(data?.productCreate); return data.productCreate.product;
}

async function updateProduct(env, id, desired) {
  const data = await gql(env, `mutation($product:ProductUpdateInput!){productUpdate(product:$product){product{id} userErrors{field message}}}`, { product: { id, ...input(desired) } });
  reject(data?.productUpdate); return data.productUpdate.product;
}

async function updateVariantPrice(env, productId, price) {
  const current = await findProductById(env, productId); const variantId = current?.variants?.nodes?.[0]?.id;
  if (!variantId) throw err(502, "product_variant_missing", "Shopify did not provide the product's default variant.");
  const data = await gql(env, `mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){productVariants{id price} userErrors{field message}}}`, { productId, variants: [{ id: variantId, price }] });
  reject(data?.productVariantsBulkUpdate);
}

async function deleteProduct(env, id) {
  const data = await gql(env, `mutation($input:ProductDeleteInput!){productDelete(input:$input){deletedProductId userErrors{field message}}}`, { input: { id } }); reject(data?.productDelete);
}

function input(value) { return { title:value.title, handle:value.handle, descriptionHtml:value.descriptionHtml, productType:value.productType, tags:value.tags, status:value.status, templateSuffix:value.templateSuffix, seo:value.seo }; }
function snapshot(p) { return { id:p.id, title:p.title, handle:p.handle, descriptionHtml:p.descriptionHtml, productType:p.productType, tags:p.tags || [], status:p.status, templateSuffix:p.templateSuffix || "", updatedAt:p.updatedAt, seo:p.seo || {}, price:p.variants?.nodes?.[0]?.price || null }; }
function reject(payload) { const list = payload?.userErrors || []; if (list.length) throw err(422, "shopify_mutation_rejected", list.map(x => x.message).join("; ")); }

async function gql(env, query, variables) {
  const store = storeDomain(env), version = String(env.SHOPIFY_API_VERSION || "2026-07").trim(), auth = await accessToken(env, store);
  const response = await fetch(`https://${store}/admin/api/${version}/graphql.json`, { method:"POST", headers:{"X-Shopify-Access-Token":auth,"Content-Type":"application/json"}, body:JSON.stringify({query,variables}) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw err(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify returned ${response.status}.`);
  if (body.errors?.length) throw err(422, "shopify_graphql_error", body.errors.map(x => x.message).join("; "));
  return body.data || {};
}

async function accessToken(env, store) {
  const id=String(env.SHOPIFY_CLIENT_ID||"").trim(), secret=String(env.SHOPIFY_CLIENT_SECRET||"").trim(), key=`${store}:${id}`;
  if (id&&secret) { const cached=tokenCache.get(key); if(cached?.expires>Date.now()) return cached.token; const r=await fetch(`https://${store}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"client_credentials",client_id:id,client_secret:secret})}); const b=await r.json().catch(()=>({})); if(!r.ok||!b.access_token)throw err(401,"shopify_auth_failed","Shopify client credentials failed."); tokenCache.set(key,{token:b.access_token,expires:Date.now()+3300000}); return b.access_token; }
  const token=String(env.SHOPIFY_ADMIN_ACCESS_TOKEN||"").trim(); if(!token)throw err(503,"shopify_not_configured","Shopify credentials are not configured."); return token;
}

function normalizeTemplateSuffix(value, title) {
  const requested = String(value || "").trim();
  const fallback = /\bai image mastery\b/i.test(String(title || "")) ? "mmg-ai-image-mastery" : "mmg-book-product";
  const candidate = requested || fallback;
  if (!APPROVED_TEMPLATE_SUFFIXES.has(candidate)) throw err(400, "product_template_not_approved", "The requested Shopify product template is not approved by the MMG digital-product contract.");
  return candidate;
}

function storeDomain(env) { const value=String(env.SHOPIFY_STORE_DOMAIN||"").trim().toLowerCase(); if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value))throw err(503,"shopify_invalid_domain","Shopify store domain is invalid."); return value; }
function normalizePrice(value) { const number=Number(value); return Number.isFinite(number)&&number>=0.5&&number<=10000 ? number.toFixed(2) : null; }
function recordRequest(request,id){return new Request(`${new URL(request.url).origin}/__kairos/product-publication/${id}`);}
async function save(request,record){await caches.default.put(recordRequest(request,record.releaseId),new Response(JSON.stringify(record),{headers:{"Content-Type":"application/json","Cache-Control":`max-age=${TTL}`}}));}
async function load(request,id){const r=await caches.default.match(recordRequest(request,id));return r?r.json():null;}
async function readRecord(request,id){const r=await load(request,id);return r?json(r):json({status:"not-found",error:{message:"Product publication record not found."}},404);}
function err(status,code,message){return Object.assign(new Error(message),{status,code});}
function failure(error,code){return json({status:"failed",build:BUILD,error:{code:error?.code||code,message:error instanceof Error?error.message:"Product publication failed."}},Number(error?.status||500));}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Kairos-Product-Publication":BUILD}});}
