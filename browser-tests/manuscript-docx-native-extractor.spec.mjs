import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";

const compatibilitySource = readFileSync(
  new URL("../web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", import.meta.url),
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
