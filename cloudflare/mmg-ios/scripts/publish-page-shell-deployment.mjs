const endpoint = "https://mmg-ios.info-mindsetmediagroup.workers.dev/api/shopify/page-shell/publish";
const expectedBuild = "kairos-page-shell-publisher-20260719-1";
const payload = { confirmation: "PUBLISH_MMG_PAGE_SHELL_RECONCILIATION" };

let lastFailure = null;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try {
    const response = await fetch(`${endpoint}?deployment_build_attempt=${attempt}&ts=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    let body = {};
    try { body = JSON.parse(text); } catch {}

    const valid = response.ok
      && body?.status === "completed"
      && body?.build === expectedBuild
      && body?.verification?.exactThemeFileReadBack === true
      && body?.verification?.layoutInjectionPresent === true;

    if (valid) {
      console.log(JSON.stringify({
        status: body.status,
        build: body.build,
        completedAt: body.completedAt,
        theme: body.theme,
        verification: body.verification,
      }));
      process.exit(0);
    }

    lastFailure = `HTTP ${response.status}: ${text.slice(0, 4000)}`;
  } catch (error) {
    lastFailure = error instanceof Error ? error.stack || error.message : String(error);
  }

  if (attempt < 8) await new Promise((resolve) => setTimeout(resolve, 5000));
}

console.error(lastFailure || "MMG page-shell publication did not complete.");
process.exit(1);
