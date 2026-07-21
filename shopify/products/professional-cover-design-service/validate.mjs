#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'shopify/products/professional-cover-design-service');
const required = [
  'README.md',
  'contract.json',
  'live-baseline.md',
  'qa.md',
  'deployment.md',
  'deployment-manifest.json',
  'staging-record-2026-07-20.json',
  'staging-record-2026-07-20.md',
  'local-browser-qa-2026-07-20.json',
  'local-browser-qa-2026-07-20.md',
  'production-checkpoint-2026-07-20.json',
  'production-checkpoint-2026-07-20.md',
  'production-execution-2026-07-20.json',
  'production-execution-2026-07-20.md',
  'source/section.html',
  'source/styles.css',
  'source/behavior.js',
  'graphql/preflight.graphql'
];

const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
for (const file of required) assert(existsSync(resolve(root, file)), `Missing ${file}`);
if (errors.length) fail();

const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const contract = readJson('contract.json');
const manifest = readJson('deployment-manifest.json');
const staging = readJson('staging-record-2026-07-20.json');
const localQa = readJson('local-browser-qa-2026-07-20.json');
const checkpoint = readJson('production-checkpoint-2026-07-20.json');
const execution = readJson('production-execution-2026-07-20.json');
const html = readFileSync(resolve(root, 'source/section.html'), 'utf8');
const css = readFileSync(resolve(root, 'source/styles.css'), 'utf8');
const js = readFileSync(resolve(root, 'source/behavior.js'), 'utf8');
const gql = readFileSync(resolve(root, 'graphql/preflight.graphql'), 'utf8');

const changeSetId = 'shopify-canonical-service-product-source-20260721';
const productId = 'gid://shopify/Product/9024288620698';
const mainThemeId = 'gid://shopify/OnlineStoreTheme/155336671386';
const rollbackThemeId = 'gid://shopify/OnlineStoreTheme/155242856602';
const historicalThemeId = 'gid://shopify/OnlineStoreTheme/155335557274';
const templateSuffix = 'mmg-professional-cover-design';
const exactApproval = `Approve production deployment: ${changeSetId}`;

const expectedVariants = new Map([
  ['Starter', {
    id: 'gid://shopify/ProductVariant/48658205376666',
    inventoryItemId: 'gid://shopify/InventoryItem/50674230755482',
    sku: 'MMG-SVC-PCD-STA',
    price: '97.95'
  }],
  ['Growth', {
    id: 'gid://shopify/ProductVariant/48658205409434',
    inventoryItemId: 'gid://shopify/InventoryItem/50674230788250',
    sku: 'MMG-SVC-PCD-GRO',
    price: '197.95'
  }],
  ['Professional', {
    id: 'gid://shopify/ProductVariant/48658205442202',
    inventoryItemId: 'gid://shopify/InventoryItem/50674230821018',
    sku: 'MMG-SVC-PCD-PRO',
    price: '397.95'
  }]
]);

const expectedFiles = new Map([
  ['assets/mmg-professional-cover-design.css', ['text/css', '19a0676ec927c3e649db64a6e11a9c98', 11943]],
  ['assets/mmg-professional-cover-design.js', ['application/javascript', 'db464655bddaf9a73906e49df8762a66', 6549]],
  ['sections/mmg-professional-cover-design.liquid', ['application/x-liquid', 'f5090c30a9e202c056cf8c3a40b690ff', 13480]],
  ['templates/product.mmg-professional-cover-design.json', ['application/json', '6935d2e46128a36c8d5578ac1e62d50b', 503]]
]);

// Deployed product contract.
assert(contract.schemaVersion === '1.1.0', 'Unexpected contract schema');
assert(contract.contractId === 'mmg-canonical-service-product-professional-cover-design', 'Contract ID mismatch');
assert(contract.state === 'deployed-verified', 'Contract must be deployed-verified');
assert(contract.observedAt === '2026-07-21T03:16:38Z', 'Contract observation timestamp mismatch');
assert(contract.product?.id === productId, 'Product GID mismatch');
assert(contract.product?.handle === 'professional-cover-design-service', 'Product handle mismatch');
assert(contract.product?.status === 'ACTIVE', 'Product must remain active');
assert(contract.product?.productType === 'Publishing Service', 'Product type mismatch');
assert(contract.product?.templateSuffix === templateSuffix, 'Product template suffix mismatch');
assert(contract.product?.updatedAt === '2026-07-21T03:16:38Z', 'Product deployment timestamp mismatch');
assert(contract.product?.tracksInventory === false, 'Inventory tracking must remain disabled');
assert(contract.product?.requiresShipping === false, 'Shipping must remain disabled');
assert(contract.product?.requiresSellingPlan === false, 'Selling plan must remain optional');
assert(contract.product?.sourceLocation === 'online-store-theme-product-template', 'Source location mismatch');
assert(contract.theme?.mainThemeId === mainThemeId, 'Contract MAIN theme mismatch');
assert(contract.theme?.rollbackThemeId === rollbackThemeId, 'Contract rollback theme mismatch');
assert(contract.theme?.rollbackThemeRole === 'UNPUBLISHED', 'Rollback theme must remain unpublished');
assert(contract.variants?.length === expectedVariants.size, 'Exactly three variants are required');
for (const variant of contract.variants || []) {
  const expected = expectedVariants.get(variant.name);
  assert(Boolean(expected), `Unexpected contract variant ${variant.name}`);
  if (!expected) continue;
  assert(variant.id === expected.id, `${variant.name} contract variant ID mismatch`);
  assert(variant.inventoryItemId === expected.inventoryItemId, `${variant.name} contract inventory item mismatch`);
  assert(variant.sku === expected.sku, `${variant.name} contract SKU mismatch`);
  assert(variant.price === expected.price, `${variant.name} contract price mismatch`);
  assert(variant.availableForSale === true, `${variant.name} must remain available for sale`);
  assert(variant.tracked === false, `${variant.name} tracking must remain disabled`);
  assert(variant.requiresShipping === false, `${variant.name} shipping must remain disabled`);
}
assert(contract.sourceArchitecture?.legacyDescriptionHtmlPreservedForRollback === true, 'Legacy descriptionHtml rollback source must remain preserved');
assert(contract.sourceArchitecture?.deploymentApprovalReceived === true, 'Deployment approval must be recorded');
assert(contract.sourceArchitecture?.postDeploymentVerificationPassed === true, 'Post-deployment verification must pass');

// Governed source remains safe and deterministic.
assert((html.match(/<h1\b/g) || []).length === 1, 'Candidate source must have exactly one H1');
for (const id of ['objectives', 'deliverables', 'packages', 'delivery', 'process', 'progress', 'scope', 'next']) {
  assert(html.includes(`id="${id}"`), `Missing source section ${id}`);
}
for (const tier of expectedVariants.keys()) {
  assert(html.includes(`data-mmg-tier="${tier}"`), `Missing ${tier} tier card`);
  assert(html.includes(`data-mmg-add="${tier}"`), `Missing ${tier} cart control`);
}
assert(css.includes('#mmg-professional-cover-design'), 'CSS must remain root-scoped');
assert(css.includes('object-fit: contain'), 'Portrait imagery must remain contained');
assert(css.includes('prefers-reduced-motion'), 'Reduced-motion CSS is required');
assert(!css.includes('100vw'), '100vw is prohibited');
assert(js.includes('/cart/add.js'), 'Customer-initiated cart endpoint missing');
assert(js.includes("addEventListener('click'"), 'Cart mutation must be bound to customer click');
assert(js.includes(`/products/${'${encodeURIComponent(handle)}'}.js`), 'Live product hydration endpoint missing');
assert(js.includes("credentials: 'same-origin'"), 'Same-origin credentials are required');
assert(!/productUpdate|graphql_mutation|admin\/api|access[_-]?token|client[_-]?secret/i.test(js), 'Client source contains prohibited Admin API or secret patterns');
assert(gql.includes('query MMGCanonicalServiceProductPreflight'), 'Stored preflight operation missing');
for (const field of ['updatedAt', 'variants', 'inventoryItem', 'media', 'requiresSellingPlan']) {
  assert(gql.includes(field), `Stored preflight missing ${field}`);
}

// Final deployment manifest.
assert(manifest.schemaVersion === '1.3.0', 'Unexpected deployment manifest schema');
assert(manifest.changeSetId === changeSetId, 'Manifest change-set mismatch');
assert(manifest.state === 'executed-verified', 'Manifest must be executed-verified');
assert(manifest.approval?.granted === true, 'Manifest approval missing');
assert(manifest.approval?.exactInstruction === exactApproval, 'Manifest approval text mismatch');
assert(manifest.execution?.themePublishApiAttempted === true, 'Theme publish API attempt must be recorded');
assert(manifest.execution?.themePublishApiExecuted === false, 'Blocked API theme publication must not be claimed');
assert(manifest.execution?.themePublishBlockedByHostPolicy === true, 'Theme publish host block missing');
assert(manifest.execution?.themePublishedByOwner === true, 'Owner theme publication must be recorded');
assert(manifest.execution?.staleCandidatePublicationProhibited === true, 'Stale candidate must remain prohibited');
assert(manifest.execution?.productTemplateAssignmentSchemaValidation === 'passed', 'Product assignment schema validation missing');
assert(manifest.execution?.productTemplateAssignmentAttempted === true, 'Product assignment attempt missing');
assert(manifest.execution?.productTemplateAssignmentExecuted === true, 'Product assignment execution missing');
assert(manifest.execution?.productTemplateAssignmentUserErrors === 0, 'Product assignment must have zero user errors');
assert(manifest.execution?.assignedTemplateSuffix === templateSuffix, 'Assigned suffix mismatch');
assert(manifest.execution?.productUpdatedAtAfterAssignment === '2026-07-21T03:16:38Z', 'Manifest product timestamp mismatch');
assert(manifest.execution?.descriptionHtmlFallbackAttempted === false, 'DescriptionHtml fallback must remain unused');
assert(manifest.execution?.postDeploymentVerification === 'passed-shopify-server', 'Shopify server verification missing');
assert(manifest.execution?.publicDocumentFetch === 'cache-inconclusive', 'Public cache caveat must remain explicit');
assert(manifest.production?.mainThemeGid === mainThemeId, 'Manifest MAIN theme mismatch');
assert(manifest.production?.mainThemeRole === 'MAIN', 'Manifest MAIN role mismatch');
assert(manifest.production?.mainThemeProcessingFailed === false, 'MAIN theme processing must not fail');
assert(manifest.production?.productTemplateSuffix === templateSuffix, 'Manifest production suffix mismatch');
assert(manifest.rollback?.formerMainThemeGid === rollbackThemeId, 'Manifest rollback theme mismatch');

// Historical checkpoint and staging records remain immutable evidence.
assert(checkpoint.schemaVersion === '1.1.0', 'Unexpected checkpoint schema');
assert(checkpoint.state === 'approved-preflight-passed-theme-publish-blocked-manual-action-required', 'Historical checkpoint state changed');
assert(checkpoint.authorization?.exactInstruction === exactApproval, 'Historical checkpoint approval mismatch');
assert(checkpoint.themes?.candidate?.id === mainThemeId, 'Historical checkpoint candidate mismatch');
assert(checkpoint.themes?.candidate?.role === 'UNPUBLISHED', 'Historical checkpoint must preserve pre-publication role');
assert(checkpoint.execution?.productTemplateAssignmentExecuted === false, 'Historical checkpoint must preserve pre-assignment state');
assert(checkpoint.productionState?.productTemplateSuffixChanged === false, 'Historical checkpoint must preserve pre-assignment product state');
assert(staging.schemaVersion === '1.0.0', 'Unexpected staging record schema');
assert(staging.sourceChangeSetId === changeSetId, 'Staging record change-set mismatch');
assert(staging.themes?.staging?.id === historicalThemeId, 'Historical staging theme mismatch');
assert(staging.themes?.staging?.role === 'UNPUBLISHED', 'Historical staging role mismatch');
assert(localQa.overallPass === true, 'Supplemental local-browser QA must pass');
assert(localQa.livePreviewAcceptance === 'pending', 'Historical local-browser evidence must not impersonate live acceptance');
assert(localQa.productionMutationOccurred === false, 'Historical local-browser QA must not claim a production mutation');

// Immutable production execution evidence.
assert(execution.schemaVersion === '1.0.0', 'Unexpected execution schema');
assert(execution.recordId === 'shopify-canonical-service-production-execution-20260720', 'Execution record ID mismatch');
assert(execution.changeSetId === changeSetId, 'Execution change-set mismatch');
assert(execution.state === 'executed-verified', 'Execution must be executed-verified');
assert(execution.authorization?.granted === true, 'Execution authorization missing');
assert(execution.authorization?.exactInstruction === exactApproval, 'Execution approval mismatch');
assert(execution.themePublication?.method === 'manual-shopify-admin-owner-action', 'Theme publication method mismatch');
assert(execution.themePublication?.apiPublicationBlocked === true, 'API publication block missing');
assert(execution.themePublication?.mainTheme?.id === mainThemeId, 'Execution MAIN theme mismatch');
assert(execution.themePublication?.mainTheme?.role === 'MAIN', 'Execution MAIN role mismatch');
assert(execution.themePublication?.mainTheme?.processing === false, 'Execution MAIN theme must finish processing');
assert(execution.themePublication?.mainTheme?.processingFailed === false, 'Execution MAIN theme processing failed');
assert(execution.themePublication?.rollbackTheme?.id === rollbackThemeId, 'Execution rollback theme mismatch');
assert(execution.themePublication?.rollbackTheme?.role === 'UNPUBLISHED', 'Execution rollback theme role mismatch');
assert(execution.themeFiles?.length === expectedFiles.size, 'Execution must record exactly four theme files');
for (const file of execution.themeFiles || []) {
  const expected = expectedFiles.get(file.filename);
  assert(Boolean(expected), `Unexpected execution file ${file.filename}`);
  if (!expected) continue;
  assert(file.contentType === expected[0], `${file.filename} content type mismatch`);
  assert(file.checksumMd5 === expected[1], `${file.filename} checksum mismatch`);
  assert(file.size === expected[2], `${file.filename} size mismatch`);
}
const normalizedTemplate = execution.themeFiles?.find((file) => file.filename === 'templates/product.mmg-professional-cover-design.json');
assert(normalizedTemplate?.semanticVerification?.includes('mmg-professional-cover-design'), 'Normalized template semantic verification missing');
assert(execution.productMutation?.operation === 'MMGAssignCanonicalServiceProductTemplate', 'Product mutation operation mismatch');
assert(execution.productMutation?.schemaValidation === 'passed', 'Product mutation schema validation missing');
assert(execution.productMutation?.executed === true, 'Product mutation execution missing');
assert(Array.isArray(execution.productMutation?.userErrors) && execution.productMutation.userErrors.length === 0, 'Product mutation must have zero user errors');
assert(execution.productMutation?.productId === productId, 'Product mutation target mismatch');
assert(execution.productMutation?.templateSuffixBefore === null, 'Product mutation prior suffix mismatch');
assert(execution.productMutation?.templateSuffixAfter === templateSuffix, 'Product mutation final suffix mismatch');
assert(execution.productMutation?.updatedAt === '2026-07-21T03:16:38Z', 'Product mutation timestamp mismatch');
assert(execution.productMutation?.descriptionHtmlChanged === false, 'DescriptionHtml must remain unchanged');
assert(execution.productVerification?.templateSuffix === templateSuffix, 'Verified template suffix mismatch');
assert(execution.productVerification?.variants?.length === expectedVariants.size, 'Execution must verify three variants');
for (const variant of execution.productVerification?.variants || []) {
  const expected = expectedVariants.get(variant.name);
  assert(Boolean(expected), `Unexpected verified variant ${variant.name}`);
  if (!expected) continue;
  assert(variant.id === expected.id, `${variant.name} verified ID mismatch`);
  assert(variant.inventoryItemId === expected.inventoryItemId, `${variant.name} verified inventory item mismatch`);
  assert(variant.sku === expected.sku, `${variant.name} verified SKU mismatch`);
  assert(variant.price === expected.price, `${variant.name} verified price mismatch`);
  assert(variant.availableForSale === true, `${variant.name} must remain available`);
  assert(variant.tracked === false, `${variant.name} tracking changed`);
  assert(variant.requiresShipping === false, `${variant.name} shipping changed`);
  assert(variant.requiresComponents === false, `${variant.name} bundle requirements changed`);
}
assert(execution.routeVerification?.pages?.length === 2, 'Execution must verify two customer pages');
assert(execution.routeVerification?.pages?.every((page) => page.published === true), 'Customer pages must remain published');
assert(execution.routeVerification?.temporaryRedirects?.length === 4, 'Execution must verify four service redirects');
assert(execution.routeVerification?.temporaryRedirects?.every((redirect) => redirect.target === '/collections/all'), 'Service redirects must remain temporary collection fallbacks');
assert(execution.verification?.shopifyServerReadback === 'passed', 'Shopify server readback missing');
assert(execution.verification?.productCommercialFieldsUnchanged === true, 'Commercial-field preservation missing');
assert(execution.verification?.themeChecksumsPassed === true, 'Theme checksum verification missing');
assert(execution.verification?.rollbackThemeRetained === true, 'Rollback theme retention missing');
assert(execution.verification?.publicDocumentFetch?.result === 'cache-inconclusive', 'Public cache caveat missing');
for (const field of [
  'descriptionHtmlChanged', 'titleChanged', 'handleChanged', 'statusChanged',
  'productTypeChanged', 'priceChanged', 'skuChanged', 'inventoryChanged',
  'shippingChanged', 'mediaChanged', 'publicationChanged', 'redirectChanged'
]) {
  assert(execution.productionChanges?.[field] === false, `Unexpected production change: ${field}`);
}
assert(execution.productionChanges?.themePublishedByOwner === true, 'Owner theme publication missing');
assert(execution.productionChanges?.productTemplateSuffixChanged === true, 'Product suffix change missing');
assert(execution.rollback?.productAction?.includes('templateSuffix to null'), 'Product rollback instruction missing');
assert(execution.rollback?.themeAction?.includes(rollbackThemeId), 'Theme rollback instruction missing');
assert(execution.rollback?.verificationRequired === true, 'Rollback verification must remain required');

if (errors.length) fail();
console.log('Canonical service product valid: production theme MAIN, product template assigned, commercial fields preserved, rollback retained, execution verified.');

function fail() {
  console.error('Canonical service product validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
