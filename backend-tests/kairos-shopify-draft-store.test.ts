import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const store = readFileSync('cloudflare/mmg-ios/src/kairos-revenue-product-store-v1.js', 'utf8');
const creator = readFileSync('cloudflare/mmg-ios/src/kairos-shopify-draft-creator-v1.js', 'utf8');
const readiness = readFileSync('cloudflare/mmg-ios/src/kairos-revenue-launch-readiness-v1.js', 'utf8');

describe('Kairos Shopify draft store integration', () => {
  it('exposes authenticated draft creation and launch certification actions', () => {
    expect(store).toContain('create-shopify-draft');
    expect(store).toContain('certify-launch');
    expect(store).toContain('createShopifyDraftAction');
    expect(store).toContain('record-shopify-draft');
  });

  it('persists the immutable draft receipt before launch certification', () => {
    expect(store).toContain('attachKairosShopifyDraftReceipt');
    expect(store).toContain('attachKairosRevenueLaunchCertification');
    expect(store).toContain('certifyKairosRevenueLaunchReadiness');
  });

  it('forces Shopify DRAFT and retains explicit feature-gated authorization', () => {
    expect(creator).toContain('CREATE SHOPIFY DRAFT');
    expect(creator).toContain('KAIROS_SHOPIFY_DRAFT_WRITES_ENABLED');
    expect(creator).toContain('status: "DRAFT"');
    expect(creator).toContain('publicationPerformed: false');
  });

  it('requires complete QA and preserves manual storefront review', () => {
    expect(readiness).toContain('assets_qa_approved');
    expect(readiness).toContain('ready_for_manual_shopify_review');
    expect(readiness).toContain('publicationAuthorizationIncluded: false');
  });
});
