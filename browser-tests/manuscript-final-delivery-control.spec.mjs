import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const controlSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-final-deliverable-engine.js", import.meta.url),
  "utf8",
);

const PROJECT_ID = "manuscript-final-delivery-control-test";
const BASE = `/api/production-registry/manuscripts/${PROJECT_ID}`;
const CONTRACT = "mmg-locked-five-asset-kdp-delivery-package-v1";
const FIVE = [
  ["GOLD_MASTER_DOCX", "Verified_Final_Package_Gold_Master.docx"],
  ["DIGITAL_ASSET_PDF", "Verified_Final_Package_Digital_Asset.pdf"],
  ["KDP_INTERIOR_PDF", "Verified_Final_Package_Interior.pdf"],
  ["KDP_FULL_WRAP_COVER_PDF", "Verified_Final_Package_Full_Wrap.pdf"],
  ["STANDALONE_COVER_IMAGE", "Verified_Final_Package_Cover.png"],
];

function html() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
    <div id="manuscript-studio-overlay"><div class="manuscript-result">
      <section><h3>Final files and delivery package</h3><p>queued</p></section>
      <section id="manuscript-editorial-workbench"><h3>Loading Editorial Workbench…</h3></section>
    </div></div>
  </body></html>`;
}

function completedBody() {
  return {
    packageContract: CONTRACT,
    deliverablesBuild: {
      id: "five-file-build-1",
      status: "COMPLETED",
      metadata: {
        workingTitle: "Verified Final Package",
        packageContract: CONTRACT,
        packageFileCount: 5,
      },
      artifacts: [
        ...FIVE.map(([kind, filename], index) => ({ kind, filename, byteSize: 1024 + index })),
        { kind: "ZIP_ARCHIVE", filename: "Verified_Final_Package_Complete_Delivery_Package.zip", byteSize: 8192 },
      ],
    },
  };
}

test("Produce Final Deliverable bypasses the old auto-pipeline and manufactures exactly five files", async ({ page }) => {
  const calls = { build: 0, autoPipeline: 0 };
  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "document") {
      return route.fulfill({ status: 200, contentType: "text/html", body: html() });
    }
    if (url.pathname.includes("/auto-pipeline")) {
      calls.autoPipeline += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "production-ready",
          vault: {
            packageDownloadURL: `${BASE}/deliverables/zip`,
            assets: Array.from({ length: 12 }, (_, index) => ({ filename: `retired-${index}.md` })),
          },
        }),
      });
    }
    if (request.method() === "POST" && url.pathname === `${BASE}/deliverables/build`) {
      calls.build += 1;
      const body = request.postDataJSON();
      expect(body.packageContract).toBe(CONTRACT);
      expect(body.replaceRetiredPackage).toBe(true);
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(completedBody()) });
    }
    if (request.method() === "GET" && url.pathname === `${BASE}/deliverables/build`) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(completedBody()) });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId }));
  }, { key: "kairos.production.active-workspace", projectId: PROJECT_ID });
  await page.addScriptTag({ content: controlSource });

  const control = page.locator("#kairos-final-delivery-control");
  await expect(control).toBeVisible();
  await control.getByRole("button", { name: /Produce Final Deliverable|Rebuild Five-File Package/ }).tap();
  await expect(control.getByRole("link", { name: "Download Complete Package" })).toBeVisible();
  await expect(control).toContainText("5 verified deliverables");
  await expect(page.locator("#manuscript-auto-pipeline article")).toHaveCount(5);
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Gold_Master.docx");
  await expect(page.locator("#manuscript-auto-pipeline")).toContainText("Cover.png");
  expect(calls.build).toBeGreaterThanOrEqual(1);
  expect(calls.autoPipeline).toBe(0);
});

test("Check Saved Package refuses a retired 12-artifact package", async ({ page }) => {
  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "document") {
      return route.fulfill({ status: 200, contentType: "text/html", body: html() });
    }
    if (request.method() === "GET" && url.pathname === `${BASE}/deliverables/build`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          packageContract: "canonical-12-artifact-manuscript-package-v1",
          deliverablesBuild: {
            status: "COMPLETED",
            metadata: { packageContract: "canonical-12-artifact-manuscript-package-v1" },
            artifacts: Array.from({ length: 12 }, (_, index) => ({ kind: `OLD_${index}`, filename: `old-${index}.md`, byteSize: 100 })),
          },
        }),
      });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId }));
  }, { key: "kairos.production.active-workspace", projectId: PROJECT_ID });
  await page.addScriptTag({ content: controlSource });
  const control = page.locator("#kairos-final-delivery-control");
  await control.getByRole("button", { name: "Check Saved Package" }).tap();
  await expect(control).toContainText("retired 12-artifact build");
  await expect(control.getByRole("link", { name: "Download Complete Package" })).toBeHidden();
});

test("final delivery control terminates in a visible retryable error", async ({ page }) => {
  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    if (request.resourceType() === "document") {
      return route.fulfill({ status: 200, contentType: "text/html", body: html() });
    }
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "forced package failure" } }) });
  });

  await page.goto("https://kairos.test/");
  await page.evaluate(({ key, projectId }) => {
    sessionStorage.setItem(key, JSON.stringify({ workspace: "manuscript-studio", projectId }));
  }, { key: "kairos.production.active-workspace", projectId: PROJECT_ID });
  await page.addScriptTag({ content: controlSource });
  const control = page.locator("#kairos-final-delivery-control");
  await control.getByRole("button", { name: "Produce Final Deliverable" }).tap();
  await expect(control).toContainText("Final package needs attention");
  await expect(page.locator("#manuscript-auto-pipeline").getByRole("button", { name: "Retry Final Deliverable" })).toBeEnabled();
});
