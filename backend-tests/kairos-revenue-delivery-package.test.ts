import { describe, expect, it, vi } from 'vitest';
import { renderKairosRevenueDocument, assembleKairosRevenueZip } from '../cloudflare/mmg-ios/src/kairos-revenue-document-renderer-v1.js';
import { createKairosRevenueDeliveryPackage } from '../cloudflare/mmg-ios/src/kairos-revenue-package-orchestrator-v1.js';
import { createKairosRevenueDownloadGrant, recordKairosRevenueAssetQA, receiveKairosShopifyHandoff, verifyKairosRevenueDownloadGrant } from '../cloudflare/mmg-ios/src/kairos-revenue-delivery-governance-v1.js';

describe('Kairos revenue delivery package', () => {
  it('renders PDF and DOCX and assembles a ZIP', async () => {
    const pdf = await renderKairosRevenueDocument({ format:'pdf', title:'AI Revenue Guide', content:'# Start\nBuild the offer.' });
    const docx = await renderKairosRevenueDocument({ format:'docx', title:'AI Revenue Guide', content:'Build the offer.' });
    const zip = assembleKairosRevenueZip({ files:[{ filename:pdf.filename, content:pdf.bytes },{ filename:docx.filename, content:docx.bytes }] });
    expect(pdf.mimeType).toBe('application/pdf');
    expect(docx.filename).toMatch(/\.docx$/);
    expect(zip.byteSize).toBeGreaterThan(100);
  });

  it('stores a complete delivery package with QA-gated assets', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue({ text: async () => '# Guide\nRevenue content.' });
    const product = { revenueProductId:'rp-1', blueprint:{ title:'Revenue Guide' }, assets:[{ assetId:'source-1', type:'manuscript', storageRef:'r2://revenue-products/rp-1/source.md', editorialQAStatus:'approved' }] };
    const result = await createKairosRevenueDeliveryPackage(product, { confirmation:'BUILD REVENUE DELIVERY PACKAGE' }, { KAIROS_REVENUE_ASSETS:{ get, put } });
    expect(result.status).toBe('stored_awaiting_editorial_qa');
    expect(result.assets.map(a => a.type)).toEqual(['digital-edition','editable-source','complete-package']);
    expect(put).toHaveBeenCalledTimes(3);
    expect(result.automaticPublicationAllowed).toBe(false);
  });

  it('records QA and creates a bounded signed download grant', () => {
    const product = recordKairosRevenueAssetQA({ revenueProductId:'rp-1', assets:[{ assetId:'pdf-1', storageRef:'r2://file.pdf' }] }, { assetId:'pdf-1', decision:'approved', operatorIdentityHash:'kid_1' });
    const grant = createKairosRevenueDownloadGrant(product, { assetId:'pdf-1', subjectIdentityHash:'kid_customer', ttlSeconds:300 }, { KAIROS_DOWNLOAD_SIGNING_SECRET:'secret' });
    expect(grant.singleUse).toBe(true);
    expect(verifyKairosRevenueDownloadGrant(grant, grant.token, { KAIROS_DOWNLOAD_SIGNING_SECRET:'secret' })).toBe(true);
  });

  it('receives only QA-complete Shopify draft handoffs without mutating commerce', () => {
    const product = { revenueProductId:'rp-1', assets:[{ assetId:'pdf-1', editorialQAStatus:'approved' }], publicationHandoff:{ handoffId:'h-1', status:'ready_for_governed_shopify_workflow', shopifyDraftPayload:{ status:'DRAFT' }, mediaManifest:[], downloadManifest:[] } };
    const receipt = receiveKairosShopifyHandoff(product, { confirmation:'RECEIVE SHOPIFY DRAFT HANDOFF', operatorIdentityHash:'kid_1' });
    expect(receipt.status).toBe('received_pending_shopify_draft_creation');
    expect(receipt.directCommerceMutationPerformed).toBe(false);
    expect(receipt.externalPublicationPerformed).toBe(false);
  });
});
