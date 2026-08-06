import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const controllerSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-project-setup.js", import.meta.url),
  "utf8",
);
const governanceSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/command-center-governance.js", import.meta.url),
  "utf8",
);
const indexSource = readFileSync(
  new URL("../web/kairos-dashboard/index.html", import.meta.url),
  "utf8",
);
const runtimeLoaderSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/kairos-runtime-loader.js", import.meta.url),
  "utf8",
);
const loaderSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/legacy-runtime-loader.js", import.meta.url),
  "utf8",
);
const productionBootstrapSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-bootstrap.js", import.meta.url),
  "utf8",
);
const postIntakeGuardSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-post-intake-guard.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-12345678";
const SETUP_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/setup`;
const COVER_PATH = `${SETUP_PATH}/cover`;

function fixtureHTML() {
  return `<!doctype html>
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body>
    <div id="manuscript-studio-overlay">
      <div class="manuscript-result">
        <h3>Test Publication</h3>
        <p>Production intake created.</p>
      </div>
    </div>
  </body></html>`;
}

function savedRecord() {
  return {
    status: "assigned-to-production",
    nextAction: "Begin the assigned editorial and production queue.",
    setup: {
      status: "assigned-to-production",
      assignments: [
        { department: "Publishing Operations", role: "Project ownership", status: "assigned" },
      ],
      milestones: [
        { label: "Project setup", status: "completed" },
      ],
    },
  };
}

async function openFixture(page, apiHandler) {
  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await apiHandler(route, request, url);
      return;
    }

    await route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
      openedAt: new Date().toISOString(),
    }));
    window.KairosProductionWorkspace = { refresh() {} };
  }, { key: "kairos.production.active-workspace", projectId: PROJECT_ID });

  await page.addScriptTag({ type: "module", content: controllerSource });
  await expect(page.locator("#manuscript-project-setup")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.KairosManuscriptSetupController?.ready)).toBe(true);
}

test("controller mounts and an iPhone tap completes cover upload plus assignment save", async ({ page }) => {
  const calls = [];

  await openFixture(page, async (route, request, url) => {
    calls.push({ method: request.method(), path: url.pathname });

    if (request.method() === "GET" && url.pathname === SETUP_PATH) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "manuscript_setup_not_found" } }),
      });
      return;
    }

    if (request.method() === "PUT" && url.pathname === COVER_PATH) {
      expect(request.headers()["content-type"]).toBe("image/png");
      expect(request.headers()["x-filename"]).toBe("cover.png");
      expect(request.headers()["x-kairos-operation-id"]).toBeTruthy();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ status: "stored", cover: { filename: "cover.png" } }),
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === SETUP_PATH) {
      expect(request.headers()["content-type"]).toContain("application/json");
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.authorName).toBe("Michael King");
      expect(payload.publicationTitle).toBe("Test Publication");
      expect(payload.service).toBe("complete-publishing-package");
      expect(payload.operationId).toBeTruthy();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(savedRecord()),
      });
      return;
    }

    await route.fulfill({ status: 500, body: "unexpected request" });
  });

  await page.locator("[data-setup-author]").fill("Michael King");
  await page.locator("[data-setup-title]").fill("Test Publication");
  await page.locator("[data-setup-service]").selectOption("complete-publishing-package");
  await page.locator("[data-setup-cover]").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
  });

  await page.locator("[data-setup-submit]").tap();

  await expect(page.locator("#manuscript-project-setup h3")).toHaveText("assigned-to-production");
  await expect(page.locator("#manuscript-project-setup")).toContainText("Begin the assigned editorial and production queue.");
  expect(calls.some(call => call.method === "PUT" && call.path === COVER_PATH)).toBe(true);
  expect(calls.some(call => call.method === "POST" && call.path === SETUP_PATH)).toBe(true);
});

test("Check saved status is bound and restores a durable assignment", async ({ page }) => {
  let statusReads = 0;

  await openFixture(page, async (route, request, url) => {
    if (request.method() === "GET" && url.pathname === SETUP_PATH) {
      statusReads += 1;
      if (statusReads === 1) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "manuscript_setup_not_found" } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(savedRecord()),
        });
      }
      return;
    }
    await route.fulfill({ status: 500, body: "unexpected request" });
  });

  await page.locator("[data-setup-status]").tap();
  await expect(page.locator("#manuscript-project-setup h3")).toHaveText("assigned-to-production");
  expect(statusReads).toBeGreaterThanOrEqual(2);
});

test("Command Center manuscript event routes through the production workspace controller", async ({ page }) => {
  await page.setContent("<!doctype html><html><body><button class='manuscript-launch'>Open Manuscript Studio</button></body></html>");
  await page.evaluate(() => {
    window.__openedWorkspace = "";
    window.KairosProductionWorkspace = {
      open(workspace) {
        window.__openedWorkspace = workspace;
      },
    };
  });
  await page.addScriptTag({ type: "module", content: governanceSource });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("kairos:manuscript-studio:open")));
  await expect.poll(() => page.evaluate(() => window.__openedWorkspace)).toBe("manuscript-studio");
});

test("dashboard keeps production controllers behind the guarded five-center command runtime", async () => {
  expect(indexSource).toMatch(/<meta name="mmg-build" content="kairos-command-center-root-[^"]+">/);
  expect(indexSource).toMatch(/<meta name="mmg-compatible-build" content="kairos-five-center-dashboard-post-intake-[^"]+">/);
  expect(indexSource).toMatch(/<meta name="mmg-command-runtime-target" content="\.\/scripts\/legacy-runtime-loader\.js\?v=five-center-manuscript-flow-recovery-[^"]+">/);
  expect(indexSource).toMatch(/manuscript-production-flow-bootstrap\.js\?v=manuscript-flow-recovery-20260803-3/);
  expect(indexSource).toMatch(/manuscript-auto-pipeline\.js\?v=five-center-manuscript-flow-recovery-20260803-3/);
  expect(indexSource).toMatch(/manuscript-post-intake-guard\.js\?v=five-center-manuscript-flow-recovery-20260803-3/);
  expect(indexSource).toMatch(/mmg-production-controller-target/);
  expect(indexSource).toMatch(/mmg-post-intake-guard-target/);
  expect(indexSource).toMatch(/mmg-state-fetch-target/);
  const moduleTags = [...indexSource.matchAll(/<script type="module"([^>]*)>/g)].map((match) => match[1]);
  expect(moduleTags).toHaveLength(3);
  expect(moduleTags[0]).toContain('src="./scripts/safari-manuscript-intake-compat.js');
  expect(moduleTags[1]).toContain('data-kairos-command-script="command-hub.js command-center-layout.js"');
  expect(moduleTags[2]).toContain('src="./scripts/manuscript-production-flow-bootstrap.js');
  expect(indexSource).toContain("__KAIROS_COMMAND_FIRST_PAINT__");
  expect(indexSource).not.toContain("executive-local-inference.js");
  expect(indexSource).not.toContain("kairos-runtime-loader.js");
  expect(indexSource).not.toContain("manuscript-runtime-cache-guard.js");
  expect(runtimeLoaderSource).toContain('import "./legacy-runtime-loader.js"');
  expect(runtimeLoaderSource).not.toContain("executive-local-inference.js");
  expect(loaderSource).toContain("commandHubMode");
  expect(loaderSource).toContain('"command-hub.js"');
  expect(loaderSource).toContain('const ASSET_RELEASE = "five-center-manuscript-flow-recovery-20260803-3"');
  expect(loaderSource).toContain('"manuscript-post-intake-guard.js"');
  expect(postIntakeGuardSource).toContain("duplicate Manuscript Studio module blocked");
  expect(postIntakeGuardSource).toContain("success-overlay-restored");
  expect(productionBootstrapSource).toContain("manuscript-flow-recovery-20260803-3");
  expect(productionBootstrapSource).toContain("five-center-manuscript-flow-recovery-20260803-3");
  expect(productionBootstrapSource).toContain("kairos-state-fetch-install.js?v=${RELEASE}");
  expect(productionBootstrapSource).toContain("BOOT_TIMEOUT_MS = 20_000");
  expect(productionBootstrapSource).toContain("renderBootstrapFailure");
  expect(productionBootstrapSource).not.toContain("import(`./manuscript-auto-pipeline.js");
  expect(productionBootstrapSource).toContain('singleControllerOwner: "legacy-runtime-loader"');

  const requiredScripts = [
    "command-center-governance.js",
    "manuscript-post-intake-guard.js",
    "manuscript-studio.js",
    "manuscript-project-setup.js",
    "manuscript-editorial-workbench.js",
    "kairos-local-inference.js",
    "manuscript-auto-pipeline.js",
  ];

  for (const filename of requiredScripts) {
    const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(indexSource, `${filename} must not execute directly from the five-center homepage HTML`).not.toMatch(new RegExp(`<script[^>]+src="[^"]*${escaped}`));
    const matches = [...loaderSource.matchAll(new RegExp(`"${escaped}"`, "g"))];
    expect(matches, `${filename} must be declared exactly once in the governed command runtime`).toHaveLength(1);
  }

  const guardIndex = loaderSource.indexOf('"manuscript-post-intake-guard.js"');
  const studioIndex = loaderSource.indexOf('"manuscript-studio.js"');
  const inferenceIndex = loaderSource.indexOf('"kairos-local-inference.js"');
  const pipelineIndex = loaderSource.indexOf('"manuscript-auto-pipeline.js"');
  expect(guardIndex).toBeGreaterThan(-1);
  expect(studioIndex).toBeGreaterThan(guardIndex);
  expect(inferenceIndex).toBeGreaterThan(studioIndex);
  expect(pipelineIndex).toBeGreaterThan(inferenceIndex);

  expect(loaderSource).toContain('"production-workspace-controller.js"');
  expect(loaderSource).toContain('"publishing-production-center.js"');
  expect(loaderSource).toContain('"shopify-page-compiler.js"');
});
