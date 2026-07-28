import { createKairosRevenueDeliveryPackage } from './kairos-revenue-package-orchestrator-v1.js';
import { createKairosRevenueDownloadGrant, recordKairosRevenueAssetQA, receiveKairosShopifyHandoff, verifyKairosRevenueDownloadGrant } from './kairos-revenue-delivery-governance-v1.js';

export const KAIROS_REVENUE_DELIVERY_RUNTIME_BUILD = 'kairos-revenue-delivery-runtime-20260727-1';

export async function executeKairosRevenueDeliveryAction(product = {}, action = '', input = {}, env = {}) {
  const name = clean(action, 80);
  if (name === 'build-package') {
    const deliveryPackage = await createKairosRevenueDeliveryPackage(product, input, env);
    return { product: attachPackage(product, deliveryPackage), deliveryPackage };
  }
  if (name === 'asset-qa') return { product: recordKairosRevenueAssetQA(product, input) };
  if (name === 'create-download-grant') {
    const grant = createKairosRevenueDownloadGrant(product, input, env);
    return { product: attachGrant(product, grant), grant };
  }
  if (name === 'receive-shopify-handoff') {
    const receiver = receiveKairosShopifyHandoff(product, input);
    return { product: Object.freeze({ ...product, shopifyDraftReceiver: receiver, updatedAt: now() }), receiver };
  }
  throw runtimeError('REVENUE_DELIVERY_ACTION_INVALID', 'Unknown revenue delivery action.', 400);
}

export async function streamKairosRevenueAsset(product = {}, input = {}, env = {}) {
  const grant = (Array.isArray(product.downloadGrants) ? product.downloadGrants : []).find(item => item.grantId === clean(input.grantId, 180));
  if (!grant || grant.consumedAt) throw runtimeError('REVENUE_DOWNLOAD_GRANT_UNAVAILABLE', 'Download grant is unavailable.', 404);
  if (!verifyKairosRevenueDownloadGrant(grant, input.token, env)) throw runtimeError('REVENUE_DOWNLOAD_GRANT_INVALID', 'Download grant is invalid or expired.', 403);
  const object = await env.KAIROS_REVENUE_ASSETS?.get?.(clean(grant.storageRef, 500).replace(/^r2:\/\//, ''));
  if (!object) throw runtimeError('REVENUE_DOWNLOAD_OBJECT_NOT_FOUND', 'Download asset was not found.', 404);
  const asset = (Array.isArray(product.assets) ? product.assets : []).find(item => item.assetId === grant.assetId) || {};
  const consumedGrant = Object.freeze({ ...grant, consumedAt: now() });
  return {
    product: Object.freeze({ ...product, downloadGrants: Object.freeze((product.downloadGrants || []).map(item => item.grantId === grant.grantId ? consumedGrant : item)), updatedAt: now() }),
    response: new Response(object.body, { status: 200, headers: { 'Content-Type': asset.mimeType || object.httpMetadata?.contentType || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${safeFilename(asset.filename || 'download')}"`, 'Cache-Control': 'private, no-store', 'X-Kairos-Download-Grant': grant.grantId } }),
  };
}

function attachPackage(product, deliveryPackage) { const assets = [...(product.assets || [])]; for (const asset of deliveryPackage.assets || []) { const index = assets.findIndex(item => item.assetId === asset.assetId || item.type === asset.type); if (index >= 0) assets[index] = asset; else assets.push(asset); } return Object.freeze({ ...product, assets: Object.freeze(assets.slice(-200)), deliveryPackage, updatedAt: now(), automaticPublicationAllowed: false }); }
function attachGrant(product, grant) { const grants = [...(product.downloadGrants || []), grant].slice(-100); return Object.freeze({ ...product, downloadGrants: Object.freeze(grants), updatedAt: now() }); }
function safeFilename(value){return clean(value,240).replace(/[^a-zA-Z0-9._-]+/g,'-')||'download';}
function clean(value,max){return String(value||'').replace(/\u0000/g,'').trim().slice(0,max);}
function now(){return new Date().toISOString();}
function runtimeError(code,message,status=400){const error=new Error(message);error.code=code;error.status=status;return error;}
