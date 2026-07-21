#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const registryPath = resolve(root, 'registry/shopify-product-contracts.json');
const normalizationManifestPath = resolve(
  root,
  'shopify/operations/manifests/product-normalization-2026-07-20.json'
);
const redirectManifestPath = resolve(
  root,
  'shopify/operations/manifests/temporary-dead-link-redirects-2026-07-20.json'
);

const requiredFiles = [
  'shopify/operations/README.md',
  'shopify/operations/live-baseline-2026-07-20.md',
  'shopify/operations/product-contracts.md',
  'shopify/operations/change-control.md',
  'shopify/operations/workflows.md',
  'shopify/operations/normalization-plan-2026-07-20.md',
  'shopify/operations/link-audit-2026-07-20.md',
  'shopify/operations/graphql/product-normalization-preflight.graphql',
  'shopify/operations/graphql/product-normalization-forward.graphql',
  'shopify/operations/graphql/product-normalization-rollback.graphql',
  'shopify/operations/graphql/temporary-dead-link-redirects-forward.graphql',
  'shopify/operations/graphql/temporary-dead-link-redirects-rollback.graphql',
  'shopify/operations/manifests/product-normalization-2026-07-20.json',
  'shopify/operations/manifests/temporary-dead-link-redirects-2026-07-20.json',
  'registry/shopify-product-contracts.json'
];

const requiredProductionControls = [
  'live-read',
  'pre-change-snapshot',
  'validation',
  'change-record',
  'rollback-plan',
  'explicit-approval',
  'post-change-verification'
];

const expectedSubscriptionPlans = new Map([
  ['monthly', { price: '14.95', digitalAssetsPerCadence: 2, proposedSkuSuffix: 'MON' }],
  ['bi-weekly', { price: '24.95', digitalAssetsPerCadence: 4, proposedSkuSuffix: 'BI' }],
  ['weekly', { price: '39.95', digitalAssetsPerCadence: 8, proposedSkuSuffix: 'WEE' }]
]);

const expectedProductTypes = new Map([
  ['professional-cover-design-service', 'Publishing Service'],
  ['ai-image-mastery', 'Digital Download']
]);

const expectedSkus = new Map([
  ['gid://shopify/ProductVariant/48658205376666', 'MMG-SVC-PCD-STA'],
  ['gid://shopify/ProductVariant/48658205409434', 'MMG-SVC-PCD-GRO'],
  ['gid://shopify/ProductVariant/48658205442202', 'MMG-SVC-PCD-PRO'],
  ['gid://shopify/ProductVariant/48655433498778', 'MMG-DIG-AIM-STD']
]);

const expectedDeadRoutes = [
  '/products/publish-ready-book-build-service',
  '/products/listing-optimization-service',
  '/products/visual-asset-production-service',
  '/products/research-content-enhancement-service',
  '/products/the-creators-bible',
  '/products/ai-prompting-for-beginners'
];

const expectedChangeSets = new Map([
  [
    'shopify-product-normalization-20260720',
    'shopify/operations/manifests/product-normalization-2026-07-20.json'
  ],
  [
    'shopify-temporary-dead-link-redirects-20260720',
    'shopify/operations/manifests/temporary-dead-link-redirects-2026-07-20.json'
  ]
]);

const preparedState = 'prepared-not-approved-not-executed';
const skuPattern = /^MMG-(SVC|DIG|SUB)-[A-Z0-9]+-[A-Z0-9]+$/;

const prohibitedSecretKeys = new Set([
  'token',
  'access_token',
  'accesstoken',
  'client_secret',
  'clientsecret',
  'api_key',
  'apikey',
  'password',
  'private_key',
  'privatekey',
  'webhook_secret',
  'webhooksecret'
]);

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function isPositiveMoney(value) {
  return typeof value === 'string' && /^\d+\.\d{2}$/.test(value) && Number(value) > 0;
}

function readJson(path, label) {
  if (!existsSync(path)) {
    errors.push(`Missing ${label}: ${path}`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${label} JSON is invalid: ${error.message}`);
    return null;
  }
}

function inspectForSecrets(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectForSecrets(entry, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== 'object') return;

  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[-\s]/g, '_');
    if (prohibitedSecretKeys.has(normalizedKey)) {
      errors.push(`Prohibited secret-like key found at ${path}.${key}`);
    }
    inspectForSecrets(entry, `${path}.${key}`);
  }
}

function sameMembers(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  return actualSet.size === expected.length && expected.every((entry) => actualSet.has(entry));
}

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `Missing required Shopify governance file: ${file}`);
}

const registry = readJson(registryPath, 'Shopify product registry');
const normalizationManifest = readJson(normalizationManifestPath, 'Product normalization manifest');
const redirectManifest = readJson(redirectManifestPath, 'Temporary redirect manifest');

if (!registry || !normalizationManifest || !redirectManifest) {
  console.error('Shopify governance validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

assert(/^\d+\.\d+\.\d+$/.test(registry.schemaVersion ?? ''), 'schemaVersion must use semantic version format');
assert(/^1\.[1-9]\d*\.\d+$/.test(registry.schemaVersion ?? ''), 'registry schemaVersion must include the normalization contract');
assert(/^\d{4}-\d{2}-\d{2}$/.test(registry.observedAt ?? ''), 'observedAt must use YYYY-MM-DD format');
assert(registry.store?.name === 'Mindset Media Group', 'Store name must be Mindset Media Group');
assert(registry.store?.primaryDomain === 'themindsetmediagroup.com', 'Primary domain must match the connected MMG store');
assert(registry.store?.currency === 'USD', 'Store currency must be USD');

const governance = registry.governance ?? {};
assert(governance.shopifyToolkitValidationRequired === true, 'Shopify Toolkit validation must be required');
assert(governance.telemetryOptOutDefault === true, 'Shopify instrumentation opt-out must remain the default');
assert(governance.readOnlyInspection === 'governed-automatic', 'Read-only inspection must remain governed-automatic');
assert(
  governance.mutations === 'explicit-approval-or-approved-workflow',
  'Mutation policy must require explicit approval or an approved governed workflow'
);

const configuredControls = new Set(governance.productionRequirements ?? []);
for (const control of requiredProductionControls) {
  assert(configuredControls.has(control), `Missing required production control: ${control}`);
}

assert(registry.skuContract?.immutableAfterAssignment === true, 'SKU contract must be immutable after assignment');
assert(registry.skuContract?.priceIndependent === true, 'SKU contract must remain price-independent');
assert(registry.skuContract?.regex === '^MMG-(SVC|DIG|SUB)-[A-Z0-9]+-[A-Z0-9]+$', 'Unexpected SKU contract regex');

assert(Array.isArray(registry.liveProducts) && registry.liveProducts.length === 2, 'liveProducts must contain the two verified products');

const productHandles = new Set();
const productGids = new Set();
const variantGids = new Set();
const inventoryItemGids = new Set();
const proposedSkus = new Set();
let hasBlankProductType = false;
let hasMissingSku = false;

for (const product of registry.liveProducts ?? []) {
  assert(['service', 'digital-download', 'subscription'].includes(product.archetype), `Unsupported product archetype: ${product.archetype}`);
  assert(typeof product.title === 'string' && product.title.length > 0, 'Every live product requires a title');
  assert(typeof product.handle === 'string' && product.handle.length > 0, `Product ${product.title ?? '<unknown>'} requires a handle`);
  assert(/^gid:\/\/shopify\/Product\/\d+$/.test(product.productGid ?? ''), `Invalid product GID for ${product.handle ?? '<unknown>'}`);
  assert(!productHandles.has(product.handle), `Duplicate product handle: ${product.handle}`);
  assert(!productGids.has(product.productGid), `Duplicate product GID: ${product.productGid}`);
  productHandles.add(product.handle);
  productGids.add(product.productGid);

  const expectedType = expectedProductTypes.get(product.handle);
  assert(Boolean(expectedType), `Unexpected live product handle: ${product.handle}`);
  assert(product.proposedProductType === expectedType, `Unexpected proposed product type for ${product.handle}`);
  assert(product.requiresShipping === false, `${product.handle} must remain non-shipping`);

  if (product.productType == null || product.productType === '') hasBlankProductType = true;

  assert(Array.isArray(product.variants) && product.variants.length > 0, `Product ${product.handle} requires at least one variant`);
  for (const variant of product.variants ?? []) {
    assert(/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variant.variantGid ?? ''), `Invalid variant GID for ${product.handle}`);
    assert(/^gid:\/\/shopify\/InventoryItem\/\d+$/.test(variant.inventoryItemGid ?? ''), `Invalid inventory item GID for ${product.handle}`);
    assert(!variantGids.has(variant.variantGid), `Duplicate variant GID: ${variant.variantGid}`);
    assert(!inventoryItemGids.has(variant.inventoryItemGid), `Duplicate inventory item GID: ${variant.inventoryItemGid}`);
    assert(isPositiveMoney(variant.price), `Invalid price for variant ${variant.name ?? variant.variantGid}`);
    assert(variant.currency === 'USD', `Variant ${variant.name ?? variant.variantGid} must use USD`);

    const expectedSku = expectedSkus.get(variant.variantGid);
    assert(Boolean(expectedSku), `Unexpected live variant GID: ${variant.variantGid}`);
    assert(variant.proposedSku === expectedSku, `Unexpected proposed SKU for ${variant.variantGid}`);
    assert(skuPattern.test(variant.proposedSku ?? ''), `Proposed SKU violates contract: ${variant.proposedSku ?? '<missing>'}`);
    assert(!proposedSkus.has(variant.proposedSku), `Duplicate proposed SKU: ${variant.proposedSku}`);
    proposedSkus.add(variant.proposedSku);

    variantGids.add(variant.variantGid);
    inventoryItemGids.add(variant.inventoryItemGid);
    if (variant.sku == null || variant.sku === '') hasMissingSku = true;
  }
}

assert(proposedSkus.size === expectedSkus.size, 'All four proposed SKUs must be present and unique');

const gaps = new Set(registry.openGaps ?? []);
if (hasBlankProductType) {
  assert(gaps.has('live-product-type-fields-blank'), 'Registry must disclose blank live product-type fields');
}
if (hasMissingSku) {
  assert(gaps.has('live-variant-skus-missing'), 'Registry must disclose missing live variant SKUs');
}
assert(
  gaps.has('executable-page-source-stored-in-description-html'),
  'Registry must disclose executable storefront source stored in descriptionHtml'
);
assert(
  gaps.has('internal-links-reference-non-live-catalog-items'),
  'Registry must disclose non-live product links'
);

assert(Array.isArray(registry.liveCollections) && registry.liveCollections.length > 0, 'liveCollections must contain the verified catalog collection');
for (const collection of registry.liveCollections ?? []) {
  assert(/^gid:\/\/shopify\/Collection\/\d+$/.test(collection.collectionGid ?? ''), `Invalid collection GID for ${collection.handle ?? '<unknown>'}`);
  assert(Number.isInteger(collection.productCount) && collection.productCount >= 0, `Invalid product count for collection ${collection.handle ?? '<unknown>'}`);
}

const subscription = (registry.targetProducts ?? []).find((product) => product.archetype === 'subscription');
assert(subscription?.state === 'approved-not-live', 'Subscription contract must remain marked approved-not-live until verified in Shopify');
assert(subscription?.proposedProductType === 'Subscription Membership', 'Subscription product type proposal is incorrect');
assert(subscription?.onboardingGuide === 'MMG Subscription Member Guide', 'Subscription onboarding guide is incorrect');
assert(subscription?.profileRequirement === 'required-before-first-package', 'Subscription profile gate is required');
assert(subscription?.subscriptionVerification === 'required-before-delivery', 'Subscription verification gate is required');

const plans = new Map((subscription?.plans ?? []).map((plan) => [plan.cadence, plan]));
assert(plans.size === expectedSubscriptionPlans.size, 'Subscription contract must define exactly monthly, bi-weekly, and weekly plans');
for (const [cadence, expected] of expectedSubscriptionPlans) {
  const plan = plans.get(cadence);
  assert(Boolean(plan), `Missing subscription cadence: ${cadence}`);
  if (!plan) continue;
  assert(plan.price === expected.price, `Unexpected ${cadence} subscription price`);
  assert(plan.currency === 'USD', `${cadence} subscription plan must use USD`);
  assert(plan.digitalAssetsPerCadence === expected.digitalAssetsPerCadence, `Unexpected ${cadence} digital-asset entitlement`);
  assert(plan.proposedSkuSuffix === expected.proposedSkuSuffix, `Unexpected ${cadence} proposed SKU suffix`);
}

assert(sameMembers(registry.linkAudit?.nonLiveProductRoutes, expectedDeadRoutes), 'Link audit must contain the exact six non-live product routes');
assert(registry.linkAudit?.exactSourceRedirectsPresent === false, 'Exact source redirects must remain recorded as absent');
assert(registry.linkAudit?.preparedInterimTarget === '/collections/all', 'Unexpected temporary redirect target');
assert(sameMembers(registry.linkAudit?.livePageRoutes, ['/pages/free-creator-toolkit', '/pages/capcut-templates']), 'Live informational page routes are incorrect');

const changeSets = new Map((registry.preparedChangeSets ?? []).map((entry) => [entry.id, entry]));
assert(changeSets.size === expectedChangeSets.size, 'Registry must define exactly two prepared Shopify change sets');
for (const [id, manifest] of expectedChangeSets) {
  const entry = changeSets.get(id);
  assert(Boolean(entry), `Missing prepared change set: ${id}`);
  if (!entry) continue;
  assert(entry.state === preparedState, `Change set ${id} must remain unapproved and unexecuted`);
  assert(entry.manifest === manifest, `Unexpected manifest path for ${id}`);
}

assert(normalizationManifest.changeSetId === 'shopify-product-normalization-20260720', 'Normalization manifest change-set ID is incorrect');
assert(normalizationManifest.state === preparedState, 'Normalization manifest must remain unapproved and unexecuted');
assert(normalizationManifest.approvalLevel === 3, 'Normalization manifest requires approval level 3');
assert(normalizationManifest.preflight?.abortOnAnyMismatch === true, 'Normalization preflight must abort on any mismatch');
assert(normalizationManifest.forward?.allowPartialUpdates === false, 'Normalization must prohibit partial variant updates');
assert(normalizationManifest.rollback?.strategy === 'restore-exact-preflight-values', 'Normalization rollback must restore exact preflight values');
assert(normalizationManifest.postconditions?.uniqueSkusRequired === true, 'Normalization postconditions must require unique SKUs');
assert(normalizationManifest.postconditions?.inventoryTrackingMustRemain === false, 'Normalization must not enable inventory tracking');
assert(normalizationManifest.postconditions?.requiresShippingMustRemain === false, 'Normalization must not enable shipping');

for (const [handle, productType] of expectedProductTypes) {
  assert(normalizationManifest.forward?.productTypes?.[handle] === productType, `Normalization manifest product type mismatch for ${handle}`);
  assert(normalizationManifest.rollback?.productTypes?.[handle] === '', `Normalization rollback product type mismatch for ${handle}`);
}
for (const [variantGid, sku] of expectedSkus) {
  assert(normalizationManifest.forward?.skus?.[variantGid] === sku, `Normalization manifest SKU mismatch for ${variantGid}`);
  assert(normalizationManifest.rollback?.skus?.[variantGid] === null, `Normalization rollback SKU mismatch for ${variantGid}`);
}

assert(redirectManifest.changeSetId === 'shopify-temporary-dead-link-redirects-20260720', 'Redirect manifest change-set ID is incorrect');
assert(redirectManifest.state === preparedState, 'Redirect manifest must remain unapproved and unexecuted');
assert(redirectManifest.approvalLevel === 3, 'Redirect manifest requires approval level 3');
assert(redirectManifest.preconditions?.abortOnAnyMismatch === true, 'Redirect preflight must abort on any mismatch');
assert(redirectManifest.preconditions?.target === '/collections/all', 'Redirect preflight target is incorrect');
assert(sameMembers(redirectManifest.preconditions?.paths, expectedDeadRoutes), 'Redirect manifest paths are incorrect');
assert(redirectManifest.forward?.captureReturnedRedirectGids === true, 'Redirect execution must capture created GIDs');
assert(redirectManifest.rollback?.deleteOnlyCreatedRedirects === true, 'Redirect rollback must delete only created redirects');
assert(Array.isArray(redirectManifest.routes) && redirectManifest.routes.length === expectedDeadRoutes.length, 'Redirect manifest must define six routes');
for (const route of redirectManifest.routes ?? []) {
  assert(expectedDeadRoutes.includes(route.path), `Unexpected redirect path: ${route.path}`);
  assert(route.target === '/collections/all', `Unexpected redirect target for ${route.path}`);
}

const guardedMutationArtifacts = [
  ['shopify/operations/graphql/product-normalization-forward.graphql', 'MMGNormalizeLiveProductMetadata'],
  ['shopify/operations/graphql/product-normalization-rollback.graphql', 'MMGRollbackLiveProductMetadata'],
  ['shopify/operations/graphql/temporary-dead-link-redirects-forward.graphql', 'MMGCreateTemporaryCatalogRedirects'],
  ['shopify/operations/graphql/temporary-dead-link-redirects-rollback.graphql', 'MMGDeleteTemporaryCatalogRedirects']
];

for (const [path, operationName] of guardedMutationArtifacts) {
  const content = readFileSync(resolve(root, path), 'utf8');
  assert(content.startsWith('# Prepared'), `${path} must begin with a prepared-only guard`);
  assert(content.includes(`mutation ${operationName}`), `${path} is missing mutation ${operationName}`);
  assert(content.includes('userErrors'), `${path} must request Shopify userErrors`);
}

const preflightContent = readFileSync(
  resolve(root, 'shopify/operations/graphql/product-normalization-preflight.graphql'),
  'utf8'
);
assert(preflightContent.includes('query MMGProductNormalizationPreflight'), 'Normalization preflight query is missing');
assert(preflightContent.includes('updatedAt'), 'Normalization preflight must include updatedAt concurrency evidence');
assert(preflightContent.includes('requiresShipping'), 'Normalization preflight must verify shipping state');
assert(preflightContent.includes('tracked'), 'Normalization preflight must verify inventory tracking');

inspectForSecrets(registry);
inspectForSecrets(normalizationManifest, '$.normalizationManifest');
inspectForSecrets(redirectManifest, '$.redirectManifest');

if (errors.length > 0) {
  console.error('Shopify governance validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Shopify governance valid: ${registry.liveProducts.length} live products, ` +
  `${registry.liveCollections.length} live collections, ${proposedSkus.size} prepared SKUs, ` +
  `${expectedDeadRoutes.length} audited dead routes, and ${changeSets.size} unapproved change sets.`
);
