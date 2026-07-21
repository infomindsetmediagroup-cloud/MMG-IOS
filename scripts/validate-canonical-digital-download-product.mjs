#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'shopify/products/ai-image-mastery');
const required = [
  'README.md',
  'contract.json',
  'live-baseline.md',
  'qa.md',
  'deployment.md',
  'deployment-manifest.json',
  'production-checkpoint-2026-07-20.json',
  'production-checkpoint-2026-07-20.md',
  'staging-record-2026-07-20.json',
  'staging-record-2026-07-20.md',
  'publication-checkpoint-2026-07-20.json',
  'publication-checkpoint-2026-07-20.md',
  'local-browser-qa-2026-07-20.json',
  'local-browser-qa-2026-07-20.md',
  'graphql/preflight.graphql',
  'source/section.html',
  'source/styles.css',
  'source/behavior.js',
  'theme/sections/mmg-ai-image-mastery.liquid',
  'theme/assets/mmg-ai-image-mastery.css',
  'theme/assets/mmg-ai-image-mastery.js',
  'theme/templates/product.mmg-ai-image-mastery.json'
];

const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
for (const file of required) assert(existsSync(resolve(root, file)), `Missing ${file}`);
if (errors.length) fail();

const read = (file) => readFileSync(resolve(root, file), 'utf8');
const readJson = (file) => JSON.parse(read(file));
const md5 = (file) => createHash('md5').update(readFileSync(resolve(root, file))).digest('hex');
const contract = readJson('contract.json');
const manifest = readJson('deployment-manifest.json');
const checkpoint = readJson('production-checkpoint-2026-07-20.json');
const staging = readJson('staging-record-2026-07-20.json');
const publication = readJson('publication-checkpoint-2026-07-20.json');
const localQa = readJson('local-browser-qa-2026-07-20.json');
const html = read('source/section.html');
const css = read('source/styles.css');
const js = read('source/behavior.js');
const liquid = read('theme/sections/mmg-ai-image-mastery.liquid');
const template = readJson('theme/templates/product.mmg-ai-image-mastery.json');
const gql = read('graphql/preflight.graphql');

const changeSetId = 'shopify-canonical-digital-download-ai-image-mastery-20260721';
const exactApproval = `Approve production deployment: ${changeSetId}`;
const productId = 'gid://shopify/Product/9022950998170';
const variantId = 'gid://shopify/ProductVariant/48655433498778';
const inventoryItemId = 'gid://shopify/InventoryItem/50671454027930';
const productionThemeId = 'gid://shopify/OnlineStoreTheme/155338309786';
const formerMainThemeId = 'gid://shopify/OnlineStoreTheme/155336671386';

assert(contract.schemaVersion === '1.1.0', 'Unexpected contract schema');
assert(contract.state === 'theme-published-product-assignment-pending-explicit-approval', 'Contract state mismatch');
assert(contract.product?.id === productId, 'Product GID mismatch');
assert(contract.product?.handle === 'ai-image-mastery', 'Product handle mismatch');
assert(contract.product?.productType === 'Digital Download', 'Product type mismatch');
assert(contract.product?.templateSuffix === null, 'Product template must remain unassigned');
assert(contract.product?.updatedAt === '2026-07-21T00:26:43Z', 'Product timestamp mismatch');
assert(contract.product?.tracksInventory === false, 'Inventory tracking must remain disabled');
assert(contract.product?.requiresShipping === false, 'Shipping must remain disabled');
assert(contract.variant?.id === variantId, 'Variant GID mismatch');
assert(contract.variant?.legacyResourceId === '48655433498778', 'Legacy variant ID mismatch');
assert(contract.variant?.inventoryItemId === inventoryItemId, 'Inventory item GID mismatch');
assert(contract.variant?.price === '9.95', 'Price mismatch');
assert(contract.variant?.sku === 'MMG-DIG-AIM-STD', 'SKU mismatch');
assert(contract.variant?.inventoryPolicy === 'DENY', 'Inventory policy mismatch');
assert(contract.variant?.availableForSale === true, 'Variant must remain available');
assert(contract.variant?.tracked === false, 'Variant tracking must remain disabled');
assert(contract.variant?.requiresShipping === false, 'Variant shipping must remain disabled');
assert(contract.media?.length === 1, 'Expected one authoritative media item');
assert(contract.media?.[0]?.width === 1800 && contract.media?.[0]?.height === 2700, 'Featured portrait dimensions mismatch');
assert(contract.delivery?.portalRequired === false, 'Digital download must not require service intake');
assert(contract.delivery?.physicalShipment === false, 'Digital download cannot require shipment');
assert(contract.controls?.cartMutationRequiresCustomerClick === true, 'Cart write must require customer click');
assert(contract.controls?.exactApprovalInstruction === exactApproval, 'Exact approval instruction mismatch');
assert(contract.productionTheme?.id === productionThemeId, 'Production theme mismatch');
assert(contract.productionTheme?.role === 'MAIN', 'Digital-download theme must be MAIN');
assert(contract.rollbackThemes?.formerMain?.id === formerMainThemeId, 'Former MAIN rollback mismatch');
assert(contract.rollbackThemes?.formerMain?.role === 'UNPUBLISHED', 'Former MAIN must remain unpublished');

assert((html.match(/<h1\b/g) || []).length === 1, 'Source must have exactly one H1');
assert((liquid.match(/<h1\b/g) || []).length === 1, 'Liquid must have exactly one H1');
for (const id of ['objectives','included','system','outcomes','purchase','delivery','terms','support','next']) {
  assert(html.includes(`id="${id}"`), `Missing source section ${id}`);
  assert(liquid.includes(`id="${id}"`), `Missing Liquid section ${id}`);
}
assert(css.includes('#mmg-ai-image-mastery'), 'CSS root scope missing');
assert(css.includes('object-fit: contain'), 'Portrait containment missing');
assert(css.includes('prefers-reduced-motion'), 'Reduced-motion CSS missing');
assert(css.includes(':focus-visible'), 'Focus-visible CSS missing');
assert(!css.includes('100vw'), '100vw is prohibited');
assert(js.includes('/cart/add.js'), 'Cart endpoint missing');
assert(js.includes("addEventListener('click'"), 'Customer click binding missing');
assert(js.includes('/products/${encodeURIComponent(handle)}.js'), 'Live product endpoint missing');
assert(js.includes("credentials: 'same-origin'"), 'Same-origin credentials missing');
assert(!/productUpdate|graphql_mutation|admin\/api|access[_-]?token|client[_-]?secret/i.test(js), 'Client source contains prohibited Admin API or secret pattern');
assert(template.sections?.main?.type === 'mmg-ai-image-mastery', 'Template section type mismatch');
assert(JSON.stringify(template.order) === JSON.stringify(['main']), 'Template order mismatch');

assert(manifest.schemaVersion === '1.1.0', 'Unexpected manifest schema');
assert(manifest.changeSetId === changeSetId, 'Manifest change-set mismatch');
assert(manifest.state === 'theme-published-product-assignment-pending-explicit-approval', 'Manifest state mismatch');
assert(manifest.productGid === productId, 'Manifest product mismatch');
assert(manifest.templateSuffix === 'mmg-ai-image-mastery', 'Manifest template suffix mismatch');
assert(manifest.approval?.granted === false, 'Product assignment approval must remain ungranted');
assert(manifest.approval?.exactInstructionRequired === exactApproval, 'Manifest approval phrase mismatch');
assert(manifest.execution?.themePublishExecuted === true, 'Theme publication must be recorded');
assert(manifest.execution?.themePublishedByAssistant === false, 'Theme publication must not be attributed to assistant');
assert(manifest.execution?.productTemplateAssignmentAttempted === false, 'Product assignment must remain unattempted');
assert(manifest.execution?.productTemplateAssignmentExecuted === false, 'Product assignment must remain unexecuted');
assert(manifest.execution?.productionProductMutationOccurred === false, 'Production product mutation must remain false');
assert(manifest.productionTheme?.id === productionThemeId, 'Manifest production theme mismatch');
assert(manifest.productionTheme?.role === 'MAIN', 'Manifest production theme role mismatch');
assert(manifest.formerMainTheme?.id === formerMainThemeId, 'Manifest former MAIN mismatch');
assert(manifest.formerMainTheme?.role === 'UNPUBLISHED', 'Manifest former MAIN role mismatch');
assert(manifest.productContract?.variantId === variantId, 'Manifest variant mismatch');
assert(manifest.productContract?.inventoryItemId === inventoryItemId, 'Manifest inventory item mismatch');
assert(manifest.productContract?.inventoryPolicy === 'DENY', 'Manifest inventory policy mismatch');
for (const protectedField of ['price','sku','inventory-policy','description-html']) {
  assert(manifest.prohibitedChanges?.includes(protectedField), `${protectedField} must be protected`);
}

assert(checkpoint.state === 'theme-published-product-unassigned', 'Checkpoint state mismatch');
assert(checkpoint.product?.templateSuffix === null, 'Checkpoint template suffix mismatch');
assert(checkpoint.product?.updatedAt === '2026-07-21T00:26:43Z', 'Checkpoint product timestamp mismatch');
assert(checkpoint.variant?.id === variantId, 'Checkpoint variant mismatch');
assert(checkpoint.variant?.inventoryPolicy === 'DENY', 'Checkpoint inventory policy mismatch');
assert(checkpoint.variant?.inventoryItem?.id === inventoryItemId, 'Checkpoint inventory item mismatch');
assert(checkpoint.variant?.inventoryItem?.sku === 'MMG-DIG-AIM-STD', 'Checkpoint SKU mismatch');
assert(checkpoint.productionState?.themePublished === true, 'Checkpoint theme publication missing');
assert(checkpoint.productionState?.productMutationOccurred === false, 'Checkpoint product mutation mismatch');

assert(staging.historicalRecord === true, 'Staging record must be historical');
assert(staging.state === 'historical-staged-theme-and-server-verified-before-publication', 'Historical staging state mismatch');
assert(staging.candidateTheme?.id === productionThemeId, 'Historical staging theme mismatch');
assert(staging.candidateTheme?.role === 'UNPUBLISHED', 'Historical staging role mismatch');
assert(staging.productionMutationOccurred === false, 'Historical staging must not mutate product');

assert(publication.state === 'theme-main-files-verified-product-template-unassigned', 'Publication checkpoint state mismatch');
assert(publication.mainTheme?.id === productionThemeId, 'Publication MAIN mismatch');
assert(publication.mainTheme?.role === 'MAIN', 'Publication MAIN role mismatch');
assert(publication.formerMainTheme?.id === formerMainThemeId, 'Publication former MAIN mismatch');
assert(publication.formerMainTheme?.role === 'UNPUBLISHED', 'Publication former MAIN role mismatch');
assert(publication.product?.templateSuffix === null, 'Publication product suffix mismatch');
assert(publication.variant?.id === variantId, 'Publication variant mismatch');
assert(publication.productAssignment?.approvalGranted === false, 'Publication assignment approval mismatch');
assert(publication.productAssignment?.attempted === false, 'Publication assignment attempt mismatch');
assert(publication.verification?.allDigitalDownloadFilesMatch === true, 'Publication file verification missing');
assert(publication.verification?.allCanonicalServiceFilesPreserved === true, 'Canonical service preservation missing');

const expectedFiles = new Map([
  ['theme/assets/mmg-ai-image-mastery.css', ['5a749b91c5078360f9a64d642ef268be', 10471]],
  ['theme/assets/mmg-ai-image-mastery.js', ['2653b8a8d87c8f5852f653b7580c405d', 5665]],
  ['theme/sections/mmg-ai-image-mastery.liquid', ['52893c2bc11789b613424ec296d838d0', 14700]],
  ['theme/templates/product.mmg-ai-image-mastery.json', ['f767d9a33d9c4afb1ebee3c899e58768', 132]]
]);
for (const [path, [checksum, size]] of expectedFiles) {
  assert(md5(path) === checksum, `${path} checksum mismatch`);
  assert(statSync(resolve(root, path)).size === size, `${path} size mismatch`);
}
assert(read('source/styles.css') === read('theme/assets/mmg-ai-image-mastery.css'), 'Source/theme CSS drift');
assert(read('source/behavior.js') === read('theme/assets/mmg-ai-image-mastery.js'), 'Source/theme JavaScript drift');

assert(localQa.overallPass === true, 'Local browser QA must pass');
assert(localQa.productionMutationOccurred === false, 'Local browser QA must not mutate production');
for (const width of ['320','375','768','1024','1440']) {
  const viewport = localQa.viewports?.[width];
  assert(Boolean(viewport), `Missing viewport ${width}`);
  if (!viewport) continue;
  assert(viewport.innerWidth === Number(width), `Viewport ${width} width mismatch`);
  assert(viewport.documentScrollWidth === Number(width), `Viewport ${width} document overflow`);
  assert(viewport.bodyScrollWidth === Number(width), `Viewport ${width} body overflow`);
  assert(viewport.rootScrollWidth === Number(width), `Viewport ${width} root overflow`);
  assert(viewport.overflow === false, `Viewport ${width} overflow`);
  assert(viewport.h1Count === 1, `Viewport ${width} H1 mismatch`);
  assert(viewport.objectFit === 'contain', `Viewport ${width} image containment mismatch`);
  assert(viewport.enabledButtons === 1, `Viewport ${width} purchase control mismatch`);
  assert(viewport.hiddenRevealCount === 0, `Viewport ${width} reveal fail-safe mismatch`);
  assert(viewport.price === '$9.95', `Viewport ${width} price mismatch`);
}
assert(localQa.functional?.cartRequests?.[0]?.id === 48655433498778, 'Cart variant ID mismatch');
assert(localQa.functional?.cartRequests?.[0]?.quantity === 1, 'Cart quantity mismatch');
assert(localQa.functional?.focusVisible?.outlineWidth === '3px', 'Focus outline mismatch');
assert(localQa.functional?.reducedMotion?.opacity === '1', 'Reduced-motion opacity mismatch');
assert(localQa.functional?.reducedMotion?.transform === 'none', 'Reduced-motion transform mismatch');

assert(gql.includes('query MMGAIImageMasteryProductionPreflight'), 'Stored preflight query missing');
for (const field of ['updatedAt','variants','inventoryItem','media','requiresSellingPlan','templateSuffix']) {
  assert(gql.includes(field), `Stored preflight missing ${field}`);
}

if (errors.length) fail();
console.log('Canonical AI Image Mastery digital-download contract is valid.');

function fail() {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
