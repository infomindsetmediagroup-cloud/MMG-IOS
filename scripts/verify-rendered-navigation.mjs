import { chromium } from 'playwright';

const storefrontUrl = process.env.STOREFRONT_URL;
const marker = process.env.THEME_MARKER;
const releaseSha = process.env.RELEASE_SHA || Date.now().toString();

if (!storefrontUrl || !marker) {
  throw new Error('STOREFRONT_URL and THEME_MARKER are required.');
}

const expected = ['Shop', 'Create & Learn', 'Services', 'Company', 'Support'];
const forbidden = ['Catalog', 'Knowledge Library'];
const browser = await chromium.launch({ headless: true });

async function verify(viewport, label) {
  const page = await browser.newPage({ viewport });
  const url = `${storefrontUrl}/?mmg_render_verify=${encodeURIComponent(releaseSha)}&t=${Date.now()}`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!response || response.status() >= 400) {
    throw new Error(`${label}: HTTP ${response?.status() ?? 'no-response'}`);
  }

  await page.waitForFunction(
    expectedMarker => document.documentElement.dataset.mmgThemeMenuHotfix === expectedMarker,
    marker,
    { timeout: 30000 }
  );
  await page.waitForTimeout(1500);

  const result = await page.evaluate(({ expectedItems, forbiddenItems, expectedMarker }) => {
    const visibleText = [...document.querySelectorAll('header, nav, [role="navigation"], .menu-drawer, .drawer')]
      .filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map(element => element.innerText || '')
      .join('\n');

    return {
      marker: document.documentElement.dataset.mmgThemeMenuHotfix || null,
      installedMenus: document.querySelectorAll(`[data-mmg-menu="${expectedMarker}"]`).length,
      expected: Object.fromEntries(expectedItems.map(item => [item, visibleText.includes(item)])),
      forbidden: Object.fromEntries(forbiddenItems.map(item => [item, visibleText.includes(item)])),
      visibleText: visibleText.slice(0, 5000)
    };
  }, { expectedItems: expected, forbiddenItems: forbidden, expectedMarker: marker });

  console.log(`${label}: ${JSON.stringify(result, null, 2)}`);
  await page.screenshot({ path: `${label}.png`, fullPage: true });

  if (result.marker !== marker) throw new Error(`${label}: marker not active`);
  if (result.installedMenus < 1) throw new Error(`${label}: no Kairos menu installed`);
  for (const item of expected) if (!result.expected[item]) throw new Error(`${label}: missing ${item}`);
  for (const item of forbidden) if (result.forbidden[item]) throw new Error(`${label}: obsolete ${item} still visible`);

  await page.close();
}

try {
  await verify({ width: 1440, height: 1000 }, 'desktop-navigation');
  await verify({ width: 390, height: 844 }, 'mobile-navigation');
} finally {
  await browser.close();
}
