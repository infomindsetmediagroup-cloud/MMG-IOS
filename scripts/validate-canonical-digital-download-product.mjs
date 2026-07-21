#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'shopify/products/ai-image-mastery');
const required = [
  'README.md',
  'contract.json',
  'deployment.md',
  'deployment-manifest.json',
  'production-checkpoint-2026-07-20.json',
  'publication-checkpoint-2026-07-20.json',
  'production-execution-2026-07-20.json',
  'production-execution-2026-07-20.md',
  'local-browser-qa-2026-07-20.json',
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
const json = (file) => JSON.parse(read(file));
const md5 = (file) => createHash('md5').update(readFileSync(resolve(root, file))).digest('hex');

const contract = json('contract.json');
const manifest = json('deployment-manifest.json');
const execution = json('production-execution-2026-07-20.json');
const checkpoint = json('production-checkpoint-2026-07-20.json');
const publication = json('publication-checkpoint-2026-07-20.json');
const localQa = json('local-browser-qa-2026-07-20.json');
const html = read('source/section.html');
const css = read('source/styles.css');
const js = read('source/behavior.js');
const liquid = read('theme/sections/mmg-ai-image-mastery.liquid');
const template = json('theme/templates/product.mmg-ai-image-mastery.json');

const changeSetId = 'shopify-canonical-digital-download-ai-image-mastery-20260721';
const approval = `Approve production deployment: ${changeSetId}`;
const productId = 'gid://shopify/Product/9022950998170';
const variantId = 'gid://shopify/ProductVariant/48655433498778';
const inventoryItemId = 'gid://shopify/InventoryItem/50671454027930';
const themeId = 'gid://shopify/OnlineStoreTheme/155338309786';
const rollbackThemeId = 'gid://shopify/OnlineStoreTheme/155336671386';
const suffix = 'mmg-ai-image-mastery';

assert(contract.schemaVersion === '1.2.0', 'Unexpected contract schema');
assert(contract.state === 'deployed-admin-verified-storefront-edge-propagation-observed', 'Contract state mismatch');
assert(contract.changeSetId === changeSetId, 'Contract change-set mismatch');
assert(contract.approval?.received === true, 'Deployment approval must be recorded');
assert(contract.approval?.instruction === approval, 'Approval phrase mismatch');
assert(contract.product?.id === productId, 'Product GID mismatch');
assert(contract.product?.handle === 'ai-image-mastery', 'Product handle mismatch');
assert(contract.product?.productType === 'Digital Download', 'Product type mismatch');
assert(contract.product?.templateSuffix === suffix, 'Canonical template suffix must be assigned');
assert(contract.product?.updatedAt === '2026-07-21T04:29:15Z', 'Product timestamp mismatch');
assert(contract.product?.tracksInventory === false, 'Inventory tracking must remain disabled');
assert(contract.product?.requiresShipping === false, 'Shipping must remain disabled');
assert(contract.product?.legacyDescriptionHtmlPreservedForRollback === true, 'Legacy rollback source must be preserved');
assert(contract.variant?.id === variantId, 'Variant GID mismatch');
assert(contract.variant?.inventoryItemId === inventoryItemId, 'Inventory item mismatch');
assert(contract.variant?.price === '9.95', 'Price mismatch');
assert(contract.variant?.sku === 'MMG-DIG-AIM-STD', 'SKU mismatch');
assert(contract.variant?.inventoryPolicy === 'DENY', 'Inventory policy mismatch');
assert(contract.variant?.tracked === false, 'Tracking state mismatch');
assert(contract.variant?.requiresShipping === false, 'Variant shipping mismatch');
assert(contract.variant?.availableForSale === true, 'Variant must remain available');
assert(contract.productionTheme?.id === themeId, 'Production theme mismatch');
assert(contract.productionTheme?.role === 'MAIN', 'Production theme must be MAIN');
assert(contract.rollbackThemes?.formerMain?.id === rollbackThemeId, 'Rollback theme mismatch');
assert(contract.rollbackThemes?.formerMain?.role === 'UNPUBLISHED', 'Rollback theme must remain unpublished');
assert(contract.execution?.changedField === 'templateSuffix', 'Only templateSuffix may change');
assert(contract.execution?.before === null && contract.execution?.after === suffix, 'Template transition mismatch');
assert(contract.execution?.protectedCommercialFieldsPreserved === true, 'Protected fields were not preserved');
assert(contract.execution?.postMutationAdminReadbackPassed === true, 'Admin readback must pass');

assert(manifest.schemaVersion === '1.2.0', 'Unexpected manifest schema');
assert(manifest.changeSetId === changeSetId, 'Manifest change-set mismatch');
assert(manifest.state === contract.state, 'Manifest state mismatch');
assert(manifest.productGid === productId, 'Manifest product mismatch');
assert(manifest.templateSuffix === suffix, 'Manifest suffix mismatch');
assert(manifest.approval?.granted === true, 'Manifest approval must be granted');
assert(manifest.approval?.instructionReceived === approval, 'Manifest approval phrase mismatch');
assert(manifest.execution?.productTemplateAssignmentAttempted === true, 'Assignment attempt missing');
assert(manifest.execution?.productTemplateAssignmentExecuted === true, 'Assignment execution missing');
assert(manifest.execution?.productTemplateAssignmentUserErrors?.length === 0, 'Shopify assignment returned errors');
assert(manifest.execution?.soleProductFieldChanged === 'templateSuffix', 'Unexpected product field change');
assert(manifest.execution?.protectedCommercialFieldsPreserved === true, 'Protected fields mismatch');
assert(manifest.productionTheme?.id === themeId && manifest.productionTheme?.role === 'MAIN', 'Manifest theme mismatch');
assert(manifest.formerMainTheme?.id === rollbackThemeId && manifest.formerMainTheme?.role === 'UNPUBLISHED', 'Manifest rollback mismatch');
assert(manifest.productContract?.variantId === variantId, 'Manifest variant mismatch');
assert(manifest.productContract?.inventoryItemId === inventoryItemId, 'Manifest inventory item mismatch');
for (const value of Object.values(manifest.protectedFields || {})) assert(value === 'preserved', 'A protected field is not preserved');

assert(execution.changeSetId === changeSetId, 'Execution change-set mismatch');
assert(execution.approval?.received === true, 'Execution approval missing');
assert(execution.approval?.instruction === approval, 'Execution approval phrase mismatch');
assert(execution.execution?.productGid === productId, 'Execution product mismatch');
assert(execution.execution?.changedField === 'templateSuffix', 'Execution changed-field mismatch');
assert(execution.execution?.before === null && execution.execution?.after === suffix, 'Execution transition mismatch');
assert(execution.execution?.userErrors?.length === 0, 'Execution user errors present');
assert(execution.postMutationReadback?.templateSuffix === suffix, 'Execution readback suffix mismatch');
assert(execution.postMutationReadback?.variantId === variantId, 'Execution variant mismatch');
assert(execution.postMutationReadback?.inventoryItemId === inventoryItemId, 'Execution inventory item mismatch');
assert(execution.postMutationReadback?.descriptionHtmlPreserved === true, 'Description rollback source not preserved');

assert(checkpoint.product?.templateSuffix === null, 'Historical preflight must preserve the before state');
assert(publication.product?.templateSuffix === null, 'Historical publication checkpoint must preserve the before state');

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
assert(!/productUpdate|graphql_mutation|admin\/api|access[_-]?token|client[_-]?secret/i.test(js), 'Client source contains prohibited Admin API or secret pattern');
assert(template.sections?.main?.type === suffix, 'Template section mismatch');
assert(JSON.stringify(template.order) === JSON.stringify(['main']), 'Template order mismatch');

const expected = new Map([
  ['theme/assets/mmg-ai-image-mastery.css', ['5a749b91c5078360f9a64d642ef268be', 10471]],
  ['theme/assets/mmg-ai-image-mastery.js', ['2653b8a8d87c8f5852f653b7580c405d', 5665]],
  ['theme/sections/mmg-ai-image-mastery.liquid', ['52893c2bc11789b613424ec296d838d0', 14700]],
  ['theme/templates/product.mmg-ai-image-mastery.json', ['f767d9a33d9c4afb1ebee3c899e58768', 132]]
]);
for (const [path, [checksum, size]] of expected) {
  assert(md5(path) === checksum, `${path} checksum mismatch`);
  assert(statSync(resolve(root, path)).size === size, `${path} size mismatch`);
}
assert(read('source/styles.css') === read('theme/assets/mmg-ai-image-mastery.css'), 'Source/theme CSS drift');
assert(read('source/behavior.js') === read('theme/assets/mmg-ai-image-mastery.js'), 'Source/theme JavaScript drift');

assert(localQa.overallPass === true, 'Local browser QA must pass');
for (const width of ['320','375','768','1024','1440']) {
  const viewport = localQa.viewports?.[width];
  assert(viewport?.overflow === false, `Viewport ${width} overflow`);
  assert(viewport?.h1Count === 1, `Viewport ${width} H1 mismatch`);
  assert(viewport?.objectFit === 'contain', `Viewport ${width} containment mismatch`);
  assert(viewport?.price === '$9.95', `Viewport ${width} price mismatch`);
}
assert(localQa.functional?.cartRequests?.[0]?.id === 48655433498778, 'Cart variant mismatch');
assert(localQa.functional?.cartRequests?.[0]?.quantity === 1, 'Cart quantity mismatch');

if (errors.length) fail();
console.log('Canonical AI Image Mastery digital-download deployment record is valid.');

function fail() {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
