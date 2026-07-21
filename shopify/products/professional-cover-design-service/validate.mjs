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
const html = readFileSync(resolve(root, 'source/section.html'), 'utf8');
const css = readFileSync(resolve(root, 'source/styles.css'), 'utf8');
const js = readFileSync(resolve(root, 'source/behavior.js'), 'utf8');
const gql = readFileSync(resolve(root, 'graphql/preflight.graphql'), 'utf8');

const changeSetId = 'shopify-canonical-service-product-source-20260721';
const productId = 'gid://shopify/Product/9024288620698';
const historicalStagingThemeId = 'gid://shopify/OnlineStoreTheme/155335557274';
const productionCandidateThemeId = 'gid://shopify/OnlineStoreTheme/155336671386';
const formerMainThemeId = 'gid://shopify/OnlineStoreTheme/155242856602';
const templateSuffix = 'mmg-professional-cover-design';
const exactApproval = `Approve production deployment: ${changeSetId}`;

assert(contract.state === 'candidate-not-deployed', 'Source contract must remain candidate-not-deployed until the product template is assigned');
assert(contract.product?.id === productId, 'Product GID mismatch');
assert(contract.product?.handle === 'professional-cover-design-service', 'Product handle mismatch');
assert(contract.product?.productType === 'Publishing Service', 'Product type mismatch');
assert(contract.product?.status === 'ACTIVE', 'Product must remain active');
assert(contract.product?.tracksInventory === false, 'Inventory tracking must remain disabled');
assert(contract.product?.requiresShipping === false, 'Shipping must remain disabled');
assert(contract.product?.requiresSellingPlan === false, 'Selling plan must remain optional');

const expectedVariants = new Map([
  ['Starter', ['gid://shopify/ProductVariant/48658205376666', 'MMG-SVC-PCD-STA', '97.95']],
  ['Growth', ['gid://shopify/ProductVariant/48658205409434', 'MMG-SVC-PCD-GRO', '197.95']],
  ['Professional', ['gid://shopify/ProductVariant/48658205442202', 'MMG-SVC-PCD-PRO', '397.95']]
]);
assert(contract.variants?.length === 3, 'Exactly three service tiers are required');
for (const variant of contract.variants || []) {
  const expected = expectedVariants.get(variant.name);
  assert(Boolean(expected), `Unexpected tier ${variant.name}`);
  if (!expected) continue;
  assert(variant.id === expected[0], `${variant.name} variant GID mismatch`);
  assert(variant.sku === expected[1], `${variant.name} SKU mismatch`);
  assert(variant.price === expected[2], `${variant.name} price mismatch`);
  assert(variant.tracked === false, `${variant.name} tracking must remain disabled`);
  assert(variant.requiresShipping === false, `${variant.name} shipping must remain disabled`);
}

assert((html.match(/<h1\b/g) || []).length === 1, 'Candidate must have exactly one H1');
for (const id of ['objectives', 'deliverables', 'packages', 'delivery', 'process', 'progress', 'scope', 'next']) {
  assert(html.includes(`id="${id}"`), `Missing candidate section ${id}`);
}
for (const tier of expectedVariants.keys()) {
  assert(html.includes(`data-mmg-tier="${tier}"`), `Missing ${tier} tier card`);
  assert(html.includes(`data-mmg-add="${tier}"`), `Missing ${tier} cart control`);
}
for (const route of contract.reservedRoutes || []) assert(html.includes(`href="${route}"`), `Missing reserved route ${route}`);
assert(html.includes('/pages/customer-portal'), 'Customer Portal route missing');
assert(html.includes('/pages/customer-service'), 'Customer service route missing');
assert(css.includes('#mmg-professional-cover-design'), 'CSS must remain root-scoped');
assert(css.includes('object-fit: contain'), 'Portrait imagery must remain contained');
assert(css.includes('prefers-reduced-motion'), 'Reduced-motion CSS is required');
assert(!css.includes('100vw'), '100vw is prohibited');
assert(js.includes('/cart/add.js'), 'Customer-initiated cart endpoint missing');
assert(js.includes("addEventListener('click'"), 'Cart write must be bound to a customer click');
assert(js.includes(`/products/${'${encodeURIComponent(handle)}'}.js`), 'Live product hydration endpoint missing');
assert(js.includes("credentials: 'same-origin'"), 'Same-origin credentials are required');
assert(!/productUpdate|graphql_mutation|admin\/api|access[_-]?token|client[_-]?secret/i.test(js), 'Client source contains prohibited Admin API or secret patterns');
assert(gql.includes('query MMGCanonicalServiceProductPreflight'), 'Stored preflight operation missing');
for (const field of ['updatedAt', 'variants', 'inventoryItem', 'media', 'requiresSellingPlan']) assert(gql.includes(field), `Stored preflight missing ${field}`);

assert(manifest.schemaVersion === '1.2.0', 'Unexpected deployment manifest schema');
assert(manifest.changeSetId === changeSetId, 'Manifest change-set ID mismatch');
assert(manifest.state === 'approved-preflight-passed-theme-publish-blocked-manual-action-required', 'Manifest must disclose the manual publication boundary');
assert(manifest.selectedDeployment === 'publish-verified-current-main-clone-then-assign-product-template', 'Selected deployment architecture mismatch');
assert(manifest.preflight?.captureDescriptionHtmlForRollback === true, 'Rollback source capture is required');
assert(manifest.preflight?.latestProductionPreflightPassed === true, 'Fresh production preflight must pass');
assert(manifest.preflight?.latestProductUpdatedAt === '2026-07-21T00:56:35Z', 'Production preflight timestamp mismatch');
assert(manifest.preflight?.currentMainThemeUpdatedAt === '2026-07-21T02:03:16Z', 'Current MAIN timestamp mismatch');
assert(manifest.preflight?.freshCandidateVerifiedAt === '2026-07-21T02:24:03Z', 'Fresh candidate verification timestamp mismatch');
assert(manifest.approval?.granted === true, 'Production approval must be recorded');
assert(manifest.approval?.mustNameChangeSetId === true, 'Approval must name the change set');
assert(manifest.approval?.exactInstruction === exactApproval, 'Exact production approval mismatch');
assert(manifest.execution?.themePublishSchemaValidation === 'passed', 'Theme publish schema validation missing');
assert(manifest.execution?.themePublishAttempted === true, 'Theme publication attempt must be recorded');
assert(manifest.execution?.themePublishExecuted === false, 'Theme publication must remain unexecuted until manual publication');
assert(manifest.execution?.themePublishBlockedByHostPolicy === true, 'Host theme-publication block must be recorded');
assert(manifest.execution?.manualThemePublicationRequired === true, 'Manual theme publication must be required');
assert(manifest.execution?.currentMainDriftDetectedAfterOriginalClone === true, 'MAIN-theme drift detection must be recorded');
assert(manifest.execution?.staleCandidateSuperseded === true, 'Stale candidate supersession must be recorded');
assert(manifest.execution?.staleCandidatePublicationProhibited === true, 'Stale candidate publication must be prohibited');
assert(manifest.execution?.freshCandidateDuplicatedFromCurrentMain === true, 'Fresh candidate must be cloned from current MAIN');
assert(manifest.execution?.freshCandidateFilesInstalled === true, 'Fresh candidate file installation missing');
assert(manifest.execution?.freshCandidateFilesVerified === true, 'Fresh candidate file verification missing');
assert(manifest.execution?.productTemplateAssignmentSchemaValidation === 'passed', 'Product template assignment schema validation missing');
assert(manifest.execution?.productTemplateAssignmentAttempted === false, 'Product assignment must not run before theme publication');
assert(manifest.execution?.productTemplateAssignmentExecuted === false, 'Product assignment must remain unexecuted');
assert(manifest.execution?.descriptionHtmlFallbackAttempted === false, 'Silent descriptionHtml fallback is prohibited');
assert(manifest.supersededCandidate?.themeGid === historicalStagingThemeId, 'Superseded candidate GID mismatch');
assert(manifest.supersededCandidate?.prefix === '/t/16', 'Superseded candidate prefix mismatch');
assert(manifest.supersededCandidate?.publishPermitted === false, 'Superseded candidate must not be publishable');
assert(manifest.manualBoundary?.publishThemeName === 'MMG Service Production Candidate 2026-07-20', 'Manual publication theme name mismatch');
assert(manifest.manualBoundary?.publishThemeGid === productionCandidateThemeId, 'Manual publication theme GID mismatch');
assert(manifest.manualBoundary?.publishThemePrefix === '/t/17', 'Manual publication theme prefix mismatch');
assert(manifest.manualBoundary?.postPublicationTemplateSuffix === templateSuffix, 'Post-publication template suffix mismatch');
assert(manifest.rollback?.formerMainThemeGid === formerMainThemeId, 'Former MAIN rollback theme mismatch');
assert(manifest.prohibitedChanges?.includes('price'), 'Price changes must remain prohibited');
assert(manifest.prohibitedChanges?.includes('sku'), 'SKU changes must remain prohibited');

assert(staging.schemaVersion === '1.0.0', 'Unexpected historical staging record schema');
assert(staging.sourceChangeSetId === changeSetId, 'Historical staging record change-set mismatch');
assert(staging.state === 'staged-static-and-server-verified-render-qa-pending', 'Historical staging state mismatch');
assert(staging.themes?.main?.id === formerMainThemeId, 'Historical MAIN theme mismatch');
assert(staging.themes?.staging?.id === historicalStagingThemeId, 'Historical staging theme mismatch');
assert(staging.themes?.staging?.role === 'UNPUBLISHED', 'Historical staging theme must remain unpublished');
assert(staging.preview?.templateSuffix === templateSuffix, 'Historical staging preview suffix mismatch');
assert(staging.preflight?.reconciledUpdatedAt === '2026-07-21T00:56:35Z', 'Reconciled product timestamp mismatch');
assert(staging.productVerification?.templateSuffix === null, 'Production product must remain unassigned at checkpoint time');
assert(staging.productVerification?.descriptionHtmlStillLegacySource === true, 'Legacy descriptionHtml must remain the rollback source');

const historicalExpectedFiles = new Map([
  ['assets/mmg-professional-cover-design.css', ['text/css', '19a0676ec927c3e649db64a6e11a9c98', 11943]],
  ['assets/mmg-professional-cover-design.js', ['application/javascript', 'db464655bddaf9a73906e49df8762a66', 6549]],
  ['sections/mmg-professional-cover-design.liquid', ['application/x-liquid', 'f5090c30a9e202c056cf8c3a40b690ff', 13480]],
  ['templates/product.mmg-professional-cover-design.json', ['application/json', 'd8804eeb80b0f2aa7a1eb1c373841b21', 140]]
]);
assert(staging.stagedFiles?.length === historicalExpectedFiles.size, 'Historical staging record must contain exactly four files');
for (const file of staging.stagedFiles || []) {
  const expected = historicalExpectedFiles.get(file.filename);
  assert(Boolean(expected), `Unexpected historical staged file ${file.filename}`);
  if (!expected) continue;
  assert(file.contentType === expected[0], `${file.filename} historical content type mismatch`);
  assert(file.checksumMd5 === expected[1], `${file.filename} historical checksum mismatch`);
  assert(file.size === expected[2], `${file.filename} historical size mismatch`);
}

assert(localQa.sourceChangeSetId === changeSetId, 'Local-browser QA change-set mismatch');
assert(localQa.stagingThemeId === historicalStagingThemeId, 'Local-browser QA historical theme mismatch');
assert(localQa.evidenceClassification === 'supplemental-local-browser-evidence-not-live-preview-acceptance', 'Local-browser evidence classification mismatch');
assert(localQa.livePreviewAcceptance === 'pending', 'Local-browser QA must not impersonate authenticated preview acceptance');
assert(localQa.overallPass === true, 'Local-browser QA must pass');
assert(localQa.productionMutationOccurred === false, 'Local-browser QA must not mutate production');
for (const width of ['320', '375', '768', '1024', '1440']) {
  const viewport = localQa.viewports?.[width];
  assert(Boolean(viewport), `Missing local-browser viewport ${width}`);
  if (!viewport) continue;
  assert(viewport.innerWidth === Number(width), `Viewport ${width} width mismatch`);
  assert(viewport.documentScrollWidth === Number(width), `Viewport ${width} document overflow`);
  assert(viewport.bodyScrollWidth === Number(width), `Viewport ${width} body overflow`);
  assert(viewport.rootScrollWidth === Number(width), `Viewport ${width} root overflow`);
  assert(viewport.overflow === false, `Viewport ${width} must not overflow`);
  assert(viewport.h1Count === 1, `Viewport ${width} must have one H1`);
  assert(viewport.objectFit === 'contain', `Viewport ${width} image containment mismatch`);
  assert(viewport.enabledButtons === 3, `Viewport ${width} must hydrate three tiers`);
  assert(viewport.hiddenRevealCount === 0, `Viewport ${width} reveal fail-safe failed`);
}
assert(localQa.functional?.cartRequest?.id === 48658205409434, 'Local cart QA must use Growth variant ID');
assert(localQa.functional?.cartRequest?.quantity === 1, 'Local cart QA quantity must remain one');
assert(localQa.functional?.focusVisible?.outlineWidth === '3px', 'Focus-visible outline mismatch');
assert(localQa.functional?.reducedMotion?.opacity === '1', 'Reduced-motion content must remain visible');
assert(localQa.functional?.reducedMotion?.transform === 'none', 'Reduced-motion transform dependency detected');

assert(checkpoint.schemaVersion === '1.1.0', 'Unexpected production checkpoint schema');
assert(checkpoint.recordId === 'shopify-canonical-service-production-checkpoint-20260720', 'Production checkpoint ID mismatch');
assert(checkpoint.changeSetId === changeSetId, 'Production checkpoint change-set mismatch');
assert(checkpoint.state === manifest.state, 'Checkpoint and manifest states must match');
assert(checkpoint.authorization?.granted === true, 'Checkpoint must record approval');
assert(checkpoint.authorization?.exactInstruction === exactApproval, 'Checkpoint exact approval mismatch');
assert(checkpoint.authorization?.architecture === manifest.selectedDeployment, 'Checkpoint architecture mismatch');
assert(checkpoint.preflight?.passed === true, 'Production checkpoint preflight must pass');
assert(checkpoint.preflight?.productId === productId, 'Checkpoint product mismatch');
assert(checkpoint.preflight?.productTemplateSuffix === null, 'Checkpoint product must remain unassigned');
assert(checkpoint.preflight?.descriptionHtmlCapturedForRollback === true, 'Checkpoint rollback source capture missing');
assert(checkpoint.themes?.currentMain?.id === formerMainThemeId, 'Checkpoint former MAIN mismatch');
assert(checkpoint.themes?.currentMain?.role === 'MAIN', 'Checkpoint current theme must remain MAIN');
assert(checkpoint.themes?.currentMain?.updatedAt === '2026-07-21T02:03:16Z', 'Checkpoint current MAIN timestamp mismatch');
assert(checkpoint.themes?.currentMain?.candidateFilesPresent === false, 'Current MAIN must not claim candidate files');
assert(checkpoint.themes?.supersededCandidate?.id === historicalStagingThemeId, 'Checkpoint superseded candidate mismatch');
assert(checkpoint.themes?.supersededCandidate?.publishPermitted === false, 'Checkpoint must prohibit stale theme publication');
assert(checkpoint.themes?.candidate?.id === productionCandidateThemeId, 'Checkpoint fresh candidate mismatch');
assert(checkpoint.themes?.candidate?.name === 'MMG Service Production Candidate 2026-07-20', 'Checkpoint fresh candidate name mismatch');
assert(checkpoint.themes?.candidate?.role === 'UNPUBLISHED', 'Checkpoint candidate must remain unpublished');
assert(checkpoint.themes?.candidate?.prefix === '/t/17', 'Checkpoint candidate prefix mismatch');
assert(checkpoint.themes?.candidate?.duplicatedFromThemeId === formerMainThemeId, 'Checkpoint candidate source-theme mismatch');
assert(checkpoint.themes?.candidate?.processing === false, 'Checkpoint candidate must finish processing');
assert(checkpoint.themes?.candidate?.processingFailed === false, 'Checkpoint candidate processing must not fail');
assert(checkpoint.themes?.candidate?.verifiedAt === '2026-07-21T02:24:03Z', 'Checkpoint candidate verification timestamp mismatch');

const productionExpectedFiles = new Map([
  ['assets/mmg-professional-cover-design.css', ['text/css', '19a0676ec927c3e649db64a6e11a9c98', 11943]],
  ['assets/mmg-professional-cover-design.js', ['application/javascript', 'db464655bddaf9a73906e49df8762a66', 6549]],
  ['sections/mmg-professional-cover-design.liquid', ['application/x-liquid', 'f5090c30a9e202c056cf8c3a40b690ff', 13480]],
  ['templates/product.mmg-professional-cover-design.json', ['application/json', '6935d2e46128a36c8d5578ac1e62d50b', 503]]
]);
assert(checkpoint.themes?.candidate?.files?.length === productionExpectedFiles.size, 'Checkpoint must record exactly four fresh candidate files');
for (const file of checkpoint.themes?.candidate?.files || []) {
  const expected = productionExpectedFiles.get(file.filename);
  assert(Boolean(expected), `Unexpected fresh candidate file ${file.filename}`);
  if (!expected) continue;
  assert(file.contentType === expected[0], `${file.filename} fresh content type mismatch`);
  assert(file.checksumMd5 === expected[1], `${file.filename} fresh checksum mismatch`);
  assert(file.size === expected[2], `${file.filename} fresh size mismatch`);
}
const normalizedTemplate = checkpoint.themes?.candidate?.files?.find((file) => file.filename === 'templates/product.mmg-professional-cover-design.json');
assert(typeof normalizedTemplate?.semanticVerification === 'string' && normalizedTemplate.semanticVerification.includes('mmg-professional-cover-design'), 'Normalized template semantic verification missing');
assert(checkpoint.execution?.themePublishSchemaValidation === 'passed', 'Checkpoint theme publish validation missing');
assert(checkpoint.execution?.themePublishAttempted === true, 'Checkpoint must record theme publish attempt');
assert(checkpoint.execution?.themePublishExecuted === false, 'Checkpoint must record blocked theme publication');
assert(checkpoint.execution?.themePublishBlockedByHostPolicy === true, 'Checkpoint host block missing');
assert(checkpoint.execution?.currentMainDriftDetectedAfterOriginalClone === true, 'Checkpoint MAIN drift detection missing');
assert(checkpoint.execution?.staleCandidateSuperseded === true, 'Checkpoint stale candidate supersession missing');
assert(checkpoint.execution?.staleCandidatePublicationProhibited === true, 'Checkpoint stale publication prohibition missing');
assert(checkpoint.execution?.freshCandidateDuplicatedFromCurrentMain === true, 'Checkpoint fresh clone evidence missing');
assert(checkpoint.execution?.freshCandidateFilesInstalled === true, 'Checkpoint fresh file installation missing');
assert(checkpoint.execution?.freshCandidateFilesVerified === true, 'Checkpoint fresh file verification missing');
assert(checkpoint.execution?.productTemplateAssignmentSchemaValidation === 'passed', 'Checkpoint product assignment validation missing');
assert(checkpoint.execution?.productTemplateAssignmentAttempted === false, 'Checkpoint must block premature product assignment');
assert(checkpoint.execution?.fallbackDescriptionHtmlDeploymentAttempted === false, 'Checkpoint must prohibit silent descriptionHtml fallback');
assert(checkpoint.manualBoundary?.required === true, 'Manual publication boundary must remain active');
assert(checkpoint.manualBoundary?.themeId === productionCandidateThemeId, 'Manual publication theme mismatch');
assert(checkpoint.manualBoundary?.themePrefix === '/t/17', 'Manual publication prefix mismatch');
assert(checkpoint.manualBoundary?.prohibitedThemeId === historicalStagingThemeId, 'Prohibited stale theme mismatch');
assert(checkpoint.productionState?.themePublishedByThisExecution === false, 'Execution must not claim theme publication');
assert(checkpoint.productionState?.productTemplateSuffixChanged === false, 'Execution must not claim product assignment');
for (const field of ['descriptionHtmlChanged', 'priceChanged', 'skuChanged', 'inventoryChanged', 'shippingChanged', 'publicationChanged', 'redirectChanged']) {
  assert(checkpoint.productionState?.[field] === false, `Production state ${field} must remain false`);
}

if (errors.length) fail();
console.log('Canonical service product valid: approval recorded, stale clone prohibited, fresh current-MAIN candidate verified, manual publication required, product assignment safely withheld.');

function fail() {
  console.error('Canonical service product validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
