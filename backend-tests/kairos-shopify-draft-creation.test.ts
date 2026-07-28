import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachKairosShopifyDraftReceipt, createKairosShopifyDraft } from '../cloudflare/mmg-ios/src/kairos-shopify-draft-creator-v1.js';
import { attachKairosRevenueLaunchCertification, certifyKairosRevenueLaunchReadiness } from '../cloudflare/mmg-ios/src/kairos-revenue-launch-readiness-v1.js';

afterEach(() => vi.unstubAllGlobals());

const product = {
  revenueProductId: 'rp-1',
  approval: { status: 'approved' },
  productionJobs: [{ jobId: 'job-1', state: 'completed' }],
  assets: [{ assetId: 'pdf', editorialQAStatus: 'approved' }],
  deliveryPackage: { status: 'stored_awaiting_editorial_qa', assets: [{}, {}, {}] },
  shopifyDraftReceiver: {
    status: 'received_pending_shopify_draft_creation',
    payload: { title: 'AI Revenue Guide', handle: 'ai-revenue-guide', descriptionHtml: '<p>Build revenue.</p>', tags: ['AI', 'Guide'], seo: { title: 'AI Revenue Guide', description: 'A practical AI revenue guide.' } },
    mediaManifest: [],
  },
  automaticPublicationAllowed: false,
};

describe('Kairos Shopify draft creation', () => {
  it('creates only a Shopify DRAFT after explicit authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { productCreate: { product: { id: 'gid://shopify/Product/1', title: 'AI Revenue Guide', handle: 'ai-revenue-guide', status: 'DRAFT', onlineStoreUrl: null }, userErrors: [] } } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const receipt = await createKairosShopifyDraft(product, { confirmation: 'CREATE SHOPIFY DRAFT', operatorIdentityHash: 'kid_operator' }, { KAIROS_SHOPIFY_DRAFT_WRITES_ENABLED: 'true', SHOPIFY_STORE_DOMAIN: 'example.myshopify.com', SHOPIFY_ADMIN_ACCESS_TOKEN: 'token', SHOPIFY_API_VERSION: '2026-07' });
    expect(receipt.productRemainsDraft).toBe(true);
    expect(receipt.publicationPerformed).toBe(false);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.variables.product.status).toBe('DRAFT');
    expect(request.variables.product.title).toBe('AI Revenue Guide');
  });

  it('blocks draft creation without the exact confirmation or feature flag', async () => {
    await expect(createKairosShopifyDraft(product, {}, {})).rejects.toThrow(/CREATE SHOPIFY DRAFT/);
    await expect(createKairosShopifyDraft(product, { confirmation: 'CREATE SHOPIFY DRAFT' }, {})).rejects.toThrow(/disabled/i);
  });

  it('attaches a Shopify draft receipt without enabling publication', () => {
    const attached = attachKairosShopifyDraftReceipt(product, { revenueProductId: 'rp-1', shopifyProductId: 'gid://shopify/Product/1', productRemainsDraft: true });
    expect(attached.state).toBe('shopify_draft_created');
    expect(attached.automaticPublicationAllowed).toBe(false);
  });

  it('certifies a complete revenue product for manual Shopify review', () => {
    const withDraft = attachKairosShopifyDraftReceipt(product, { revenueProductId: 'rp-1', shopifyProductId: 'gid://shopify/Product/1', productRemainsDraft: true });
    const certification = certifyKairosRevenueLaunchReadiness(withDraft, { operatorIdentityHash: 'kid_operator' });
    expect(certification.ready).toBe(true);
    expect(certification.status).toBe('ready_for_manual_shopify_review');
    expect(certification.publicationAuthorizationIncluded).toBe(false);
    expect(attachKairosRevenueLaunchCertification(withDraft, certification).state).toBe('ready_for_manual_shopify_review');
  });
});
