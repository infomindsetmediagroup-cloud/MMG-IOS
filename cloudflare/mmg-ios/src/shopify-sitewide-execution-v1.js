import { deleteThemeFiles, hashText, inspectStagingSource, writeThemeFiles } from "./kairos-compact-homepage-utils-v1.js";

const BUILD = "shopify-sitewide-execution-20260712-1";
const TTL = 60 * 60 * 6;
const ALLOWED_PREFIXES = ["templates/", "sections/", "snippets/", "assets/", "layout/", "config/", "locales/"];

export async function handleSitewideExecutionRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/shopify/sitewide/prepare" && request.method === "POST") return prepare(request, env);
  if (url.pathname === "/api/shopify/sitewide/execute" && request.method === "POST") return execute(request, env);
  if (url.pathname === "/api/shopify/sitewide/rollback" && request.method === "POST") return rollback(request, env);
  const match = url.pathname.match(/^\/api\/shopify\/sitewide\/jobs\/([a-f0-9-]+)$/i);
  if (match && request.method === "GET") return readJob(request, match[1]);
  return null;
}

async function prepare(request, env) {
  try {
    const body = await request.json();
    const pkg = validatePackage(body?.package);
    const filenames = pkg.manifest.map(file => file.filename);
    const source = await inspectStagingSource(null, request, env, BUILD, filenames);
    const files = new Map((source?.evidence?.files || []).map(file => [file.filename, file]));
    const targetTheme = source?.evidence?.stagingTheme;
    const publishedTheme = source?.evidence?.mainTheme;
    validateThemes(targetTheme, publishedTheme);

    const resource = await resolveResource(env, pkg.page);
    const sourceHashes = Object.fromEntries(filenames.map(name => [name, files.get(name)?.sha256 || null]));
    const changes = pkg.manifest.map(file => ({
      filename: file.filename,
      changeType: files.has(file.filename) ? "replace" : "create",
      purpose: file.purpose,
      beforeSha256: files.get(file.filename)?.sha256 || null,
      afterSha256: file.sha256,
      bytes: file.bytes
    }));
    const planID = crypto.randomUUID();
    const result = {
      status: "ready-for-approval",
      build: BUILD,
      planID,
      packageID: pkg.packageID,
      summary: `Kairos prepared a site-wide staging package for ${pkg.page.title}.`,
      objective: pkg.page.objective,
      plan: {
        engine: BUILD,
        requestType: pkg.page.pageType,
        resourceType: pkg.page.resourceType,
        targetTheme,
        publishedTheme,
        sourceHashes,
        changes,
        manifest: pkg.manifest,
        resource,
        assignment: assignmentPlan(pkg.page, resource),
        preview: previewPlan(env, pkg.page, targetTheme, resource),
        liveThemeMutationAuthorized: false,
        resourcePublicationAuthorized: false,
        navigationMutationAuthorized: false,
        safeguards: pkg.safeguards
      },
      approvalRequirements: [
        "Confirm the target is Kairos Staging and not the published theme.",
        "Confirm every file and resource assignment shown in this proposal.",
        "Approve the staging installation only; publication remains separate.",
        "Require visual verification before any live resource assignment."
      ]
    };
    await storeJob(request, planID, { status:"completed", result });
    return json({ jobID:planID, status:"completed", pollURL:`/api/shopify/sitewide/jobs/${planID}`, result }, 202);
  } catch (error) { return fail(error, "sitewide_prepare_failed"); }
}

async function execute(request, env) {
  try {
    const body = await request.json();
    const plan = body?.plan?.plan ? body.plan : body?.plan;
    const approval = body?.approval;
    validateApproval(plan, approval);
    const manifest = plan.plan.manifest;
    const filenames = manifest.map(file => file.filename);
    const source = await inspectStagingSource(null, request, env, BUILD, filenames);
    const current = new Map((source?.evidence?.files || []).map(file => [file.filename, file]));
    const staging = source?.evidence?.stagingTheme;
    const main = source?.evidence?.mainTheme;
    validateThemes(staging, main);
    if (staging.gid !== plan.plan.targetTheme.gid || approval.targetThemeID !== staging.gid) throw err(409,"staging_theme_changed","Kairos Staging changed after approval.");
    if (main.gid !== plan.plan.publishedTheme.gid) throw err(409,"published_theme_changed","The published theme changed after approval.");
    for (const name of filenames) {
      const actual = current.get(name)?.sha256 || null;
      if ((plan.plan.sourceHashes[name] || null) !== actual || (approval.sourceHashes?.[name] || null) !== actual) throw err(409,"source_hash_mismatch",`${name} changed after approval.`);
    }
    for (const file of manifest) {
      if (await hashText(file.content) !== file.sha256) throw err(409,"manifest_hash_mismatch",`${file.filename} no longer matches the approved package.`);
    }

    const rollbackFiles = filenames.map(name => {
      const file = current.get(name);
      return file ? { filename:name, existed:true, sha256:file.sha256, content:file.content } : { filename:name, existed:false, sha256:null, content:null };
    });
    const write = await writeThemeFiles(env, staging.gid, manifest.map(file => ({ filename:file.filename, content:file.content })));
    const verify = await inspectStagingSource(null, request, env, BUILD, filenames);
    const verified = new Map((verify?.evidence?.files || []).map(file => [file.filename, file]));
    const verification = manifest.map(file => {
      const actual = verified.get(file.filename);
      if (!actual || actual.sha256 !== file.sha256) throw err(502,"sitewide_readback_mismatch",`Shopify read-back failed for ${file.filename}.`);
      return { filename:file.filename, expectedSha256:file.sha256, actualSha256:actual.sha256, matched:true, bytes:actual.bytes };
    });
    if (verify?.evidence?.mainTheme?.gid !== main.gid) throw err(502,"live_theme_changed","The live theme changed during staging execution.");

    const resourceResult = await ensurePreviewResource(env, plan.plan.resource, plan.plan.assignment);
    const executionID = crypto.randomUUID();
    const result = {
      status:"completed",
      build:BUILD,
      actionID:executionID,
      summary:`Kairos installed and verified the approved ${plan.plan.requestType} package on Kairos Staging.`,
      execution:{
        targetTheme:verify.evidence.stagingTheme,
        publishedTheme:verify.evidence.mainTheme,
        publishedThemeChanged:false,
        filesWritten:verification,
        resource:resourceResult,
        pendingLiveAssignment:plan.plan.assignment,
        preview:refreshPreview(plan.plan.preview, resourceResult),
        productionPublishAuthorized:false
      },
      verification,
      rollback:{
        targetThemeID:staging.gid,
        currentHashes:Object.fromEntries(verification.map(item=>[item.filename,item.actualSha256])),
        files:rollbackFiles,
        resource:resourceResult?.createdForPreview ? { action:"delete-unpublished-preview-page", id:resourceResult.id } : null,
        publicationRequired:false
      },
      nextAction:"Open the staging preview, complete mobile and desktop visual verification, then move the approved assignment into Release Control."
    };
    await storeJob(request, executionID, { status:"completed", result });
    return json({ jobID:executionID, status:"completed", pollURL:`/api/shopify/sitewide/jobs/${executionID}`, result },202);
  } catch (error) { return fail(error, "sitewide_execute_failed"); }
}

async function rollback(request, env) {
  try {
    const body = await request.json();
    const pkg = body?.rollback;
    const approval = body?.approval;
    if (!pkg?.targetThemeID || !Array.isArray(pkg?.files) || !pkg.files.length) throw err(400,"rollback_required","A site-wide rollback package is required.");
    if (approval?.status !== "approved" || approval?.targetThemeID !== pkg.targetThemeID) throw err(403,"rollback_approval_required","Explicit matching rollback approval is required.");
    const names = pkg.files.map(file=>file.filename);
    const source = await inspectStagingSource(null, request, env, BUILD, names);
    const staging = source?.evidence?.stagingTheme;
    const main = source?.evidence?.mainTheme;
    validateThemes(staging, main);
    if (staging.gid !== pkg.targetThemeID) throw err(409,"rollback_target_changed","The staging theme changed before rollback.");
    const current = new Map((source?.evidence?.files || []).map(file=>[file.filename,file]));
    for (const name of names) if ((pkg.currentHashes?.[name] || null) !== (current.get(name)?.sha256 || null)) throw err(409,"rollback_hash_mismatch",`${name} changed after rollback approval.`);
    const restore = pkg.files.filter(file=>file.existed).map(file=>({filename:file.filename,content:file.content}));
    const remove = pkg.files.filter(file=>!file.existed).map(file=>file.filename);
    if (restore.length) await writeThemeFiles(env, staging.gid, restore);
    if (remove.length) await deleteThemeFiles(env, staging.gid, remove);
    const verify = await inspectStagingSource(null, request, env, BUILD, names);
    const after = new Map((verify?.evidence?.files || []).map(file=>[file.filename,file]));
    for (const file of pkg.files) {
      if (file.existed && after.get(file.filename)?.sha256 !== file.sha256) throw err(502,"rollback_verify_failed",`${file.filename} was not restored.`);
      if (!file.existed && after.has(file.filename)) throw err(502,"rollback_delete_failed",`${file.filename} was not removed.`);
    }
    if (pkg.resource?.action === "delete-unpublished-preview-page" && pkg.resource.id) await deletePreviewPage(env, pkg.resource.id);
    return json({ status:"completed", build:BUILD, summary:"Kairos restored and verified the approved site-wide staging rollback.", publishedThemeChanged:false, filesRestored:restore.map(x=>x.filename), filesDeleted:remove });
  } catch (error) { return fail(error, "sitewide_rollback_failed"); }
}

function validatePackage(pkg) {
  if (!pkg?.packageID || !pkg?.page || !Array.isArray(pkg?.manifest) || !pkg.manifest.length) throw err(400,"compiled_package_required","A compiled MMG page package is required.");
  if (!['page','product','collection','homepage'].includes(pkg.page.resourceType)) throw err(400,"resource_type_invalid","Unsupported Shopify resource type.");
  if (pkg.manifest.length > 50) throw err(413,"manifest_too_large","A site-wide package may contain at most fifty files.");
  const seen = new Set();
  for (const file of pkg.manifest) {
    const name = String(file?.filename || "");
    if (!ALLOWED_PREFIXES.some(prefix=>name.startsWith(prefix)) || /\.\.|^\//.test(name)) throw err(400,"theme_path_invalid",`Theme path is not allowed: ${name}`);
    if (seen.has(name)) throw err(400,"duplicate_theme_path",`Duplicate theme path: ${name}`);
    seen.add(name);
    if (typeof file.content !== 'string' || !/^[a-f0-9]{64}$/i.test(String(file.sha256||''))) throw err(400,"manifest_file_invalid",`Invalid manifest entry for ${name}.`);
  }
  return pkg;
}

function validateApproval(plan, approval) {
  if (!plan?.planID || !plan?.plan?.manifest) throw err(400,"plan_required","A prepared site-wide plan is required.");
  if (approval?.status !== "approved" || approval?.planID !== plan.planID) throw err(403,"approval_required","Explicit approval matching this plan is required.");
}
function validateThemes(staging, main) { if (!staging?.gid || !main?.gid || staging.gid === main.gid || staging.role === 'MAIN') throw err(409,"theme_boundary_invalid","Kairos could not verify a separate staging and published theme."); }
function assignmentPlan(page, resource) { return { resourceType:page.resourceType, resourceID:resource?.id || page.resourceID || null, resourceHandle:resource?.handle || page.resourceHandle || page.handle, templateSuffix:page.templateSuffix, deferUntilRelease:page.resourceType !== 'homepage', createUnpublishedPreviewPage:page.resourceType==='page' && !resource?.id }; }
function previewPlan(env,page,theme,resource) { const store=String(env.SHOPIFY_STOREFRONT_DOMAIN||env.SHOPIFY_STORE_DOMAIN||'07kd8e-qw.myshopify.com').trim().toLowerCase(); const id=numericID(theme.gid); const path=resourcePath(page.resourceType,resource?.handle||page.resourceHandle||page.handle); const join=path.includes('?')?'&':'?'; return { store, path, themeID:id, templateSuffix:page.templateSuffix, url:`https://${store}${path}${join}preview_theme_id=${id}&view=${encodeURIComponent(page.templateSuffix)}` }; }
function refreshPreview(preview,resource){if(!resource?.handle)return preview;const path=resourcePath(resource.resourceType,resource.handle);return{...preview,path,url:`https://${preview.store}${path}?preview_theme_id=${preview.themeID}&view=${encodeURIComponent(preview.templateSuffix)}`};}
function resourcePath(type,handle){if(type==='product')return`/products/${handle}`;if(type==='collection')return`/collections/${handle}`;if(type==='page')return`/pages/${handle}`;return'/';}

async function resolveResource(env,page){if(page.resourceType==='homepage')return{id:'homepage',handle:'',resourceType:'homepage',exists:true};const cfg=config(env);const auth=await token(cfg,env);const handle=String(page.resourceHandle||page.handle);if(page.resourceType==='page'){const d=await gql(cfg,auth,`query($q:String!){pages(first:2,query:$q){nodes{id title handle templateSuffix isPublished}}}`,{q:`handle:${handle}`});return normalizeResource(d?.pages?.nodes?.[0], 'page', handle);}if(page.resourceType==='product'){const d=await gql(cfg,auth,`query($q:String!){products(first:2,query:$q){nodes{id title handle templateSuffix status}}}`,{q:`handle:${handle}`});return normalizeResource(d?.products?.nodes?.[0], 'product', handle);}const d=await gql(cfg,auth,`query($q:String!){collections(first:2,query:$q){nodes{id title handle templateSuffix}}}`,{q:`handle:${handle}`});return normalizeResource(d?.collections?.nodes?.[0], 'collection', handle);}
function normalizeResource(node,type,handle){return node?{...node,resourceType:type,exists:true}:{id:null,handle,resourceType:type,exists:false};}
async function ensurePreviewResource(env,resource,assignment){if(resource.resourceType!=='page'||resource.exists)return{...resource,createdForPreview:false};const cfg=config(env);const auth=await token(cfg,env);const d=await gql(cfg,auth,`mutation($page:PageCreateInput!){pageCreate(page:$page){page{id title handle templateSuffix isPublished} userErrors{field message}}}`,{page:{title:`Kairos Preview — ${assignment.resourceHandle}`,handle:assignment.resourceHandle,isPublished:false,templateSuffix:assignment.templateSuffix,body:""}});errors(d?.pageCreate);return{...d.pageCreate.page,resourceType:'page',exists:true,createdForPreview:true};}
async function deletePreviewPage(env,id){const cfg=config(env);const auth=await token(cfg,env);const d=await gql(cfg,auth,`mutation($id:ID!){pageDelete(id:$id){deletedPageId userErrors{field message}}}`,{id});errors(d?.pageDelete);}

const tokenCache=new Map();
function config(env){const storeDomain=String(env.SHOPIFY_STORE_DOMAIN||'').trim().toLowerCase();const apiVersion=String(env.SHOPIFY_API_VERSION||'2026-07').trim();if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain))throw err(503,'shopify_invalid_domain','Shopify store domain is invalid.');return{storeDomain,apiVersion};}
async function token(cfg,env){const id=String(env.SHOPIFY_CLIENT_ID||'').trim(),secret=String(env.SHOPIFY_CLIENT_SECRET||'').trim();if(id&&secret){const key=`${cfg.storeDomain}:${id}`,cached=tokenCache.get(key);if(cached?.expires>Date.now())return cached.value;const r=await fetch(`https://${cfg.storeDomain}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:id,client_secret:secret})});const b=await r.json().catch(()=>({}));if(!r.ok||!b.access_token)throw err(401,'shopify_auth_failed','Shopify client credentials failed.');const value={token:b.access_token};tokenCache.set(key,{value,expires:Date.now()+3300000});return value;}const value=String(env.SHOPIFY_ADMIN_ACCESS_TOKEN||'').trim();if(!value)throw err(503,'shopify_not_configured','Shopify credentials are not configured.');return{token:value};}
async function gql(cfg,auth,query,variables){const r=await fetch(`https://${cfg.storeDomain}/admin/api/${cfg.apiVersion}/graphql.json`,{method:'POST',headers:{'X-Shopify-Access-Token':auth.token,'Content-Type':'application/json'},body:JSON.stringify({query,variables})});const b=await r.json().catch(()=>({}));if(!r.ok)throw err(r.status,'shopify_graphql_http_error',b?.errors?.[0]?.message||`Shopify returned ${r.status}.`);if(b.errors?.length)throw err(422,'shopify_graphql_error',b.errors.map(x=>x.message).join('; '));return b.data||{};}
function errors(payload){const list=payload?.userErrors||[];if(list.length)throw err(422,'shopify_mutation_rejected',list.map(x=>x.message).join('; '));}
function numericID(value){return String(value||'').match(/(\d+)(?!.*\d)/)?.[1]||'';}
async function storeJob(request,id,body){const u=new URL(request.url);await caches.default.put(new Request(`${u.origin}/__kairos/sitewide/${id}`),new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json','Cache-Control':`max-age=${TTL}`}}));}
async function readJob(request,id){const u=new URL(request.url);const r=await caches.default.match(new Request(`${u.origin}/__kairos/sitewide/${id}`));return r?json(await r.json()):json({status:'not-found',error:{message:'The site-wide job expired or was not found.'}},404);}
function err(status,code,message){return Object.assign(new Error(message),{status,code});}
function fail(error,code){return json({status:'failed',build:BUILD,error:{code:error?.code||code,message:error instanceof Error?error.message:'Site-wide execution failed.'}},Number(error?.status||500));}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
