import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDownloadLibrary,
  isDigitalLineItem,
  isEligibleOrder,
  summarizeDownloadLibrary,
} from '../src/library.mjs';

const paidOrder = (overrides = {}) => ({
  id: 'gid://shopify/Order/1',
  name: '#1001',
  createdAt: '2026-07-20T12:00:00Z',
  processedAt: '2026-07-20T12:01:00Z',
  financialStatus: 'PAID',
  fulfillmentStatus: 'FULFILLED',
  cancelledAt: null,
  statusPageUrl: 'https://example.test/orders/secure',
  lineItems: {nodes: []},
  ...overrides,
});

const digitalItem = (overrides = {}) => ({
  id: 'gid://shopify/LineItem/1',
  name: 'AI Image Mastery™',
  presentmentTitle: 'AI Image Mastery™',
  productId: 'gid://shopify/Product/9022950998170',
  productType: 'Digital Download',
  quantity: 1,
  refundableQuantity: 1,
  requiresShipping: false,
  sku: 'MMG-DIG-AIM-STD',
  variantId: 'gid://shopify/ProductVariant/48655433498778',
  variantTitle: 'Default Title',
  giftCard: false,
  ...overrides,
});

test('recognizes AI Image Mastery as a digital line item', () => {
  assert.equal(isDigitalLineItem(digitalItem()), true);
});

test('recognizes MMG digital SKU when product type is missing', () => {
  assert.equal(isDigitalLineItem(digitalItem({productType: ''})), true);
});

test('excludes services, physical products, and gift cards', () => {
  assert.equal(isDigitalLineItem(digitalItem({productType: 'Publishing Service', sku: 'MMG-SVC-PCD-STA'})), false);
  assert.equal(isDigitalLineItem(digitalItem({requiresShipping: true})), false);
  assert.equal(isDigitalLineItem(digitalItem({giftCard: true})), false);
});

test('requires a paid, non-cancelled order with a secure status page', () => {
  assert.equal(isEligibleOrder(paidOrder()), true);
  assert.equal(isEligibleOrder(paidOrder({financialStatus: 'PENDING'})), false);
  assert.equal(isEligibleOrder(paidOrder({cancelledAt: '2026-07-20T13:00:00Z'})), false);
  assert.equal(isEligibleOrder(paidOrder({statusPageUrl: null})), false);
});

test('builds one entitlement per eligible order line', () => {
  const result = buildDownloadLibrary([
    paidOrder({lineItems: {nodes: [digitalItem()]}}),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'AI Image Mastery™');
  assert.equal(result[0].orderName, '#1001');
  assert.equal(result[0].statusPageUrl, 'https://example.test/orders/secure');
});

test('excludes fully refunded line items and service products', () => {
  const result = buildDownloadLibrary([
    paidOrder({
      lineItems: {
        nodes: [
          digitalItem({id: 'refunded', refundableQuantity: 0}),
          digitalItem({id: 'service', productType: 'Publishing Service', sku: 'MMG-SVC-PCD-STA'}),
        ],
      },
    }),
  ]);

  assert.deepEqual(result, []);
});

test('sorts newest entitlements first and reports cross-order totals', () => {
  const older = paidOrder({
    id: 'order-older',
    name: '#1001',
    processedAt: '2026-07-20T12:00:00Z',
    lineItems: {nodes: [digitalItem({id: 'line-older'})]},
  });
  const newer = paidOrder({
    id: 'order-newer',
    name: '#1002',
    processedAt: '2026-07-21T12:00:00Z',
    lineItems: {nodes: [digitalItem({id: 'line-newer'})]},
  });

  const result = buildDownloadLibrary([older, newer]);
  assert.equal(result[0].orderName, '#1002');
  assert.deepEqual(summarizeDownloadLibrary(result), {
    entitlements: 2,
    orders: 2,
    products: 1,
  });
});
