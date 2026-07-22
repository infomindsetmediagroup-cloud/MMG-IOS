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
  await page.route("https://kairos.test/**", async (route) => {
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
  expect(calls.some((call) => call.method === "PUT" && call.path === COVER_PATH)).toBe(true);
  expect(calls.some((call) => call.method === "POST" && call.path === SETUP_PATH)).toBe(true);
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

test("dashboard force-loads the manuscript workspace activation modules", async () => {
  expect(indexSource).toContain("kairos-command-hub-manuscript-workspace-20260722-4");
  expect(indexSource).toContain("./scripts/command-center-governance.js?v=manuscript-workspace-20260722-2");
  expect(indexSource).toContain("./scripts/manuscript-studio.js?v=manuscript-controller-20260722-3");
  expect(indexSource).toContain("./scripts/manuscript-project-setup.js?v=manuscript-controller-20260722-3");
  expect(indexSource).toContain("?v=manuscript-workspace-20260722-2");

  const delayedModuleList = indexSource.match(/const modules=\[(.*?)\];/s)?.[1] || "";
  expect(delayedModuleList).not.toContain("manuscript-studio.js");
  expect(delayedModuleList).not.toContain("manuscript-project-setup.js");
});
