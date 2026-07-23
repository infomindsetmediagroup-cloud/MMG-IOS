import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const controllerSource = readFileSync(new URL("../web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", import.meta.url), "utf8");
const PROJECT_ID = "manuscript-studio-auto-pipeline-12345678";
const PIPELINE_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/auto-pipeline`;
const APPROVAL_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/experience/approve-package`;

function fixtureHTML() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="manuscript-studio-overlay"><div class="manuscript-result"><section id="manuscript-project-setup" data-project-id="${PROJECT_ID}"><p class="eyebrow">Production assignment</p><h3>assigned-to-production</h3></section></div></div></body></html>`;
}

function productionReadyRecord(status = "production-ready", shopify = { status: "not-prepared" }) {
  return {
    status,
    projectId: PROJECT_ID,
    metadata: {
      title: "AI Image Mastery",
      subtitle: "A Practical Guide to Creating Better AI Images",
      author: "Mindset Media Group™",
      description: "A practical guide to creating better AI-generated images.",
      price: "9.95",
      currency: "USD",
      templateSuffix: "mmg-ai-image-mastery",
    },
    vault: {
      assetCount: 3,
      integrity: { passed: true, assetCount: 3 },
      packageDownloadURL: `/api/admin-asset-vault/projects/${PROJECT_ID}/package`,
      assets: [
        { assetId:"digital-edition", filename:"digital-asset-edition-v2.pdf", role:"CUSTOMER_DELIVERABLE", byteSize:24576, downloadURL:`/api/admin-asset-vault/projects/${PROJECT_ID}/assets/digital-edition` },
        { assetId:"approved-cover", filename:"cover-portrait-2048x3072.png", role:"APPROVED_COVER", byteSize:65536, downloadURL:`/api/admin-asset-vault/projects/${PROJECT_ID}/assets/approved-cover` },
        { assetId:"complete-package", filename:"complete-production-package.zip", role:"FINAL_PRODUCTION_ZIP", byteSize:1048576, downloadURL:`/api/admin-asset-vault/projects/${PROJECT_ID}/assets/complete-package` },
      ],
    },
    shopify,
  };
}

function draftRecord() {
  return productionReadyRecord("package-approved", {
    status: "draft-created-media-installed-awaiting-live-approval",
    publication: {
      status: "draft-created-delivery-attached-and-verified",
      previewURL: "https://example.myshopify.com/products/ai-image-mastery",
      customerDelivery: { status: "attached-and-verified" },
    },
    launch: { releaseId:"launch-release-123", requiredChecks:["Cover is correct","Product copy is correct"] },
  });
}

function liveRecord() {
  const record = productionReadyRecord("package-approved", {
    status: "product-live-and-verified",
    livePublication: { publication: { liveProbe: { finalURL:"https://themindsetmediagroup.com/products/ai-image-mastery" } } },
  });
  record.metadata.liveURL = "https://themindsetmediagroup.com/products/ai-image-mastery";
  return record;
}

test("mobile Manuscript Studio uses the canonical three approvals", async ({ page }) => {
  const errors = [];
  const calls = [];
  let buildRuns = 0;
  page.on("pageerror", error => errors.push(error.message));

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "document") return route.fulfill({ status:200, contentType:"text/html", body:fixtureHTML() });
    if (request.method() === "GET" && url.pathname === PIPELINE_PATH) return route.fulfill({ status:404, contentType:"application/json", body:JSON.stringify({ error:{ code:"auto_pipeline_not_started" } }) });
    if (request.method() === "POST" && url.pathname === `${PIPELINE_PATH}/run`) {
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.localInferenceBuild).toBe("kairos-local-inference-test");
      expect(payload.localInferenceModel).toBe("test-model");
      buildRuns += 1;
      calls.push("start");
      return route.fulfill({ status:201, contentType:"application/json", body:JSON.stringify(productionReadyRecord()) });
    }
    if (request.method() === "POST" && url.pathname === APPROVAL_PATH) {
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.confirmation).toBe("APPROVE PACKAGE");
      calls.push("approve-package");
      return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(productionReadyRecord("package-approved")) });
    }
    if (request.method() === "POST" && url.pathname === `${PIPELINE_PATH}/shopify-draft`) {
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.confirmation).toBe("CREATE SHOPIFY PRODUCT DRAFT");
      calls.push("preview-shopify");
      return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(draftRecord()) });
    }
    if (request.method() === "POST" && url.pathname === `${PIPELINE_PATH}/shopify-publish`) {
      const payload = JSON.parse(request.postData() || "{}");
      expect(payload.confirmation).toBe("PUBLISH PRODUCT LIVE");
      calls.push("publish");
      return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(liveRecord()) });
    }
    return route.fulfill({ status:404, body:"not found" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(projectId => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({ workspace:"manuscript-studio", projectId }));
    window.KairosLocalInference = Object.freeze({
      ready: true,
      build: "kairos-local-inference-test",
      async run({ onProgress } = {}) {
        onProgress?.("Local test inference complete");
        return {
          status: "local-inference-ready",
          build: "kairos-local-inference-test",
          model: "test-model",
          wordCount: 25_500,
          generatedSections: 4,
        };
      },
    });
  }, PROJECT_ID);
  await page.addScriptTag({ type:"module", content:controllerSource });

  await expect.poll(() => page.evaluate(() => window.KairosPublishingExperience?.ready === true)).toBe(true);
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Start a New Production Job");
  expect(buildRuns).toBe(0);

  await page.locator("[data-start-production]").tap();
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Package Preview");
  await expect(page.getByRole("link", { name:"Preview Package" })).toBeVisible();
  expect(buildRuns).toBe(1);

  await page.locator("[data-approve-package]").tap();
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Admin Asset Vault");
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Production Complete");

  await page.locator("[data-preview-shopify]").tap();
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Shopify Product Preview");
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Attached and verified");

  await page.locator("[data-publish-product]").tap();
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Published and verified");
  await expect(page.getByRole("link", { name:"View Live Product" })).toHaveAttribute("href", "https://themindsetmediagroup.com/products/ai-image-mastery");

  expect(calls).toEqual(["start","approve-package","preview-shopify","publish"]);
  expect(errors).toEqual([]);
});
