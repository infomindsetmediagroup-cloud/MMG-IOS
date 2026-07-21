import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(process.cwd());
const required = [
  'extensions/mmg-my-downloads/shopify.extension.toml',
  'extensions/mmg-my-downloads/src/MyDownloads.tsx',
  'extensions/mmg-my-downloads/src/library.mjs',
  'extensions/mmg-my-downloads/locales/en.default.json',
  'extensions/mmg-my-downloads/tests/library.test.mjs',
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing ${file}`);
}

const source = readFileSync(resolve(root, 'extensions/mmg-my-downloads/src/MyDownloads.tsx'), 'utf8');
const config = readFileSync(resolve(root, 'extensions/mmg-my-downloads/shopify.extension.toml'), 'utf8');
const library = readFileSync(resolve(root, 'extensions/mmg-my-downloads/src/library.mjs'), 'utf8');

const assertions = [
  [config.includes('customer-account.page.render'), 'Full-page customer-account target missing'],
  [config.includes('api_access = true'), 'Customer Account API access missing'],
  [!config.includes('network_access = true'), 'External network access must remain disabled'],
  [source.includes('shopify://customer-account/api/2026-07/graphql.json'), 'Authenticated Customer Account API endpoint missing'],
  [source.includes('pageInfo { hasNextPage endCursor }'), 'Cross-order pagination missing'],
  [source.includes('statusPageUrl'), 'Secure Digital Products delivery route missing'],
  [source.includes('shopify:customer-account/orders'), 'Native order-history navigation missing'],
  [library.includes("productType === 'digital download'"), 'Digital product-type gate missing'],
  [library.includes("sku.startsWith('MMG-DIG-')"), 'Canonical MMG digital SKU gate missing'],
  [!source.match(/admin\/api|X-Shopify-Access-Token|SHOPIFY_ADMIN_ACCESS_TOKEN/), 'Client source contains prohibited Admin API credentials'],
];

for (const [valid, message] of assertions) {
  if (!valid) throw new Error(message);
}

console.log('My Downloads contract validation passed.');
