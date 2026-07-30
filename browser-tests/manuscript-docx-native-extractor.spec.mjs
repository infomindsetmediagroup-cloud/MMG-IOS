import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
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

function docxFixture({ large = false } = {}) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="bin" ContentType="application/octet-stream"/>
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

  const entries = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(relationships),
    "word/document.xml": strToU8(document),
  };
  if (large) entries["word/media/source-payload.bin"] = new Uint8Array(randomBytes(900_000));
  return zipSync(entries, { level: large ? 0 : 6 });
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

test("iPhone Safari stores retained DOCX and manuscript text through verified raw chunks", async ({ page }) => {
  const requests = [];
  const restored = [];
  let uploadId = "";
  let firstFileChunkFailed = false;

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

    if (url.pathname.includes("/api/production-registry/manuscripts/")) {
      const bodyLength = request.postDataBuffer()?.length || 0;
      requests.push({
        method: request.method(),
        path: url.pathname,
        contentType: request.headers()["content-type"] || "",
        bodyLength,
        uploadId: request.headers()["x-kairos-upload-id"] || "",
      });

      if (request.method() === "POST" && url.pathname.endsWith("/source/session")) {
        const payload = request.postDataJSON();
        uploadId = payload.uploadId;
        expect(payload.fileChunks).toBeGreaterThan(1);
        expect(payload.textChunks).toBeGreaterThan(1);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ status: "upload-session-ready", upload: { uploadId, projectId: "manuscript-studio-chunked-12345678" } }),
        });
        return;
      }

      if (request.method() === "PUT" && /\/source\/file\/0$/.test(url.pathname) && !firstFileChunkFailed) {
        firstFileChunkFailed = true;
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          headers: { "cf-ray": "forced-file-chunk-retry" },
          body: JSON.stringify({ error: { message: "Transient chunk transport failure." } }),
        });
        return;
      }

      if (request.method() === "PUT" && /\/source\/(?:file|text-chunk)\/\d+$/.test(url.pathname)) {
        expect(request.headers()["x-kairos-upload-id"]).toBe(uploadId);
        expect(bodyLength).toBeGreaterThan(0);
        expect(bodyLength).toBeLessThanOrEqual(512 * 1024);
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "chunk-stored" }) });
        return;
      }

      if (request.method() === "POST" && url.pathname.endsWith("/source/commit")) {
        const projectId = decodeURIComponent(url.pathname.split("/").at(-3));
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            status: "stored-and-verified",
            source: {
              projectId,
              filename: "AI-Video-Prompt-Mastery.docx",
              format: "docx",
              size: docxFixture({ large: true }).length,
              checksum: "chunked-source-checksum",
              uploadMode: "chunked-v1",
              stored: true,
            },
          }),
        });
        return;
      }
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
  });

  await page.goto("https://kairos.test/?mode=advanced&open=manuscript");
  await page.evaluate(() => {
    sessionStorage.setItem("kairos.production.active-workspace", JSON.stringify({
      workspace: "manuscript-studio",
      projectId: "manuscript-studio-chunked-12345678",
    }));
    window.__docxRestores = [];
    window.addEventListener("kairos:manuscript:restore", event => window.__docxRestores.push(event.detail));
  });
  await page.addScriptTag({ type: "module", content: compatibilitySource });
  await page.evaluate(() => {
    window.__KAIROS_MAMMOTH_TEST_MODULE__ = {
      extractRawText: async () => ({
        value: "AI Video Prompt Mastery production manuscript. ".repeat(7000),
        messages: [],
      }),
    };
  });
  await page.addScriptTag({ type: "module", content: docxHotfixSource });

  await expect.poll(() => page.evaluate(() => window.KairosManuscriptDocxHotfix?.chunkedSourceUpload)).toBe(true);
  await page.locator("[data-file]").setInputFiles({
    name: "AI-Video-Prompt-Mastery.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(docxFixture({ large: true })),
  });

  await expect.poll(() => requests.filter(item => item.path.endsWith("/source/commit")).length, { timeout: 30_000 }).toBe(1);
  const evidence = await page.evaluate(() => ({
    restores: window.__docxRestores,
    errorCount: document.querySelectorAll("[data-docx-hotfix-error]").length,
    status: document.querySelector("[data-docx-hotfix-status]")?.textContent || "",
  }));

  expect(firstFileChunkFailed).toBe(true);
  expect(requests.filter(item => /\/source\/file\/0$/.test(item.path))).toHaveLength(2);
  expect(requests.some(item => item.path.includes("/source/file/"))).toBe(true);
  expect(requests.some(item => item.path.includes("/source/text-chunk/"))).toBe(true);
  expect(requests.every(item => !item.contentType.toLowerCase().includes("multipart/form-data"))).toBe(true);
  expect(evidence.restores.at(-1).source.stored).toBe(true);
  expect(evidence.restores.at(-1).source.uploadMode).toBe("chunked-v1");
  expect(evidence.errorCount).toBe(0);
  expect(evidence.status).toContain("stored and verified");

  expect(docxHotfixSource).toContain("FILE_CHUNK_BYTES = 512 * 1024");
  expect(docxHotfixSource).toContain("TEXT_CHUNK_BYTES = 128 * 1024");
  expect(docxHotfixSource).toContain("chunkedSourceUpload: true");
  expect(docxHotfixSource).not.toContain("new FormData");
});
