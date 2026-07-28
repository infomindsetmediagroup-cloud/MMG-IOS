import { renderKairosRevenueDocument, assembleKairosRevenueZip, KAIROS_REVENUE_DOCUMENT_RENDERER_BUILD } from './kairos-revenue-document-renderer-v1.js';

export const KAIROS_REVENUE_PACKAGE_ORCHESTRATOR_BUILD = 'kairos-revenue-package-orchestrator-20260727-1';

export async function createKairosRevenueDeliveryPackage(product = {}, input = {}, env = {}) {
  if (clean(input.confirmation, 120) !== 'BUILD REVENUE DELIVERY PACKAGE') throw packageError('REVENUE_PACKAGE_CONFIRMATION_REQUIRED', 'Use confirmation BUILD REVENUE DELIVERY PACKAGE.', 409);
  if (!env.KAIROS_REVENUE_ASSETS?.get || !env.KAIROS_REVENUE_ASSETS?.put) throw packageError('REVENUE_ASSET_STORAGE_UNAVAILABLE', 'Revenue object storage is unavailable.', 503);
  const sourceAsset = selectSourceAsset(product, input.sourceAssetId);
  if (!sourceAsset) throw packageError('REVENUE_SOURCE_ASSET_NOT_FOUND', 'A stored source asset is required.', 404);
  if (sourceAsset.editorialQAStatus !== 'approved') throw packageError('REVENUE_SOURCE_ASSET_QA_REQUIRED', 'Source asset must pass editorial QA before packaging.', 409);
  const object = await env.KAIROS_REVENUE_ASSETS.get(storageKey(sourceAsset.storageRef));
  if (!object) throw packageError('REVENUE_SOURCE_OBJECT_NOT_FOUND', 'Stored source content was not found.', 404);
  const content = await object.text();
  const title = product.blueprint?.title || product.title || product.revenueProductId;
  const pdf = await renderKairosRevenueDocument({ format: 'pdf', title, content });
  const docx = await renderKairosRevenueDocument({ format: 'docx', title, content });
  const instructions = buildInstructions(product);
  const zip = assembleKairosRevenueZip({ filename: `${slug(title)}-complete-package.zip`, files: [
    { filename: pdf.filename, content: pdf.bytes },
    { filename: docx.filename, content: docx.bytes },
    { filename: `${slug(title)}-source.md`, content },
    { filename: 'customer-instructions.txt', content: instructions },
  ] });
  const outputs = [pdf, docx, zip];
  const stored = [];
  for (const output of outputs) {
    const key = `revenue-products/${clean(product.revenueProductId, 180)}/delivery/${output.filename}`;
    await env.KAIROS_REVENUE_ASSETS.put(key, output.bytes, { httpMetadata: { contentType: output.mimeType }, customMetadata: { revenueProductId: clean(product.revenueProductId, 180), checksum: output.checksum, generatedBy: KAIROS_REVENUE_PACKAGE_ORCHESTRATOR_BUILD } });
    stored.push(Object.freeze({ assetId: `asset_${fnv1a(`${product.revenueProductId}:${output.filename}`)}`, type: output.mimeType === 'application/pdf' ? 'digital-edition' : output.mimeType.includes('wordprocessingml') ? 'editable-source' : 'complete-package', filename: output.filename, checksum: output.checksum, storageRef: `r2://${key}`, byteSize: output.byteSize, mimeType: output.mimeType, version: 1, editorialQAStatus: 'required', automaticPublicationAllowed: false }));
  }
  return Object.freeze({ packageId: `pkg_${fnv1a(`${product.revenueProductId}:${zip.checksum}`)}`, revenueProductId: clean(product.revenueProductId, 180), sourceAssetId: sourceAsset.assetId, assets: Object.freeze(stored), status: 'stored_awaiting_editorial_qa', createdAt: new Date().toISOString(), automaticPublicationAllowed: false, commerceMutationAllowed: false, builds: Object.freeze({ renderer: KAIROS_REVENUE_DOCUMENT_RENDERER_BUILD, orchestrator: KAIROS_REVENUE_PACKAGE_ORCHESTRATOR_BUILD }) });
}

function selectSourceAsset(product, requestedId) { const assets=Array.isArray(product.assets)?product.assets:[]; const id=clean(requestedId,180); return id?assets.find(asset=>asset.assetId===id):assets.find(asset=>asset.storageRef&&['manuscript','guide','prompt-library','workbook','template-pack','source'].includes(String(asset.type||'').toLowerCase())); }
function storageKey(ref) { return clean(ref, 500).replace(/^r2:\/\//, ''); }
function buildInstructions(product) { return `Mindset Media Group\n\nProduct: ${product.blueprint?.title || product.revenueProductId}\n\nThis package contains the customer PDF, editable DOCX source, canonical Markdown source, and customer instructions. Review all files before commercial release. Shopify publication remains approval-gated.`; }
function slug(value){return clean(value,240).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'kairos-revenue-product';}
function fnv1a(value){let hash=2166136261;for(const char of String(value))hash=Math.imul(hash^char.charCodeAt(0),16777619);return(hash>>>0).toString(16).padStart(8,'0');}
function clean(value,max){return String(value||'').replace(/\u0000/g,'').trim().slice(0,max);}
function packageError(code,message,status=400){const error=new Error(message);error.code=code;error.status=status;return error;}
