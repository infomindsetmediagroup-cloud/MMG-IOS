#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'shopify/products/professional-cover-design-service');
const required = [
  'README.md', 'contract.json', 'live-baseline.md', 'qa.md', 'deployment.md',
  'deployment-manifest.json', 'source/section.html', 'source/styles.css',
  'source/behavior.js', 'graphql/preflight.graphql'
];
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
for (const file of required) assert(existsSync(resolve(root, file)), `Missing ${file}`);
if (errors.length) fail();

const contract = JSON.parse(readFileSync(resolve(root, 'contract.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(root, 'deployment-manifest.json'), 'utf8'));
const html = readFileSync(resolve(root, 'source/section.html'), 'utf8');
const css = readFileSync(resolve(root, 'source/styles.css'), 'utf8');
const js = readFileSync(resolve(root, 'source/behavior.js'), 'utf8');
const gql = readFileSync(resolve(root, 'graphql/preflight.graphql'), 'utf8');

assert(contract.state === 'candidate-not-deployed', 'Contract must remain candidate-not-deployed');
assert(contract.product?.id === 'gid://shopify/Product/9024288620698', 'Product GID mismatch');
assert(contract.product?.handle === 'professional-cover-design-service', 'Product handle mismatch');
assert(contract.product?.productType === 'Publishing Service', 'Product type mismatch');
assert(contract.product?.status === 'ACTIVE', 'Product must remain active');
assert(contract.product?.tracksInventory === false, 'Inventory tracking must remain disabled');
assert(contract.product?.requiresShipping === false, 'Shipping must remain disabled');
assert(contract.product?.requiresSellingPlan === false, 'Selling plan must remain optional');

const expected = new Map([
  ['Starter', ['gid://shopify/ProductVariant/48658205376666', 'MMG-SVC-PCD-STA', '97.95']],
  ['Growth', ['gid://shopify/ProductVariant/48658205409434', 'MMG-SVC-PCD-GRO', '197.95']],
  ['Professional', ['gid://shopify/ProductVariant/48658205442202', 'MMG-SVC-PCD-PRO', '397.95']]
]);
assert(contract.variants?.length === 3, 'Exactly three service variants are required');
for (const variant of contract.variants || []) {
  const values = expected.get(variant.name);
  assert(Boolean(values), `Unexpected tier ${variant.name}`);
  if (!values) continue;
  assert(variant.id === values[0], `${variant.name} variant GID mismatch`);
  assert(variant.sku === values[1], `${variant.name} SKU mismatch`);
  assert(variant.price === values[2], `${variant.name} price mismatch`);
  assert(variant.tracked === false, `${variant.name} tracking must remain disabled`);
  assert(variant.requiresShipping === false, `${variant.name} shipping must remain disabled`);
}

assert((html.match(/<h1\b/g) || []).length === 1, 'Candidate must have exactly one H1');
for (const id of ['objectives','deliverables','packages','delivery','process','progress','scope','next']) {
  assert(html.includes(`id="${id}"`), `Missing section ${id}`);
}
for (const tier of expected.keys()) {
  assert(html.includes(`data-mmg-tier="${tier}"`), `Missing ${tier} tier card`);
  assert(html.includes(`data-mmg-add="${tier}"`), `Missing ${tier} cart control`);
}
for (const route of contract.reservedRoutes || []) assert(html.includes(`href="${route}"`), `Missing reserved route ${route}`);
assert(html.includes('/pages/customer-portal'), 'Customer Portal route missing');
assert(html.includes('/pages/customer-service'), 'Customer service route missing');

assert(css.includes('#mmg-professional-cover-design'), 'CSS must remain root-scoped');
assert(css.includes('object-fit: contain'), 'Portrait media must use object-fit: contain');
assert(css.includes('prefers-reduced-motion'), 'Reduced-motion CSS is required');
assert(!css.includes('100vw'), '100vw is prohibited in the scoped candidate');

assert(js.includes('/cart/add.js'), 'Customer-initiated Shopify cart endpoint is missing');
assert(js.includes("addEventListener('click'"), 'Cart mutation must be bound to a customer click');
assert(js.includes(`/products/${'${encodeURIComponent(handle)}'}.js`), 'Live product hydration endpoint is missing');
assert(js.includes("credentials: 'same-origin'"), 'Same-origin credentials are required');
assert(!/productUpdate|graphql_mutation|admin\/api|access[_-]?token|client[_-]?secret/i.test(js), 'Client code contains a prohibited Admin API or secret pattern');

assert(gql.includes('query MMGCanonicalServiceProductPreflight'), 'Preflight operation name missing');
for (const field of ['updatedAt','variants','inventoryItem','media','requiresSellingPlan']) assert(gql.includes(field), `Preflight missing ${field}`);

assert(manifest.state === 'prepared-not-approved-not-executed', 'Deployment manifest must remain unapproved');
assert(manifest.changeSetId === 'shopify-canonical-service-product-source-20260721', 'Change-set ID mismatch');
assert(manifest.preflight?.captureDescriptionHtmlForRollback === true, 'Rollback source capture is required');
assert(manifest.approval?.mustNameChangeSetId === true, 'Explicit named approval is required');
assert(manifest.prohibitedChanges?.includes('price'), 'Price changes must be prohibited');

if (errors.length) fail();
console.log('Canonical service product valid: 3 tiers, exact IDs/SKUs/prices, split source, approval-gated deployment.');

function fail() {
  console.error('Canonical service product validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
