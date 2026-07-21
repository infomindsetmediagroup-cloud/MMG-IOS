#!/usr/bin/env node
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(process.cwd());
const required = [
  'README.md',
  'contract.json',
  'package.json',
  'shopify.app.toml.example',
  'extensions/mmg-my-downloads/package.json',
  'extensions/mmg-my-downloads/shopify.extension.toml',
  'extensions/mmg-my-downloads/locales/en.default.json',
  'extensions/mmg-my-downloads/src/library.mjs',
  'extensions/mmg-my-downloads/src/MyDownloads.tsx',
  'extensions/mmg-my-downloads/tests/library.test.mjs',
];

const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const read = (path) => readFileSync(resolve(root, path), 'utf8');

for (const path of required) assert(existsSync(resolve(root, path)), `Missing ${path}`);
if (errors.length) fail();

const app = read('shopify.app.toml.example');
const extension = read('extensions/mmg-my-downloads/shopify.extension.toml');
const ui = read('extensions/mmg-my-downloads/src/MyDownloads.tsx');
const library = read('extensions/mmg-my-downloads/src/library.mjs');
const contract = JSON.parse(read('contract.json'));
const extensionUid = 'c2a4f88e-ecb7-4d3e-94c8-21fa813d9e11';

assert(app.includes('api_version = "2026-07"'), 'App API version must be 2026-07');
assert(app.includes('customer_read_customers'), 'Missing customer_read_customers scope');
assert(app.includes('customer_read_orders'), 'Missing customer_read_orders scope');
assert(extension.includes('target = "customer-account.page.render"'), 'Full-page customer account target missing');
assert(extension.includes('handle = "mmg-my-downloads"'), 'Extension handle mismatch');
assert(extension.includes(`uid = "${extensionUid}"`), 'Stable extension UID missing');
assert(!extension.includes('api_access'), 'Unnecessary Storefront API capability is prohibited');
assert(!extension.includes('network_access'), 'External network access is not permitted for this extension');
assert(ui.includes('shopify://customer-account/api/${API_VERSION}/graphql.json'), 'Customer Account API endpoint missing');
assert(ui.includes('statusPageUrl'), 'Secure order status entitlement URL missing');
assert(ui.includes('lineItems(first: 250)'), 'Cross-order line item query missing');
assert(ui.includes('sortKey: PROCESSED_AT'), 'Deterministic order sorting missing');
assert(ui.includes("shopify:customer-account/orders"), 'Native orders navigation missing');
assert(library.includes("sku.startsWith('MMG-DIG-')"), 'MMG digital SKU gate missing');
assert(library.includes("productType === 'digital download'"), 'Digital Download product-type gate missing');
assert(library.includes("lineItem.requiresShipping !== false"), 'Non-shipping gate missing');
assert(!/78dbb44cd28e33dc96d6a57c1c6d31a0|0bd4e18a2c5c301c30b28df4aab93504/.test(ui + library), 'Customer-specific order secret is prohibited');
assert(!/cdn\.shopify\.com\/s\/files\/.+\.(pdf|zip|epub)/i.test(ui + library), 'Public hardcoded file URL is prohibited');
assert(!/admin\/api|X-Shopify-Access-Token|SHOPIFY_ADMIN_ACCESS_TOKEN/.test(ui), 'Client source contains prohibited Admin API credentials');
assert(contract.changeSetId === 'shopify-customer-account-my-downloads-library-20260721', 'Contract change-set mismatch');
assert(contract.state === 'source-complete-shopify-app-link-and-deploy-required', 'Contract state mismatch');
assert(contract.extension?.uid === extensionUid, 'Contract extension UID mismatch');
assert(contract.extension?.customerAccountApiDirectAccess === true, 'Direct Customer Account API access must be recorded');
assert(contract.extension?.storefrontApiCapability === false, 'Storefront API capability must remain disabled');
assert(contract.security?.fileUrlsStored === false, 'File URLs must not be stored');
assert(contract.security?.entitlementSource === 'shopify-paid-order-history', 'Entitlement source mismatch');

if (errors.length) fail();
console.log('MMG My Downloads customer-account extension contract is valid.');

function fail() {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
