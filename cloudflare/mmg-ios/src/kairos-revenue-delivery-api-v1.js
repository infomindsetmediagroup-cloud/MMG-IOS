import { executeKairosRevenueDeliveryAction, streamKairosRevenueAsset, KAIROS_REVENUE_DELIVERY_RUNTIME_BUILD } from './kairos-revenue-delivery-runtime-v1.js';

export const KAIROS_REVENUE_DELIVERY_API_BUILD = 'kairos-revenue-delivery-api-20260727-1';
const ACTION = /^\/api\/kairos\/revenue\/products\/([^/]+)\/(build-package|asset-qa|create-download-grant|receive-shopify-handoff)\/?$/i;
const DOWNLOAD = /^\/api\/kairos\/revenue\/products\/([^/]+)\/downloads\/([^/]+)\/?$/i;

export async function handleKairosRevenueDeliveryAPI(request, env, adapters = {}) {
  const pathname = new URL(request.url).pathname;
  const action = pathname.match(ACTION);
  const download = pathname.match(DOWNLOAD);
  if (!action && !download) return null;
  const identity = authenticate(request, env);
  if (!identity) return json({ success:false, error:{ code:'AUTH_REQUIRED', message:'Authenticated Kairos revenue access is required.' } }, 401);
  const readProduct = adapters.readProduct;
  const saveProduct = adapters.saveProduct;
  if (typeof readProduct !== 'function' || typeof saveProduct !== 'function') return json({ success:false, error:{ code:'REVENUE_DELIVERY_ADAPTERS_REQUIRED', message:'Revenue delivery persistence adapters are unavailable.' } }, 503);
  try {
    const revenueProductId = clean((action || download)[1], 180);
    const product = await readProduct(revenueProductId);
    if (!product) return json({ success:false, error:{ code:'REVENUE_PRODUCT_NOT_FOUND', message:'Revenue product was not found.' } }, 404);
    if (download) {
      if (request.method !== 'GET') return method('GET');
      const token = new URL(request.url).searchParams.get('token') || '';
      const result = await streamKairosRevenueAsset(product, { grantId:clean(download[2],180), token }, env);
      await saveProduct(revenueProductId, result.product);
      return result.response;
    }
    if (request.method !== 'POST') return method('POST');
    const input = { ...(await request.json().catch(()=>({}))), operatorIdentityHash:hashIdentity(identity) };
    const result = await executeKairosRevenueDeliveryAction(product, action[2], input, env);
    await saveProduct(revenueProductId, result.product);
    return json({ success:true, ...result, build:KAIROS_REVENUE_DELIVERY_API_BUILD });
  } catch (error) {
    return json({ success:false, error:{ code:error?.code || 'REVENUE_DELIVERY_FAILED', message:error?.message || 'Revenue delivery operation failed.' } }, error?.status || 400);
  }
}

function authenticate(request, env){const email=clean(request.headers.get('cf-access-authenticated-user-email'),320);if(email)return email.toLowerCase();const auth=request.headers.get('authorization')||'';const token=String(env?.KAIROS_API_ACCESS_TOKEN||'');return token&&auth===`Bearer ${token}`?'service-token':'';}
function hashIdentity(value){let hash=2166136261;for(const char of String(value))hash=Math.imul(hash^char.charCodeAt(0),16777619);return `kid_${(hash>>>0).toString(16).padStart(8,'0')}`;}
function clean(value,max){return String(value||'').replace(/\u0000/g,'').trim().slice(0,max);}
function method(allowed){return json({success:false,error:{code:'METHOD_NOT_ALLOWED',message:`Use ${allowed}.`}},405);}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Kairos-Revenue-Delivery-API':KAIROS_REVENUE_DELIVERY_API_BUILD,'X-Kairos-Revenue-Delivery-Runtime':KAIROS_REVENUE_DELIVERY_RUNTIME_BUILD}});}
