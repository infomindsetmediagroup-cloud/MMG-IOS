import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/kairos-theme-menu-hotfix-publisher-20260718.js', import.meta.url);
const origin = 'https://themindsetmediagroup.com';
const paths = [
  '/collections/all',
  '/pages/free-creator-toolkit',
  '/pages/capcut-templates',
  '/pages/publishing-services',
  '/pages/customer-portal',
  '/pages/about',
  '/pages/founder',
  '/pages/our-standards',
  '/pages/publishing-philosophy',
  '/pages/contact',
  '/policies/privacy-policy',
  '/policies/terms-of-service',
  '/policies/refund-policy',
  '/policies/shipping-policy'
];

let source = await readFile(file, 'utf8');
for (const path of paths) {
  source = source.replaceAll(`\"${path}\"`, `\"${origin}${path}\"`);
}

for (const path of paths) {
  if (!source.includes(`\"${origin}${path}\"`)) {
    throw new Error(`Navigation URL normalization failed for ${path}`);
  }
}

await writeFile(file, source, 'utf8');
console.log('Canonical navigation URLs normalized to absolute storefront URLs.');
