const fs = require('fs');
const { chromium } = require('playwright');

const outputPath = process.env.DIAGNOSTIC_PATH || 'runtime-header-browser-diagnostics.json';
const write = value => fs.writeFileSync(outputPath, JSON.stringify(value, null, 2));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleMessages = [];
  const requestFailures = [];
  const badResponses = [];

  page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', error => consoleMessages.push({ type: 'pageerror', text: error.message }));
  page.on('requestfailed', request => requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || 'unknown' }));
  page.on('response', response => {
    if (response.status() >= 400) badResponses.push({ status: response.status(), url: response.url() });
  });

  const url = `${process.env.KAIROS_URL}?browser-runtime=${process.env.GITHUB_SHA}-${Date.now()}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.locator('[data-runtime-label]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('[data-runtime-label]')?.textContent?.trim() === 'Online', null, { timeout: 30000 });
    const label = await page.locator('[data-runtime-label]').textContent();
    const health = await page.evaluate(async () => {
      const response = await fetch(`/api/health?browser-readback=${Date.now()}`, { cache: 'no-store' });
      return { ok: response.ok, body: await response.json() };
    });
    const diagnostic = {
      status: 'passed',
      visibleLabel: label?.trim() || '',
      healthStatus: health.body?.status || null,
      consoleMessages,
      requestFailures,
      badResponses,
    };
    write(diagnostic);
    if (!health.ok || !['ready', 'ok', 'operational'].includes(String(health.body?.status || '').toLowerCase())) {
      throw new Error(`Browser health readback was not operational: ${JSON.stringify(health)}`);
    }
    if (label?.trim() !== 'Online') throw new Error(`Visible runtime label was ${JSON.stringify(label)}.`);
    console.log(JSON.stringify(diagnostic));
  } catch (error) {
    const diagnostic = {
      status: 'failed',
      error: error?.message || String(error),
      pageURL: page.url(),
      title: await page.title().catch(() => ''),
      bodyText: await page.locator('body').innerText().catch(() => ''),
      html: (await page.content().catch(() => '')).slice(0, 24000),
      consoleMessages,
      requestFailures,
      badResponses,
    };
    write(diagnostic);
    console.error(JSON.stringify(diagnostic));
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
