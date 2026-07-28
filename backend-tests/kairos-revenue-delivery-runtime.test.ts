import { describe, expect, it, vi } from 'vitest';
import { executeKairosRevenueDeliveryAction, streamKairosRevenueAsset } from '../cloudflare/mmg-ios/src/kairos-revenue-delivery-runtime-v1.js';

describe('Kairos revenue delivery runtime', () => {
  it('builds and attaches a governed delivery package', async () => {
    const env = { KAIROS_REVENUE_ASSETS: { get: vi.fn().mockResolvedValue({ text: async () => '# Guide' }), put: vi.fn().mockResolvedValue(undefined) } };
    const product = { revenueProductId:'rp-1', blueprint:{ title:'Revenue Guide' }, assets:[{ assetId:'source', type:'manuscript', storageRef:'r2://source.md', editorialQAStatus:'approved' }] };
    const result = await executeKairosRevenueDeliveryAction(product, 'build-package', { confirmation:'BUILD REVENUE DELIVERY PACKAGE' }, env);
    expect(result.product.deliveryPackage.status).toBe('stored_awaiting_editorial_qa');
    expect(result.product.assets).toHaveLength(4);
    expect(result.product.automaticPublicationAllowed).toBe(false);
  });

  it('records asset QA and creates a signed download grant', async () => {
    const product = { revenueProductId:'rp-1', assets:[{ assetId:'pdf', storageRef:'r2://file.pdf', mimeType:'application/pdf' }] };
    const reviewed = await executeKairosRevenueDeliveryAction(product, 'asset-qa', { assetId:'pdf', decision:'approved', operatorIdentityHash:'kid_operator' }, {});
    const granted = await executeKairosRevenueDeliveryAction(reviewed.product, 'create-download-grant', { assetId:'pdf', subjectIdentityHash:'kid_customer', ttlSeconds:300 }, { KAIROS_DOWNLOAD_SIGNING_SECRET:'secret' });
    expect(granted.grant.singleUse).toBe(true);
    expect(granted.product.downloadGrants).toHaveLength(1);
  });

  it('streams an approved asset once and consumes the grant', async () => {
    const body = new TextEncoder().encode('PDF bytes');
    const base = { revenueProductId:'rp-1', assets:[{ assetId:'pdf', filename:'guide.pdf', storageRef:'r2://file.pdf', mimeType:'application/pdf', editorialQAStatus:'approved' }] };
    const granted = await executeKairosRevenueDeliveryAction(base, 'create-download-grant', { assetId:'pdf', subjectIdentityHash:'kid_customer' }, { KAIROS_DOWNLOAD_SIGNING_SECRET:'secret' });
    const result = await streamKairosRevenueAsset(granted.product, { grantId:granted.grant.grantId, token:granted.grant.token }, { KAIROS_DOWNLOAD_SIGNING_SECRET:'secret', KAIROS_REVENUE_ASSETS:{ get:vi.fn().mockResolvedValue({ body }) } });
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get('content-disposition')).toContain('guide.pdf');
    expect(result.product.downloadGrants[0].consumedAt).toBeTruthy();
    await expect(streamKairosRevenueAsset(result.product, { grantId:granted.grant.grantId, token:granted.grant.token }, { KAIROS_DOWNLOAD_SIGNING_SECRET:'secret', KAIROS_REVENUE_ASSETS:{ get:vi.fn() } })).rejects.toThrow(/unavailable/i);
  });

  it('receives only the governed Shopify draft handoff', async () => {
    const product = { revenueProductId:'rp-1', assets:[{ assetId:'pdf', editorialQAStatus:'approved' }], publicationHandoff:{ handoffId:'h-1', status:'ready_for_governed_shopify_workflow', shopifyDraftPayload:{ status:'DRAFT' }, mediaManifest:[], downloadManifest:[] } };
    const result = await executeKairosRevenueDeliveryAction(product, 'receive-shopify-handoff', { confirmation:'RECEIVE SHOPIFY DRAFT HANDOFF', operatorIdentityHash:'kid_operator' }, {});
    expect(result.receiver.status).toBe('received_pending_shopify_draft_creation');
    expect(result.receiver.directCommerceMutationPerformed).toBe(false);
  });
});
