import { describe, expect, it, vi } from 'vitest';
import { handleKairosRevenueDeliveryAPI } from '../cloudflare/mmg-ios/src/kairos-revenue-delivery-api-v1.js';

describe('Kairos revenue delivery API', () => {
  it('builds and persists a delivery package through adapters', async () => {
    const product = { revenueProductId:'rp-1', blueprint:{ title:'Revenue Guide' }, assets:[{ assetId:'source', type:'manuscript', storageRef:'r2://source.md', editorialQAStatus:'approved' }] };
    const saveProduct = vi.fn();
    const response = await handleKairosRevenueDeliveryAPI(new Request('https://kairos.test/api/kairos/revenue/products/rp-1/build-package',{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json'},body:JSON.stringify({confirmation:'BUILD REVENUE DELIVERY PACKAGE'})}), { KAIROS_API_ACCESS_TOKEN:'token', KAIROS_REVENUE_ASSETS:{ get:vi.fn().mockResolvedValue({text:async()=> '# Guide'}), put:vi.fn() } }, { readProduct:vi.fn().mockResolvedValue(product), saveProduct });
    expect(response.status).toBe(200);
    expect(saveProduct).toHaveBeenCalledOnce();
    expect((await response.json()).product.deliveryPackage.status).toBe('stored_awaiting_editorial_qa');
  });

  it('records QA and creates a persisted customer grant', async () => {
    let product:any = { revenueProductId:'rp-1', assets:[{ assetId:'pdf', filename:'guide.pdf', storageRef:'r2://guide.pdf', mimeType:'application/pdf' }] };
    const adapters = { readProduct:vi.fn(async()=>product), saveProduct:vi.fn(async(_id,next)=>{product=next;}) };
    const qa = await handleKairosRevenueDeliveryAPI(new Request('https://kairos.test/api/kairos/revenue/products/rp-1/asset-qa',{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json'},body:JSON.stringify({assetId:'pdf',decision:'approved'})}), {KAIROS_API_ACCESS_TOKEN:'token'}, adapters);
    expect(qa.status).toBe(200);
    const grant = await handleKairosRevenueDeliveryAPI(new Request('https://kairos.test/api/kairos/revenue/products/rp-1/create-download-grant',{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json'},body:JSON.stringify({assetId:'pdf',subjectIdentityHash:'kid_customer'})}), {KAIROS_API_ACCESS_TOKEN:'token',KAIROS_DOWNLOAD_SIGNING_SECRET:'secret'}, adapters);
    expect(grant.status).toBe(200);
    expect((await grant.json()).grant.singleUse).toBe(true);
  });

  it('streams and consumes a single-use grant', async () => {
    const base:any = { revenueProductId:'rp-1', assets:[{ assetId:'pdf', filename:'guide.pdf', storageRef:'r2://guide.pdf', mimeType:'application/pdf', editorialQAStatus:'approved' }] };
    let product=base;
    const adapters={readProduct:vi.fn(async()=>product),saveProduct:vi.fn(async(_id,next)=>{product=next;})};
    const grantResponse=await handleKairosRevenueDeliveryAPI(new Request('https://kairos.test/api/kairos/revenue/products/rp-1/create-download-grant',{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json'},body:JSON.stringify({assetId:'pdf',subjectIdentityHash:'kid_customer'})}),{KAIROS_API_ACCESS_TOKEN:'token',KAIROS_DOWNLOAD_SIGNING_SECRET:'secret'},adapters);
    const grant=(await grantResponse.json()).grant;
    const download=await handleKairosRevenueDeliveryAPI(new Request(`https://kairos.test/api/kairos/revenue/products/rp-1/downloads/${grant.grantId}?token=${encodeURIComponent(grant.token)}`,{headers:{authorization:'Bearer token'}}),{KAIROS_API_ACCESS_TOKEN:'token',KAIROS_DOWNLOAD_SIGNING_SECRET:'secret',KAIROS_REVENUE_ASSETS:{get:vi.fn().mockResolvedValue({body:new TextEncoder().encode('pdf')})}},adapters);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('guide.pdf');
    expect(product.downloadGrants[0].consumedAt).toBeTruthy();
  });

  it('does not expose direct Shopify mutation authority', async () => {
    const source = await import('node:fs').then(({readFileSync})=>readFileSync(new URL('../cloudflare/mmg-ios/src/kairos-revenue-delivery-api-v1.js',import.meta.url),'utf8'));
    expect(source).not.toContain('productCreate(');
    expect(source).not.toContain('productSet(');
    expect(source).not.toContain('PUBLISH PRODUCT LIVE');
  });
});
