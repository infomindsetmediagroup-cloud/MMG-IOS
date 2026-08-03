import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const editorialSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-editorial-workbench.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-editorial-loop-test";
const EDITORIAL_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/editorial`;
const SOURCE_TEXT_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/source/text`;

test("editorial workbench mounts once and performs one load during repeated DOM mutations", async ({ page }) => {
  let editorialReads = 0;
  let sourceReads = 0;

  await page.route("https://kairos.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <div id="manuscript-studio-overlay">
            <div class="manuscript-result">
              <section id="manuscript-project-setup">
                <p>Production assignment</p>
                <h3>assigned-to-production</h3>
              </section>
            </div>
          </div>
        </body></html>`,
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === EDITORIAL_PATH) {
      editorialReads += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ready",
          editorial: {
            status: "not-started",
            stage: "editorial-intake",
            currentVersionId: null,
            versions: [],
            review: null,
          },
        }),
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === SOURCE_TEXT_PATH) {
      sourceReads += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ manuscript: "A preserved manuscript source used for the editorial workbench regression test." }),
      });
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
  }, { key: "kairos.production.active-workspace", projectId: PROJECT_ID });

  await page.addScriptTag({ type: "module", content: editorialSource });

  await expect.poll(
    () => page.evaluate(() => window.KairosEditorialWorkbenchController?.ready === true),
  ).toBe(true);
  await expect(page.locator("#manuscript-editorial-workbench")).toBeVisible();
  await expect.poll(() => editorialReads).toBe(1);
  await expect.poll(() => sourceReads).toBe(1);

  await page.evaluate(() => {
    for (let index = 0; index < 250; index += 1) {
      const node = document.createElement("span");
      node.textContent = `mutation-${index}`;
      document.body.appendChild(node);
    }
    document.querySelector("#manuscript-project-setup")?.appendChild(document.createElement("div"));
  });

  await page.waitForTimeout(750);
  expect(editorialReads).toBe(1);
  expect(sourceReads).toBe(1);
  await expect(page.locator("#manuscript-editorial-workbench")).toHaveCount(1);
});

test("customer review shows the locked proof and one action produces the deliverable package", async ({ page }) => {
  const versionId = "ver-customer-review-12345678";
  const manuscript = `${"Approved manuscript proof content for production. ".repeat(20)}Final paragraph.`;
  const calls = { decision: 0, finalize: 0, manufacture: 0, openProduction: 0 };
  const version = {
    versionId,
    sequence: 2,
    label: "Editorial Version 2",
    passType: "structural",
    wordCount: 161,
    characterCount: manuscript.length,
    checksum: "d7e623870f478f30e900efcd3254b69084d4fb673f36c711479619c46698a9f7",
    actor: "MMG Editorial Production",
    createdAt: "2026-08-03T14:58:45.000Z",
  };
  let editorial = {
    status: "awaiting-customer-review",
    stage: "customer-review",
    currentVersionId: versionId,
    finalVersionId: null,
    versions: [version],
    review: {
      reviewId: "review-customer-12345678",
      versionId,
      status: "awaiting-customer-review",
      decision: null,
      decidedAt: null,
    },
  };

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "document") {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body><div id="manuscript-studio-overlay"><div class="manuscript-result"><section id="manuscript-project-setup"><p>Production assignment</p><h3>assigned-to-production</h3></section></div></div></body></html>`,
      });
    }
    if (request.method() === "GET" && url.pathname === EDITORIAL_PATH) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready", editorial }) });
    }
    if (request.method() === "GET" && url.pathname === `${EDITORIAL_PATH}/versions/${versionId}`) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready", version, manuscript }) });
    }
    if (request.method() === "GET" && url.pathname === `/api/production-registry/manuscripts/${PROJECT_ID}/setup/cover`) {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
      });
    }
    if (request.method() === "POST" && url.pathname === `${EDITORIAL_PATH}/decision`) {
      calls.decision += 1;
      const body = JSON.parse(request.postData() || "{}");
      expect(body.decision).toBe("approved");
      editorial = {
        ...editorial,
        status: "customer-approved",
        stage: "proofread",
        review: { ...editorial.review, status: "approved", decision: "approved", decidedAt: "2026-08-03T15:10:00.000Z" },
      };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "customer-approved", editorial }) });
    }
    if (request.method() === "POST" && url.pathname === `${EDITORIAL_PATH}/finalize`) {
      calls.finalize += 1;
      const body = JSON.parse(request.postData() || "{}");
      expect(body.versionId).toBe(versionId);
      editorial = { ...editorial, status: "ready-for-manufacturing", stage: "manufacturing-handoff", finalVersionId: versionId };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ready-for-manufacturing", editorial }) });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId }));
    window.KairosProductionWorkspace = { refresh: async () => ({ status: "ready" }) };
    window.KairosManuscriptStageHandoff = {
      async openProduction() {
        window.__reviewFlowCalls.openProduction += 1;
        const section = document.createElement("section");
        section.id = "manuscript-auto-pipeline";
        document.querySelector("#manuscript-editorial-workbench")?.insertAdjacentElement("afterend", section);
        return { status: "production-open" };
      },
    };
    window.KairosManuscriptPipelineOrchestrator = {
      ready: true,
      snapshot: () => ({ lastError: "" }),
      async manufacture() {
        window.__reviewFlowCalls.manufacture += 1;
        document.querySelector("#manuscript-auto-pipeline").innerHTML = "<h3>Package Preview</h3><p>complete-production-package.zip</p>";
        return { status: "production-ready" };
      },
    };
  }, { key: "kairos.production.active-workspace", projectId: PROJECT_ID });
  await page.evaluate(initial => { window.__reviewFlowCalls = initial; }, calls);
  await page.addScriptTag({ type: "module", content: editorialSource });

  const review = page.locator("[data-customer-review-package]");
  await expect(review).toBeVisible();
  await expect(review).toContainText("complete-production-package.zip");
  await expect(review.locator(".manuscript-customer-deliverables article")).toHaveCount(6);
  await expect(review.locator("[data-customer-review-manuscript]")).toHaveAttribute("readonly", "");
  await expect(review.locator("[data-customer-review-manuscript]")).toHaveValue(manuscript);
  await expect(review.getByAltText("Approved customer cover")).toBeVisible();
  await expect(page.locator("[data-editorial-save]")).toHaveCount(0);

  await review.getByRole("button", { name: "Approve Review & Produce Deliverable Asset" }).click({ force: true });
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Package Preview");
  await expect.poll(() => page.evaluate(() => window.__reviewFlowCalls)).toEqual({
    decision: 0,
    finalize: 0,
    manufacture: 1,
    openProduction: 1,
  });
  expect(calls.decision).toBe(1);
  expect(calls.finalize).toBe(1);
});
