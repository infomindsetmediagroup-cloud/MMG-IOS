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

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function openWithRetry(page, label) {
  const attempts = 8;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const url = `${storefrontUrl}/?mmg_render_verify=${encodeURIComponent(releaseSha)}&viewport=${encodeURIComponent(label)}&attempt=${attempt}&t=${Date.now()}`;
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
      referer: 'https://www.google.com/'
    });
    const status = response?.status() ?? 0;

    console.log(`${label}: navigation attempt ${attempt}/${attempts} HTTP ${status || 'no-response'}`);

    if (status > 0 && status < 400) return response;

    if (![0, 408, 425, 429, 500, 502, 503, 504].includes(status)) {
      throw new Error(`${label}: HTTP ${status}`);
    }

    const retryAfter = Number(response?.headers()['retry-after'] || 0);
    const delay = Math.max(retryAfter * 1000, Math.min(15000 * attempt, 60000));
    console.log(`${label}: retrying after ${delay}ms`);
    await sleep(delay);
  }

  throw new Error(`${label}: storefront remained rate-limited or unavailable after ${attempts} attempts`);
}

async function verify(viewport, label) {
  const page = await browser.newPage({
    viewport,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  });

  try {
    await openWithRetry(page, label);

    await page.waitForFunction(
      expectedMarker => document.documentElement.dataset.mmgThemeMenuHotfix === expectedMarker,
      marker,
      { timeout: 45000 }
    );
    await page.waitForTimeout(2000);

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
  } finally {
    await page.close();
  }
}

try {
  await verify({ width: 1440, height: 1000 }, 'desktop-navigation');
  await sleep(20000);
  await verify({ width: 390, height: 844 }, 'mobile-navigation');
} finally {
  await browser.close();
}
