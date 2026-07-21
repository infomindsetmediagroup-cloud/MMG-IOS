#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};
const sameMembers = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  new Set(actual).size === expected.length &&
  expected.every((entry) => actual.includes(entry));

const files = {
  registry: 'registry/shopify-product-contracts.json',
  normalization: 'shopify/operations/manifests/product-normalization-2026-07-20.json',
  redirects: 'shopify/operations/manifests/temporary-dead-link-redirects-2026-07-20.json',
  execution: 'shopify/operations/executions/2026-07-20-production-change-sets.md'
};

for (const path of Object.values(files)) {
  assert(existsSync(resolve(root, path)), `Missing required file: ${path}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const registry = readJson(files.registry);
const normalization = readJson(files.normalization);
const redirects = readJson(files.redirects);
const execution = readFileSync(resolve(root, files.execution), 'utf8');

const products = new Map([
  ['professional-cover-design-service', {
    gid: 'gid://shopify/Product/9024288620698',
    type: 'Publishing Service',
    updatedAt: '2026-07-21T00:26:42Z'
  }],
  ['ai-image-mastery', {
    gid: 'gid://shopify/Product/9022950998170',
    type: 'Digital Download',
    updatedAt: '2026-07-21T00:26:43Z'
  }]
]);

const skus = new Map([
  ['gid://shopify/ProductVariant/48658205376666', 'MMG-SVC-PCD-STA'],
  ['gid://shopify/ProductVariant/48658205409434', 'MMG-SVC-PCD-GRO'],
  ['gid://shopify/ProductVariant/48658205442202', 'MMG-SVC-PCD-PRO'],
  ['gid://shopify/ProductVariant/48655433498778', 'MMG-DIG-AIM-STD']
]);

const redirectMap = new Map([
  ['/products/publish-ready-book-build-service', 'gid://shopify/UrlRedirect/444925313178'],
  ['/products/listing-optimization-service', 'gid://shopify/UrlRedirect/444925345946'],
  ['/products/visual-asset-production-service', 'gid://shopify/UrlRedirect/444925378714'],
  ['/products/research-content-enhancement-service', 'gid://shopify/UrlRedirect/444925411482'],
  ['/products/the-creators-bible', 'gid://shopify/UrlRedirect/444925444250'],
  ['/products/ai-prompting-for-beginners', 'gid://shopify/UrlRedirect/444925477018']
]);

assert(registry.schemaVersion === '1.2.0', 'Registry schema must be 1.2.0');
assert(registry.verifiedAt === '2026-07-21T00:26:43Z', 'Registry verification timestamp is incorrect');
assert(registry.store?.primaryDomain === 'themindsetmediagroup.com', 'Store domain is incorrect');
assert(registry.governance?.shopifyToolkitValidationRequired === true, 'Toolkit validation must remain required');
assert(registry.governance?.mutations === 'explicit-approval-or-approved-workflow', 'Mutation approval policy is incorrect');
assert(registry.skuContract?.immutableAfterAssignment === true, 'SKU immutability must remain enabled');

const seenSkus = new Set();
for (const product of registry.liveProducts ?? []) {
  const expected = products.get(product.handle);
  assert(Boolean(expected), `Unexpected product: ${product.handle}`);
  if (!expected) continue;
  assert(product.productGid === expected.gid, `Product GID mismatch: ${product.handle}`);
  assert(product.productType === expected.type, `Product type mismatch: ${product.handle}`);
  assert(product.canonicalProductType === expected.type, `Canonical type mismatch: ${product.handle}`);
  assert(product.updatedAt === expected.updatedAt, `updatedAt mismatch: ${product.handle}`);
  assert(product.status === 'ACTIVE', `Product must remain active: ${product.handle}`);
  assert(product.requiresShipping === false, `Product must remain non-shipping: ${product.handle}`);

  for (const variant of product.variants ?? []) {
    const expectedSku = skus.get(variant.variantGid);
    assert(variant.sku === expectedSku, `SKU mismatch: ${variant.variantGid}`);
    assert(variant.canonicalSku === expectedSku, `Canonical SKU mismatch: ${variant.variantGid}`);
    assert(variant.tracked === false, `Tracking must remain disabled: ${variant.variantGid}`);
    assert(variant.requiresShipping === false, `Shipping must remain disabled: ${variant.variantGid}`);
    assert(!seenSkus.has(variant.sku), `Duplicate SKU: ${variant.sku}`);
    seenSkus.add(variant.sku);
  }
}
assert(seenSkus.size === 4, 'Exactly four verified SKUs are required');

const gaps = new Set(registry.openGaps ?? []);
assert(!gaps.has('live-product-type-fields-blank'), 'Resolved product-type gap remains open');
assert(!gaps.has('live-variant-skus-missing'), 'Resolved SKU gap remains open');
assert(gaps.has('executable-page-source-stored-in-description-html'), 'Description-source risk must remain disclosed');
assert(gaps.has('internal-links-reference-non-live-catalog-items'), 'Non-live catalog links must remain disclosed');
assert(gaps.has('subscription-product-not-created'), 'Subscription gap must remain disclosed');

assert(registry.linkAudit?.exactSourceRedirectsPresent === true, 'Redirects must be recorded as present');
assert(registry.linkAudit?.interimTarget === '/collections/all', 'Interim redirect target is incorrect');
assert(
  sameMembers(registry.linkAudit?.nonLiveProductRoutes, [...redirectMap.keys()]),
  'Registry route set is incorrect'
);
for (const redirect of registry.linkAudit?.redirectRecords ?? []) {
  assert(redirectMap.get(redirect.path) === redirect.id, `Redirect ID mismatch: ${redirect.path}`);
  assert(redirect.target === '/collections/all', `Redirect target mismatch: ${redirect.path}`);
}
assert(registry.linkAudit?.redirectRecords?.length === 6, 'Exactly six redirect records are required');

const changeSets = new Map((registry.changeSets ?? []).map((entry) => [entry.id, entry]));
for (const id of [
  'shopify-product-normalization-20260720',
  'shopify-temporary-dead-link-redirects-20260720'
]) {
  const entry = changeSets.get(id);
  assert(entry?.state === 'executed-verified', `Change set not executed-verified: ${id}`);
  assert(entry?.approvalInstruction === 'Push thru', `Approval instruction missing: ${id}`);
  assert(entry?.executionRecord === files.execution, `Execution record mismatch: ${id}`);
}
assert(changeSets.size === 2, 'Exactly two executed change sets are required');

assert(normalization.state === 'executed-verified', 'Normalization manifest is not executed-verified');
assert(normalization.authorization?.instruction === 'Push thru', 'Normalization authorization is missing');
assert(normalization.preflight?.matched === true, 'Normalization preflight must be matched');
assert(normalization.execution?.shopifyUserErrors === 0, 'Normalization must have zero Shopify errors');
assert(normalization.postconditions?.verified === true, 'Normalization must be verified');
for (const [handle, expected] of products) {
  assert(normalization.forward?.productTypes?.[handle] === expected.type, `Forward type mismatch: ${handle}`);
  assert(normalization.execution?.products?.[handle]?.updatedAt === expected.updatedAt, `Execution timestamp mismatch: ${handle}`);
}
for (const [variantGid, sku] of skus) {
  assert(normalization.forward?.skus?.[variantGid] === sku, `Forward SKU mismatch: ${variantGid}`);
  assert(normalization.rollback?.skus?.[variantGid] === null, `Rollback SKU mismatch: ${variantGid}`);
}

assert(redirects.state === 'executed-verified', 'Redirect manifest is not executed-verified');
assert(redirects.authorization?.instruction === 'Push thru', 'Redirect authorization is missing');
assert(redirects.preconditions?.matched === true, 'Redirect preflight must be matched');
assert(redirects.execution?.shopifyUserErrors === 0, 'Redirect execution must have zero Shopify errors');
assert(redirects.postconditions?.verified === true, 'Redirect postconditions must be verified');
assert(
  sameMembers(redirects.rollback?.redirectGids, [...redirectMap.values()]),
  'Rollback redirect GIDs are incorrect'
);
for (const route of redirects.routes ?? []) {
  assert(redirectMap.get(route.path) === route.redirectGid, `Manifest redirect mismatch: ${route.path}`);
}

assert(execution.includes('Executive instruction: `Push thru`'), 'Execution authorization is missing');
assert(execution.includes('Shopify user errors: 0'), 'Execution zero-error result is missing');
for (const gid of redirectMap.values()) {
  assert(execution.includes(gid), `Execution record missing redirect GID: ${gid}`);
}

if (errors.length) {
  console.error('Shopify governance validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Shopify governance valid: ${registry.liveProducts.length} products, ` +
  `${seenSkus.size} verified SKUs, ${redirectMap.size} verified redirects, ` +
  `${changeSets.size} executed change sets.`
);
