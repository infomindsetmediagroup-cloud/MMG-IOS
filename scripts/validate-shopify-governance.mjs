#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const registryPath = resolve(root, 'registry/shopify-product-contracts.json');

const requiredFiles = [
  'shopify/operations/README.md',
  'shopify/operations/live-baseline-2026-07-20.md',
  'shopify/operations/product-contracts.md',
  'shopify/operations/change-control.md',
  'shopify/operations/workflows.md',
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
  ['monthly', { price: '14.95', digitalAssetsPerCadence: 2 }],
  ['bi-weekly', { price: '24.95', digitalAssetsPerCadence: 4 }],
  ['weekly', { price: '39.95', digitalAssetsPerCadence: 8 }]
]);

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

for (const file of requiredFiles) {
  assert(existsSync(resolve(root, file)), `Missing required Shopify governance file: ${file}`);
}

if (!existsSync(registryPath)) {
  console.error('Shopify governance validation failed:\n- Missing registry/shopify-product-contracts.json');
  process.exit(1);
}

let registry;
try {
  registry = JSON.parse(readFileSync(registryPath, 'utf8'));
} catch (error) {
  console.error(`Shopify governance validation failed:\n- Registry JSON is invalid: ${error.message}`);
  process.exit(1);
}

assert(/^\d+\.\d+\.\d+$/.test(registry.schemaVersion ?? ''), 'schemaVersion must use semantic version format');
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

assert(Array.isArray(registry.liveProducts) && registry.liveProducts.length > 0, 'liveProducts must contain the verified catalog');

const productHandles = new Set();
const productGids = new Set();
const variantGids = new Set();
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

  if (product.productType == null || product.productType === '') hasBlankProductType = true;

  assert(Array.isArray(product.variants) && product.variants.length > 0, `Product ${product.handle} requires at least one variant`);
  for (const variant of product.variants ?? []) {
    assert(/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variant.variantGid ?? ''), `Invalid variant GID for ${product.handle}`);
    assert(!variantGids.has(variant.variantGid), `Duplicate variant GID: ${variant.variantGid}`);
    assert(isPositiveMoney(variant.price), `Invalid price for variant ${variant.name ?? variant.variantGid}`);
    assert(variant.currency === 'USD', `Variant ${variant.name ?? variant.variantGid} must use USD`);
    variantGids.add(variant.variantGid);
    if (variant.sku == null || variant.sku === '') hasMissingSku = true;
  }
}

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

assert(Array.isArray(registry.liveCollections) && registry.liveCollections.length > 0, 'liveCollections must contain the verified catalog collection');
for (const collection of registry.liveCollections ?? []) {
  assert(/^gid:\/\/shopify\/Collection\/\d+$/.test(collection.collectionGid ?? ''), `Invalid collection GID for ${collection.handle ?? '<unknown>'}`);
  assert(Number.isInteger(collection.productCount) && collection.productCount >= 0, `Invalid product count for collection ${collection.handle ?? '<unknown>'}`);
}

const subscription = (registry.targetProducts ?? []).find((product) => product.archetype === 'subscription');
assert(subscription?.state === 'approved-not-live', 'Subscription contract must remain marked approved-not-live until verified in Shopify');
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
  assert(
    plan.digitalAssetsPerCadence === expected.digitalAssetsPerCadence,
    `Unexpected ${cadence} digital-asset entitlement`
  );
}

inspectForSecrets(registry);

if (errors.length > 0) {
  console.error('Shopify governance validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Shopify governance valid: ${registry.liveProducts.length} live products, ` +
  `${registry.liveCollections.length} live collections, ` +
  `${subscription.plans.length} approved subscription cadences.`
);
