import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const controllerSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-studio-live-replacement-12345678";
const PIPELINE_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/auto-pipeline`;
const REPLACEMENT_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/live-product-replacement`;

function fixtureHTML() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
    <div id="manuscript-studio-overlay"><div class="manuscript-result">
      <section id="manuscript-project-setup" data-project-id="${PROJECT_ID}"><p>Production assignment</p><h3>assigned-to-production</h3></section>
    </div></div>
  </body></html>`;
}

function baseRecord(shopify = { status: "not-prepared" }) {
  return {
    status: "production-ready",
    projectId: PROJECT_ID,
    manufacturingProjectId: "12345678-1234-1234-1234-123456789abc",
    metadata: {
      title: "AI Image Mastery",
      subtitle: "A Practical Guide to Creating Better AI Images",
      author: "Michael King",
      description: "A practical guide to creating better AI-generated images.",
      keywords: ["images", "prompt", "visual", "lighting", "composition", "style", "workflow"],
      categories: ["Computers / Artificial Intelligence / General", "Art / Digital", "Business & Economics / Marketing / General"],
      price: "9.95",
      currency: "USD",
      templateSuffix: "mmg-ai-image-mastery",
      rights: { territories: ["Worldwide"] },
    },
    vault: {
      assetCount: 4,
      integrity: { passed: true, assetCount: 4 },
      packageDownloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/package`,
      assets: [
        { assetId: "cover", filename: "approved-cover.png", role: "APPROVED_COVER", byteSize: 64000, downloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/assets/cover` },
        { assetId: "hero", filename: "product-hero.svg", role: "PRODUCT_ASSET", byteSize: 32000, downloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/assets/hero` },
        { assetId: "social", filename: "social-square.svg", role: "PRODUCT_ASSET", byteSize: 28000, downloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/assets/social` },
        { assetId: "zip", filename: "complete-production-package.zip", role: "FINAL_PRODUCTION_ZIP", byteSize: 1048576, downloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/assets/zip` },
      ],
    },
    shopify,
  };
}

function awaitingReplacementRecord() {
  return baseRecord({
    status: "awaiting-live-replacement-approval",
    replacement: {
      releaseId: "replacement-release-123",
      status: "awaiting-live-replacement-approval",
      confirmationRequired: "REPLACE LIVE PRODUCT FROM VAULT",
      productBefore: {
        id: "gid://shopify/Product/123",
        title: "AI Image Mastery™ — Existing Edition",
        handle: "ai-image-mastery",
        status: "ACTIVE",
        templateSuffix: "mmg-ai-image-mastery",
        updatedAt: "2026-07-22T20:00:00Z",
        price: "9.95",
      },
      desired: {
        title: "AI Image Mastery",
        handle: "ai-image-mastery",
        status: "ACTIVE",
        templateSuffix: "mmg-ai-image-mastery",
        price: "9.95",
      },
      assets: {
        cover: { filename: "approved-cover.png" },
        files: [{ filename: "product-hero.svg" }, { filename: "social-square.svg" }],
      },
    },
  });
}

function completedReplacementRecord() {
  return {
    ...awaitingReplacementRecord(),
    metadata: {
      ...awaitingReplacementRecord().metadata,
      publicationStatus: "ACTIVE",
      liveURL: "https://themindsetmediagroup.com/products/ai-image-mastery",
    },
    shopify: {
      ...awaitingReplacementRecord().shopify,
      status: "live-product-replaced-and-verified",
      replacement: {
        ...awaitingReplacementRecord().shopify.replacement,
        status: "live-product-replaced-and-verified",
        result: {
          product: { id: "gid://shopify/Product/123", handle: "ai-image-mastery", status: "ACTIVE", price: "9.95" },
          liveProbe: { ok: true, status: 200, finalURL: "https://themindsetmediagroup.com/products/ai-image-mastery" },
        },
        rollback: {
          mediaIds: ["gid://shopify/MediaImage/999"],
          fileIds: ["gid://shopify/GenericFile/888"],
          confirmationRequired: "ROLL BACK LIVE PRODUCT REPLACEMENT",
        },
      },
    },
  };
}

function rolledBackRecord() {
  return {
    ...completedReplacementRecord(),
    shopify: {
      ...completedReplacementRecord().shopify,
      status: "live-product-replacement-rolled-back-and-verified",
      replacement: {
        ...completedReplacementRecord().shopify.replacement,
        status: "live-product-replacement-rolled-back-and-verified",
      },
    },
  };
}

test("mobile flow protects an active product, then replaces and can roll it back through exact approvals", async ({ page }) => {
  const errors = [];
  const calls = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.route("https://kairos.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHTML() });
      return;
    }

    if (request.method() === "GET" && url.pathname === PIPELINE_PATH) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseRecord()) });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${PIPELINE_PATH}/shopify-draft`) {
      calls.push({ role: "draft", payload: JSON.parse(request.postData() || "{}") });
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          status: "failed",
          error: {
            code: "existing_live_product_protected",
            message: "A live Shopify product already uses this handle.",
          },
        }),
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${REPLACEMENT_PATH}/prepare`) {
      calls.push({ role: "prepare", payload: JSON.parse(request.postData() || "{}") });
      await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(awaitingReplacementRecord()) });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${REPLACEMENT_PATH}/execute`) {
      const payload = JSON.parse(request.postData() || "{}");
      calls.push({ role: "execute", payload });
      expect(payload.confirmation).toBe("REPLACE LIVE PRODUCT FROM VAULT");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(completedReplacementRecord()) });
      return;
    }

    if (request.method() === "POST" && url.pathname === `${REPLACEMENT_PATH}/rollback`) {
      const payload = JSON.parse(request.postData() || "{}");
      calls.push({ role: "rollback", payload });
      expect(payload.confirmation).toBe("ROLL BACK LIVE PRODUCT REPLACEMENT");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rolledBackRecord()) });
      return;
    }

    await route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ projectId }) => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({ workspace: "manuscript-studio", projectId }));
  }, { projectId: PROJECT_ID });
  await page.addScriptTag({ type: "module", content: controllerSource });

  await expect.poll(() => page.evaluate(() => window.KairosManuscriptAutoPipelineController?.ready)).toBe(true);
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Admin Asset Vault");
  await page.locator("[data-auto-shopify-draft]").tap();

  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Protected existing live product");
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("price, handle, active status, and digital-delivery associations remain intact");
  await expect(page.locator("[data-auto-live-replace]")).toBeVisible();
  expect(calls.some((call) => call.role === "draft")).toBe(true);
  expect(calls.some((call) => call.role === "prepare")).toBe(true);

  await page.locator("[data-auto-live-replace]").tap();
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Existing product updated and verified");
  await expect(page.locator("#manuscript-auto-pipeline a", { hasText: "Open Updated Live Product" })).toHaveAttribute(
    "href",
    "https://themindsetmediagroup.com/products/ai-image-mastery",
  );
  expect(calls.some((call) => call.role === "execute")).toBe(true);

  await page.locator("[data-auto-live-replacement-rollback]").tap();
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Prior live product restored and verified");
  expect(calls.some((call) => call.role === "rollback")).toBe(true);
  expect(errors).toEqual([]);
});
