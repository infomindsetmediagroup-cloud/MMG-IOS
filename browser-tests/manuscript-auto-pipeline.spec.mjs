import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const controllerSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-auto-pipeline-12345678";
const PIPELINE_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/auto-pipeline`;

function fixtureHTML() {
  return `<!doctype html>
  <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body>
      <div id="manuscript-studio-overlay">
        <div class="manuscript-result">
          <section id="manuscript-project-setup" data-project-id="${PROJECT_ID}">
            <p class="eyebrow">Production assignment</p>
            <h3>assigned-to-production</h3>
          </section>
        </div>
      </div>
    </body>
  </html>`;
}

function productionReadyRecord(shopify = { status: "not-prepared" }) {
  return {
    status: "production-ready",
    projectId: PROJECT_ID,
    metadata: {
      title: "AI Image Mastery",
      subtitle: "A Practical Guide to Creating Better AI Images",
      author: "Michael King",
      description: "A practical guide to creating better AI-generated images.",
      keywords: ["images", "prompt", "visual", "lighting", "composition", "style", "workflow"],
      categories: [
        "Computers / Artificial Intelligence / General",
        "Art / Digital",
        "Business & Economics / Marketing / General",
      ],
      price: "9.95",
      currency: "USD",
      rights: { territories: ["Worldwide"] },
      templateSuffix: "mmg-ai-image-mastery",
    },
    vault: {
      assetCount: 3,
      integrity: { passed: true, assetCount: 3 },
      packageDownloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/package`,
      assets: [
        {
          assetId: "gold-master-docx-1111111111111111",
          filename: "gold-master.docx",
          role: "PRODUCTION_DELIVERABLE",
          byteSize: 24576,
          sha256: "1".repeat(64),
          downloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/assets/gold-master-docx-1111111111111111`,
        },
        {
          assetId: "approved-cover-png-2222222222222222",
          filename: "approved-cover.png",
          role: "APPROVED_COVER",
          byteSize: 65536,
          sha256: "2".repeat(64),
          downloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/assets/approved-cover-png-2222222222222222`,
        },
        {
          assetId: "complete-production-package-zip-3333333333333333",
          filename: "complete-production-package.zip",
          role: "FINAL_PRODUCTION_ZIP",
          byteSize: 1048576,
          sha256: "3".repeat(64),
          downloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/assets/complete-production-package-zip-3333333333333333`,
        },
      ],
    },
    shopify,
    nextAction: "Review the Admin Asset Vault package, then prepare the governed Shopify product draft.",
  };
}

function draftRecord() {
  return productionReadyRecord({
    status: "draft-created-media-installed-awaiting-live-approval",
    prepared: {
      desired: {
        title: "AI Image Mastery",
        productType: "Digital Download",
        templateSuffix: "mmg-ai-image-mastery",
        price: "9.95",
      },
    },
    publication: {
      previewURL: "https://example.myshopify.com/products/ai-image-mastery",
    },
    media: { status: "media-installed-and-verified" },
    launch: {
      releaseId: "launch-release-123",
      requiredChecks: ["Cover is correct", "Product copy is correct"],
    },
  });
}

function liveRecord() {
  return {
    ...productionReadyRecord(),
    metadata: {
      ...productionReadyRecord().metadata,
      liveURL: "https://themindsetmediagroup.com/products/ai-image-mastery",
      publicationStatus: "product-live-and-verified",
    },
    shopify: {
      status: "product-live-and-verified",
      livePublication: {
        publication: {
          liveProbe: {
            finalURL: "https://themindsetmediagroup.com/products/ai-image-mastery",
          },
        },
      },
    },
  };
}

test("mobile Manuscript Studio automatically builds the vault package without catalog fields", async ({ page }) => {
  const errors = [];
  const calls = [];
  let statusReads = 0;
  let buildRuns = 0;

  page.on("pageerror", (error) => errors.push(error.message));

  await page.route("https://kairos.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (request.method() === "GET" && url.pathname === PIPELINE_PATH) {
      statusReads += 1;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "auto_pipeline_not_started" } }),
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${PIPELINE_PATH}/run`) {
      buildRuns += 1;
      calls.push({ role: "build", payload: JSON.parse(request.postData() || "{}") });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(productionReadyRecord()),
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${PIPELINE_PATH}/shopify-draft`) {
      const payload = JSON.parse(request.postData() || "{}");
      calls.push({ role: "draft", payload });
      expect(payload.confirmation).toBe("CREATE SHOPIFY PRODUCT DRAFT");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(draftRecord()),
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${PIPELINE_PATH}/shopify-publish`) {
      const payload = JSON.parse(request.postData() || "{}");
      calls.push({ role: "publish", payload });
      expect(payload.confirmation).toBe("PUBLISH PRODUCT LIVE");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(liveRecord()),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ projectId }) => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId,
      openedAt: new Date().toISOString(),
    }));
  }, { projectId: PROJECT_ID });

  await page.addScriptTag({ type: "module", content: controllerSource });

  await expect.poll(
    () => page.evaluate(() => window.KairosManuscriptAutoPipelineController?.ready === true),
  ).toBe(true);
  await expect(page.locator("#manuscript-auto-pipeline")).toBeVisible();
  await expect(page.locator("#manuscript-auto-pipeline h3")).toHaveText("AI Image Mastery");
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Admin Asset Vault");
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Computers / Artificial Intelligence / General");
  await expect(page.locator("#manuscript-auto-pipeline a[download]", { hasText: "Download Production-Ready ZIP" })).toBeVisible();

  expect(statusReads).toBe(1);
  expect(buildRuns).toBe(1);
  expect(await page.locator("[data-cat-title], [data-cat-author], [data-cat-isbn], [data-cat-asin], [data-cat-rights-note]").count()).toBe(0);
  expect(await page.getByText("Prepare Catalog Record", { exact: true }).count()).toBe(0);

  await page.evaluate(() => {
    const result = document.querySelector("#manuscript-studio-overlay .manuscript-result");
    for (let index = 0; index < 250; index += 1) {
      const marker = document.createElement("span");
      marker.textContent = `mutation-${index}`;
      result.appendChild(marker);
    }
  });
  await page.waitForTimeout(500);
  await expect(page.locator("#manuscript-auto-pipeline")).toHaveCount(1);
  expect(buildRuns).toBe(1);

  await page.locator("[data-auto-shopify-draft]").tap();
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Draft created and media installed");
  expect(calls.some((call) => call.role === "draft")).toBe(true);

  await page.locator("[data-auto-shopify-publish]").tap();
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Product published and verified");
  await expect(page.locator("#manuscript-auto-pipeline a", { hasText: "Open Live Product" })).toHaveAttribute(
    "href",
    "https://themindsetmediagroup.com/products/ai-image-mastery",
  );
  expect(calls.some((call) => call.role === "publish")).toBe(true);
  expect(errors).toEqual([]);
});
