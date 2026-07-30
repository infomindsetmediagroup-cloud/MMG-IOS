import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";

const compatibilitySource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", import.meta.url),
  "utf8",
);
const docxHotfixSource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/manuscript-docx-upload-hotfix.js", import.meta.url),
  "utf8",
);

function docxFixture() {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Kairos native DOCX extraction works on iPhone Safari.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second paragraph</w:t><w:tab/><w:t>with a tab</w:t><w:br/><w:t>and a line break.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(relationships),
    "word/document.xml": strToU8(document),
  }, { level: 6 });
}

test("iPhone WebKit extracts DOCX text locally without loading a module service", async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ type: "module", content: compatibilitySource });

  await expect.poll(() => page.evaluate(() => window.KairosDocxExtractor?.ready)).toBe(true);
  const archive = Array.from(docxFixture());
  const result = await page.evaluate(async bytes => {
    const arrayBuffer = new Uint8Array(bytes).buffer;
    return window.KairosDocxExtractor.extractRawText({ arrayBuffer });
  }, archive);

  expect(result.local).toBe(true);
  expect(result.build).toBe("kairos-native-docx-extractor-20260730-1");
  expect(result.messages).toEqual([]);
  expect(result.value).toContain("Kairos native DOCX extraction works on iPhone Safari.");
  expect(result.value).toContain("Second paragraph\twith a tab\nand a line break.");
});

test("Safari compatibility exposes the native extractor to the existing DOCX intake handler", async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ type: "module", content: compatibilitySource });

  const evidence = await page.evaluate(() => ({
    primaryBuild: window.KairosDocxExtractor?.build,
    legacyBridgeBuild: window.__KAIROS_MAMMOTH_TEST_MODULE__?.build,
    sameExtractor: window.KairosDocxExtractor === window.__KAIROS_MAMMOTH_TEST_MODULE__,
  }));

  expect(evidence.primaryBuild).toBe("kairos-native-docx-extractor-20260730-1");
  expect(evidence.legacyBridgeBuild).toBe("kairos-native-docx-extractor-20260730-1");
  expect(evidence.sameExtractor).toBe(true);
  expect(compatibilitySource).not.toContain("cdn.jsdelivr.net");
  expect(compatibilitySource).not.toContain("esm.sh");
});

test("iPhone Safari rebuilds a retained DOCX source transaction after one HTTP 502", async ({ page }) => {
  const attempts = [];
  const restored = [];

  await page.route("https://kairos.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <input id="ms-title" value="AI Video Prompt Mastery">
          <input data-file type="file">
          <div class="manuscript-actions"><button type="button" data-advance>Continue to Production Intake</button></div>
        </body></html>`,
      });
      return;
    }

    if (request.method() === "POST" && /\/api\/production-registry\/manuscripts\/[^/]+\/source$/.test(url.pathname)) {
      const projectId = decodeURIComponent(url.pathname.split("/").at(-2));
      attempts.push({
        projectId,
        sourceAttempt: request.headers()["x-kairos-source-attempt"],
        recoveryCount: request.headers()["x-kairos-recovery-count"],
      });
      if (attempts.length === 1) {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          headers: { "cf-ray": "stale-source-transaction" },
          body: JSON.stringify({ error: { message: "The retained source transaction is unavailable." } }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "stored-and-verified",
          source: {
            projectId,
            filename: "AI-Video-Prompt-Mastery.docx",
            format: "docx",
            size: docxFixture().length,
            checksum: "recovered-source-checksum",
            stored: true,
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
  });

  await page.goto("https://kairos.test/?mode=advanced&open=manuscript");
  await page.evaluate(() => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId: "manuscript-studio-stale-source-12345678",
    }));
    window.__docxRestores = [];
    window.addEventListener("kairos:manuscript:restore", event => window.__docxRestores.push(event.detail));
  });
  await page.addScriptTag({ type: "module", content: compatibilitySource });
  await page.addScriptTag({ type: "module", content: docxHotfixSource });

  await expect.poll(() => page.evaluate(() => window.KairosManuscriptDocxHotfix?.sourceRecovery)).toBe(true);
  await page.locator("[data-file]").setInputFiles({
    name: "AI-Video-Prompt-Mastery.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(docxFixture()),
  });

  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[0]).toEqual({
    projectId: "manuscript-studio-stale-source-12345678",
    sourceAttempt: "1",
    recoveryCount: "0",
  });
  expect(attempts[1].projectId).not.toBe(attempts[0].projectId);
  expect(attempts[1].sourceAttempt).toBe("2");
  expect(attempts[1].recoveryCount).toBe("1");

  const evidence = await page.evaluate(() => ({
    active: JSON.parse(sessionStorage.getItem("kairos.production.active-workspace") || "{}"),
    restores: window.__docxRestores,
    errorCount: document.querySelectorAll("[data-docx-hotfix-error]").length,
  }));
  expect(evidence.active.projectId).toBe(attempts[1].projectId);
  expect(evidence.active.recoveryFrom).toBe(attempts[0].projectId);
  expect(evidence.active.recoveryStatus).toBe(502);
  expect(evidence.restores.at(-1).source.stored).toBe(true);
  expect(evidence.restores.at(-1).manuscript).toContain("Kairos native DOCX extraction works on iPhone Safari.");
  expect(evidence.errorCount).toBe(0);

  expect(docxHotfixSource).toContain("SOURCE_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000");
  expect(docxHotfixSource).toContain("TRANSIENT_SOURCE_STATUSES = new Set([502, 503, 504])");
  expect(docxHotfixSource).toContain("rotateProjectId(result.response.status)");
});
