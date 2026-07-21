#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'shopify/products/professional-cover-design-service');
const required = [
  'README.md', 'contract.json', 'live-baseline.md', 'qa.md', 'deployment.md',
  'deployment-manifest.json', 'staging-record-2026-07-20.json',
  'staging-record-2026-07-20.md', 'source/section.html', 'source/styles.css',
  'source/behavior.js', 'graphql/preflight.graphql'
];
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
for (const file of required) assert(existsSync(resolve(root, file)), `Missing ${file}`);
if (errors.length) fail();

const contract = JSON.parse(readFileSync(resolve(root, 'contract.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(root, 'deployment-manifest.json'), 'utf8'));
const staging = JSON.parse(readFileSync(resolve(root, 'staging-record-2026-07-20.json'), 'utf8'));
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

assert(staging.schemaVersion === '1.0.0', 'Unexpected staging record schema');
assert(staging.recordId === 'shopify-canonical-service-product-staging-20260720', 'Staging record ID mismatch');
assert(staging.sourceChangeSetId === manifest.changeSetId, 'Staging record must reference the deployment change set');
assert(staging.state === 'staged-static-and-server-verified-render-qa-pending', 'Staging state must disclose pending rendered QA');
assert(staging.productionAuthorization?.granted === false, 'Production authorization must remain false');
assert(staging.productionAuthorization?.required === true, 'Production authorization must remain required');
assert(staging.productionAuthorization?.mustNameChangeSetId === true, 'Production approval must name the change set');
assert(staging.productionAuthorization?.changeSetId === manifest.changeSetId, 'Production approval boundary mismatch');

const production = staging.productionState || {};
for (const field of [
  'productMutated', 'descriptionHtmlReplaced', 'mainThemePublishedOrReplaced',
  'priceChanged', 'skuChanged', 'inventoryChanged', 'shippingChanged',
  'publicationChanged', 'redirectChanged'
]) assert(production[field] === false, `Production state ${field} must remain false`);
assert(production.productTemplateSuffix === null, 'Production product must remain on its current template');

assert(staging.themes?.main?.id === 'gid://shopify/OnlineStoreTheme/155242856602', 'MAIN theme GID mismatch');
assert(staging.themes?.main?.role === 'MAIN', 'MAIN theme role mismatch');
assert(staging.themes?.main?.writtenByThisChangeSet === false, 'Staging change set must not write MAIN');
assert(staging.themes?.staging?.id === 'gid://shopify/OnlineStoreTheme/155335557274', 'Staging theme GID mismatch');
assert(staging.themes?.staging?.name === 'MMG Service Staging 2026-07-20', 'Staging theme name mismatch');
assert(staging.themes?.staging?.role === 'UNPUBLISHED', 'Staging theme must remain unpublished');
assert(staging.themes?.staging?.prefix === '/t/16', 'Staging theme prefix mismatch');
assert(staging.themes?.staging?.processing === false, 'Staging theme must finish processing');
assert(staging.themes?.staging?.processingFailed === false, 'Staging theme processing must not fail');

assert(staging.preview?.path === '/t/16/products/professional-cover-design-service?view=mmg-professional-cover-design', 'Preview path mismatch');
assert(staging.preview?.templateSuffix === 'mmg-professional-cover-design', 'Preview template suffix mismatch');
assert(staging.preview?.browserRenderedQa === 'pending', 'Rendered QA must remain pending until evidence exists');
assert(staging.preview?.routeFailureObserved === false, 'Tooling rejection must not be recorded as a Shopify route failure');
assert(typeof staging.preview?.pendingReason === 'string' && staging.preview.pendingReason.length > 30, 'Pending rendered-QA reason is required');

assert(staging.preflight?.previousContractUpdatedAt === '2026-07-21T00:26:42Z', 'Previous product timestamp mismatch');
assert(staging.preflight?.reconciledUpdatedAt === '2026-07-21T00:56:35Z', 'Reconciled product timestamp mismatch');
assert(staging.preflight?.timestampMismatchReconciled === true, 'Timestamp mismatch must be explicitly reconciled');
const reconciliation = staging.preflight?.reconciliation || {};
for (const field of [
  'productIdentityUnchanged', 'seoUnchanged', 'pricesUnchanged', 'skusUnchanged',
  'optionsUnchanged', 'publicationUnchanged', 'collectionMembershipUnchanged',
  'inventoryUnchanged', 'shippingUnchanged', 'mediaIdsAndDimensionsUnchanged'
]) assert(reconciliation[field] === true, `Preflight reconciliation ${field} must be true`);
assert(reconciliation.observedMetadataChanges?.length === 3, 'Exactly three reconciled media metadata changes are required');

const expectedFiles = new Map([
  ['assets/mmg-professional-cover-design.css', ['text/css', '19a0676ec927c3e649db64a6e11a9c98', 11943]],
  ['assets/mmg-professional-cover-design.js', ['application/javascript', 'db464655bddaf9a73906e49df8762a66', 6549]],
  ['sections/mmg-professional-cover-design.liquid', ['application/x-liquid', 'f5090c30a9e202c056cf8c3a40b690ff', 13480]],
  ['templates/product.mmg-professional-cover-design.json', ['application/json', 'd8804eeb80b0f2aa7a1eb1c373841b21', 140]]
]);
assert(staging.stagedFiles?.length === expectedFiles.size, 'Staging record must contain exactly four theme files');
for (const file of staging.stagedFiles || []) {
  const values = expectedFiles.get(file.filename);
  assert(Boolean(values), `Unexpected staged file ${file.filename}`);
  if (!values) continue;
  assert(file.contentType === values[0], `${file.filename} content type mismatch`);
  assert(file.checksumMd5 === values[1], `${file.filename} checksum mismatch`);
  assert(file.size === values[2], `${file.filename} size mismatch`);
}

assert(staging.productVerification?.templateSuffix === null, 'Production product template suffix must remain null');
assert(staging.productVerification?.descriptionHtmlStillLegacySource === true, 'Live descriptionHtml must remain the rollback source');
assert(staging.productVerification?.updatedAt === staging.preflight?.reconciledUpdatedAt, 'Product verification must use the reconciled timestamp');
assert(staging.productVerification?.variants?.length === expected.size, 'Staging verification must contain all three variants');
for (const variant of staging.productVerification?.variants || []) {
  const values = expected.get(variant.name);
  assert(Boolean(values), `Unexpected staging tier ${variant.name}`);
  if (!values) continue;
  assert(variant.id === values[0], `${variant.name} staged variant GID mismatch`);
  assert(variant.sku === values[1], `${variant.name} staged SKU mismatch`);
  assert(variant.price === values[2], `${variant.name} staged price mismatch`);
  assert(variant.availableForSale === true, `${variant.name} must remain available for sale`);
  assert(variant.tracked === false, `${variant.name} staged tracking must remain false`);
  assert(variant.requiresShipping === false, `${variant.name} staged shipping must remain false`);
  assert(variant.requiresComponents === false, `${variant.name} must not require bundle components`);
}

const pageHandles = new Set((staging.routeVerification?.pages || []).map((page) => page.handle));
assert(pageHandles.has('customer-portal'), 'Staging evidence must include Customer Portal');
assert(pageHandles.has('customer-service'), 'Staging evidence must include customer service');
assert((staging.routeVerification?.pages || []).every((page) => page.published === true), 'Canonical journey pages must be published');
const redirectPaths = new Set((staging.routeVerification?.temporaryRedirects || []).map((redirect) => redirect.path));
for (const route of contract.reservedRoutes || []) assert(redirectPaths.has(route), `Staging evidence missing redirect ${route}`);
assert((staging.routeVerification?.temporaryRedirects || []).every((redirect) => redirect.target === '/collections/all'), 'Temporary redirects must still target /collections/all');

assert(staging.qa?.graphqlSchemaValidation === 'passed', 'GraphQL validation evidence missing');
assert(staging.qa?.themeFileWrites === 'passed-zero-user-errors', 'Theme file write evidence missing');
assert(staging.qa?.themeFileReadback === 'passed-zero-user-errors', 'Theme file readback evidence missing');
assert(staging.qa?.productionUnchanged === 'passed-server', 'Production unchanged verification missing');
for (const field of [
  'renderedResponsiveOverflow', 'renderedHeaderFooter',
  'renderedKeyboardAndFocus', 'renderedCartNetworkRequest'
]) assert(staging.qa?.[field] === 'pending-browser-retrieval', `${field} must remain pending until browser evidence exists`);

assert(staging.rollback?.stagingOnly === true, 'Current rollback boundary must remain staging-only');
assert(staging.rollback?.productionRollbackRequiredAtThisStage === false, 'Production rollback must not be required before production changes');
assert(staging.rollback?.deleteOnlyTheseFiles?.length === 4, 'Staging rollback must identify exactly four files');

if (errors.length) fail();
console.log('Canonical service product valid: source contract preserved, unpublished staging verified, rendered browser QA pending, production unchanged.');

function fail() {
  console.error('Canonical service product validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
