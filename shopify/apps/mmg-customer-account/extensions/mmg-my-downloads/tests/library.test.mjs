import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDownloadLibrary, isDigitalLineItem, isEligibleOrder, summarizeDownloadLibrary} from '../src/library.mjs';

test('accepts MMG digital downloads and rejects physical goods', () => {
  assert.equal(isDigitalLineItem({requiresShipping:false, productType:'Digital Download'}), true);
  assert.equal(isDigitalLineItem({requiresShipping:false, sku:'MMG-DIG-AIM-STD'}), true);
  assert.equal(isDigitalLineItem({requiresShipping:true, productType:'Digital Download'}), false);
  assert.equal(isDigitalLineItem({requiresShipping:false, giftCard:true, sku:'MMG-DIG-GIFT'}), false);
});

test('requires a paid, active order with secure status page', () => {
  assert.equal(isEligibleOrder({financialStatus:'PAID', statusPageUrl:'https://example.com'}), true);
  assert.equal(isEligibleOrder({financialStatus:'PARTIALLY_REFUNDED', statusPageUrl:'https://example.com'}), true);
  assert.equal(isEligibleOrder({financialStatus:'REFUNDED', statusPageUrl:'https://example.com'}), false);
  assert.equal(isEligibleOrder({financialStatus:'PAID', cancelledAt:'2026-01-01', statusPageUrl:'https://example.com'}), false);
});

test('aggregates eligible line items across orders newest first', () => {
  const items = buildDownloadLibrary([
    {id:'o1', name:'#1001', processedAt:'2026-01-01', financialStatus:'PAID', statusPageUrl:'https://one', lineItems:{nodes:[{id:'l1', name:'Guide One', sku:'MMG-DIG-ONE', quantity:1, refundableQuantity:1, requiresShipping:false, productId:'p1'}]}},
    {id:'o2', name:'#1002', processedAt:'2026-02-01', financialStatus:'PAID', statusPageUrl:'https://two', lineItems:{nodes:[{id:'l2', name:'Guide Two', productType:'Digital Download', quantity:1, refundableQuantity:1, requiresShipping:false, productId:'p2'}]}},
  ]);
  assert.deepEqual(items.map((item) => item.orderName), ['#1002', '#1001']);
  assert.deepEqual(summarizeDownloadLibrary(items), {entitlements:2, orders:2, products:2});
});
