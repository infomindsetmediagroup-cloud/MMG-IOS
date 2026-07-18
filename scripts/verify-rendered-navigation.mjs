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

async function inspectDocument(page) {
  return page.evaluate(expectedMarker => {
    const metaMarker = document.querySelector('meta[name="mmg-theme-menu-hotfix"]')?.content || null;
    const datasetMarker = document.documentElement.dataset.mmgThemeMenuHotfix || null;
    const installedMenus = document.querySelectorAll(`[data-mmg-menu="${expectedMarker}"]`).length;
    const bodyText = document.body?.innerText || '';
    const title = document.title || '';

    return {
      metaMarker,
      datasetMarker,
      installedMenus,
      title,
      bodyText: bodyText.slice(0, 3000),
      challengeLike: /too many requests|rate limit|checking your browser|verify you are human|access denied|temporarily unavailable/i.test(`${title}\n${bodyText}`)
    };
  }, marker);
}

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
    await page.waitForTimeout(2500);
    const documentState = await inspectDocument(page);

    console.log(`${label}: navigation attempt ${attempt}/${attempts} HTTP ${status || 'no-response'} meta=${documentState.metaMarker || 'none'} dataset=${documentState.datasetMarker || 'none'} menus=${documentState.installedMenus}`);

    const realStorefrontDocument =
      status > 0 &&
      status < 400 &&
      !documentState.challengeLike &&
      documentState.metaMarker === marker;

    if (realStorefrontDocument) return;

    if (![0, 200, 408, 425, 429, 500, 502, 503, 504].includes(status)) {
      throw new Error(`${label}: HTTP ${status}`);
    }

    const retryAfter = Number(response?.headers()['retry-after'] || 0);
    const delay = Math.max(retryAfter * 1000, Math.min(15000 * attempt, 60000));
    console.log(`${label}: storefront document not yet verifiable; retrying after ${delay}ms`);
    await sleep(delay);
  }

  throw new Error(`${label}: storefront never returned the verified Shopify theme document`);
}

async function waitForRenderedMenu(page, label) {
  const deadline = Date.now() + 60000;
  let lastResult = null;

  while (Date.now() < deadline) {
    lastResult = await page.evaluate(({ expectedItems, forbiddenItems, expectedMarker }) => {
      const navigationElements = [...document.querySelectorAll('header, nav, [role="navigation"], .menu-drawer, .drawer')];
      const visibleText = navigationElements
        .filter(element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        })
        .map(element => element.innerText || '')
        .join('\n');

      return {
        metaMarker: document.querySelector('meta[name="mmg-theme-menu-hotfix"]')?.content || null,
        datasetMarker: document.documentElement.dataset.mmgThemeMenuHotfix || null,
        installedMenus: document.querySelectorAll(`[data-mmg-menu="${expectedMarker}"]`).length,
        expected: Object.fromEntries(expectedItems.map(item => [item, visibleText.includes(item)])),
        forbidden: Object.fromEntries(forbiddenItems.map(item => [item, visibleText.includes(item)])),
        visibleText: visibleText.slice(0, 5000)
      };
    }, { expectedItems: expected, forbiddenItems: forbidden, expectedMarker: marker });

    const expectedPresent = expected.every(item => lastResult.expected[item]);
    const forbiddenAbsent = forbidden.every(item => !lastResult.forbidden[item]);
    const markerValid = lastResult.metaMarker === marker;
    const installationObserved = lastResult.installedMenus > 0 || lastResult.datasetMarker === marker;

    if (markerValid && installationObserved && expectedPresent && forbiddenAbsent) {
      return lastResult;
    }

    await page.waitForTimeout(2000);
  }

  console.log(`${label}: final rendered state ${JSON.stringify(lastResult, null, 2)}`);
  throw new Error(`${label}: canonical navigation did not render within 60 seconds`);
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
    const result = await waitForRenderedMenu(page, label);
    console.log(`${label}: ${JSON.stringify(result, null, 2)}`);
    await page.screenshot({ path: `${label}.png`, fullPage: true });
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
