export const KAIROS_REVENUE_DELIVERY_GOVERNANCE_BUILD = "kairos-revenue-delivery-governance-20260727-1";

export function recordKairosRevenueAssetQA(product = {}, input = {}) {
  const assetId = clean(input.assetId, 180);
  const decision = clean(input.decision, 40).toLowerCase();
  if (!assetId) throw governanceError("REVENUE_ASSET_ID_REQUIRED", "Asset ID is required.");
  if (!['approved','changes_requested'].includes(decision)) throw governanceError("REVENUE_QA_DECISION_INVALID", "Use approved or changes_requested.");
  const assets = (Array.isArray(product.assets) ? product.assets : []).map(asset => asset.assetId === assetId ? Object.freeze({ ...asset, editorialQAStatus: decision, editorialQANotes: clean(input.notes, 2000) || null, editorialQAByIdentityHash: clean(input.operatorIdentityHash, 180) || null, editorialQAAt: now() }) : asset);
  if (!assets.some(asset => asset.assetId === assetId)) throw governanceError("REVENUE_ASSET_NOT_FOUND", "Revenue asset was not found.", 404);
  const approvedCount = assets.filter(asset => asset.editorialQAStatus === 'approved').length;
  return Object.freeze({ ...product, assets: Object.freeze(assets), assetQA: Object.freeze({ lastAssetId: assetId, decision, approvedCount, reviewedAt: now() }), updatedAt: now(), automaticPublicationAllowed: false });
}

export function createKairosRevenueDownloadGrant(product = {}, input = {}, env = {}) {
  const assetId = clean(input.assetId, 180);
  const asset = (Array.isArray(product.assets) ? product.assets : []).find(item => item.assetId === assetId);
  if (!asset) throw governanceError("REVENUE_ASSET_NOT_FOUND", "Revenue asset was not found.", 404);
  if (asset.editorialQAStatus !== 'approved') throw governanceError("REVENUE_ASSET_QA_REQUIRED", "Revenue asset must pass editorial QA before download.", 409);
  const subject = clean(input.subjectIdentityHash, 180);
  if (!subject) throw governanceError("REVENUE_DOWNLOAD_SUBJECT_REQUIRED", "Download subject identity is required.");
  const secret = clean(env.KAIROS_DOWNLOAD_SIGNING_SECRET, 500);
  if (!secret) throw governanceError("REVENUE_DOWNLOAD_SECRET_MISSING", "Download signing secret is unavailable.", 503);
  const expiresAt = new Date(Date.now() + boundedInt(input.ttlSeconds, 60, 3600, 900) * 1000).toISOString();
  const payload = `${product.revenueProductId}:${assetId}:${subject}:${expiresAt}`;
  return Object.freeze({ grantId: `grant_${fnv1a(`${payload}:${secret}`)}`, revenueProductId: clean(product.revenueProductId, 180), assetId, subjectIdentityHash: subject, storageRef: clean(asset.storageRef, 500), expiresAt, token: `${base64url(payload)}.${fnv1a(`${payload}:${secret}`)}`, singleUse: true, commerceMutationAllowed: false, externalPublicationAllowed: false, build: KAIROS_REVENUE_DELIVERY_GOVERNANCE_BUILD });
}

export function verifyKairosRevenueDownloadGrant(grant = {}, token = '', env = {}) {
  const secret = clean(env.KAIROS_DOWNLOAD_SIGNING_SECRET, 500);
  const parts = String(token || '').split('.');
  if (!secret || parts.length !== 2) return false;
  const payload = decodeBase64url(parts[0]);
  if (fnv1a(`${payload}:${secret}`) !== parts[1]) return false;
  const values = payload.split(':');
  const expiresAt = values.slice(3).join(':');
  return values[0] === grant.revenueProductId && values[1] === grant.assetId && values[2] === grant.subjectIdentityHash && Date.parse(expiresAt) > Date.now();
}

export function receiveKairosShopifyHandoff(product = {}, input = {}) {
  const handoff = product.publicationHandoff;
  if (!handoff || handoff.status !== 'ready_for_governed_shopify_workflow') throw governanceError("SHOPIFY_HANDOFF_NOT_READY", "A ready governed Shopify handoff is required.", 409);
  if (clean(input.confirmation, 120) !== 'RECEIVE SHOPIFY DRAFT HANDOFF') throw governanceError("SHOPIFY_HANDOFF_CONFIRMATION_REQUIRED", "Use confirmation RECEIVE SHOPIFY DRAFT HANDOFF.", 409);
  const unapproved = (Array.isArray(product.assets) ? product.assets : []).filter(asset => asset.editorialQAStatus !== 'approved');
  if (unapproved.length) throw governanceError("SHOPIFY_HANDOFF_ASSET_QA_REQUIRED", "Every handoff asset must pass editorial QA.", 409);
  return Object.freeze({ receiverId: `shopify_receiver_${fnv1a(`${product.revenueProductId}:${handoff.handoffId || ''}`)}`, revenueProductId: clean(product.revenueProductId, 180), handoffId: clean(handoff.handoffId, 180), status: 'received_pending_shopify_draft_creation', receivedByIdentityHash: clean(input.operatorIdentityHash, 180) || null, receivedAt: now(), payload: handoff.shopifyDraftPayload || handoff.product || null, mediaManifest: Object.freeze([...(handoff.mediaManifest || [])]), downloadManifest: Object.freeze([...(handoff.downloadManifest || [])]), directCommerceMutationPerformed: false, externalPublicationPerformed: false, build: KAIROS_REVENUE_DELIVERY_GOVERNANCE_BUILD });
}

function boundedInt(value,min,max,fallback){const number=Math.floor(Number(value)||fallback);return Math.min(max,Math.max(min,number));}
function base64url(value){return btoa(unescape(encodeURIComponent(value))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function decodeBase64url(value){const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((value.length+3)%4);return decodeURIComponent(escape(atob(padded)));}
function fnv1a(value){let hash=2166136261;for(const char of String(value))hash=Math.imul(hash^char.charCodeAt(0),16777619);return(hash>>>0).toString(16).padStart(8,'0');}
function now(){return new Date().toISOString();}
function clean(value,max){return String(value||'').replace(/\u0000/g,'').trim().slice(0,max);}
function governanceError(code,message,status=400){const error=new Error(message);error.code=code;error.status=status;return error;}
