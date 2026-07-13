import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import {
  KAIROS_NATIVE_ENGINE_VERSION,
  analyzeBookIdea,
  researchBookIdea,
  buildPublishingArchitecture,
  composeChapter,
  editorialPass,
  buildPublicationRecord,
} from "../src/kairos-native-intelligence-engine-v1.js";
import { buildArtifact } from "../src/kairos-native-publishing-artifacts-v1.js";
import { buildCreationArtifact, creationArtifactNames } from "../src/kairos-creation-artifacts-v1.js";
import { buildProductPackage } from "../src/kairos-product-page-package-v1.js";
import { KairosProject } from "../src/kairos-native-publishing-worker-v1.js";
import { analyzeNativeObjective, buildNativeExecutionGraph } from "../src/kairos-native-kernel-v1.js";

const IDEA = "Write a practical book called The Creator Momentum System for creators who need a durable content system and a consistent way to finish meaningful work.";

test("idea acquisition starts native production without a manuscript or provider", () => {
  const analysis = analyzeBookIdea(IDEA);
  assert.equal(analysis.title, "The Creator Momentum System");
  assert.equal(analysis.manuscriptRequired, false);
  assert.equal(analysis.sourceAssetsRequired, false);
  assert.equal(analysis.engineVersion, KAIROS_NATIVE_ENGINE_VERSION);
});

test("native kernel routes a book objective across the required Kairos departments", () => {
  const objective = analyzeNativeObjective("Build a KDP-ready book from this idea without OpenAI and deliver the final ZIP.");
  const graph = buildNativeExecutionGraph(objective, "publishing");
  assert.equal(objective.route.primaryDepartment, "publishing");
  assert.equal(objective.constraints.includes("no-openai"), true);
  assert.equal(objective.externalInferenceAPI, false);
  assert.deepEqual(graph.steps.map(step => step.id), ["acquisition", "research", "architecture", "manuscript", "editorial", "design", "manufacturing", "qa", "preview", "packaging"]);
  assert.equal(graph.steps.find(step => step.id === "preview").requiresApproval, true);
});

test("native research adapters retrieve direct evidence without an inference API", async () => {
  const analysis = analyzeBookIdea(IDEA);
  const research = await researchBookIdea(analysis, mockResearchFetch);
  assert.equal(research.diagnostics.every(item => item.status === "completed"), true);
  assert.equal(research.sources.length, 4);
  assert.match(research.evidenceStandard, /no inference provider/i);
});

test("native manuscript composition and triple editorial pass meet the MMG long-form gate", async () => {
  const publication = await samplePublication();
  assert.equal(publication.chapters.length, 12);
  assert.equal(publication.quality.tripleEditorialPass, true);
  assert.equal(publication.quality.status, "passed");
  assert.ok(publication.wordCount >= 12_000);
  assert.ok(publication.wordCount <= 24_000);
  assert.ok(publication.pageCount >= 70);
  assert.ok(publication.pageCount <= 76);
  assert.equal(publication.chapters.every(chapter => chapter.editorialPasses === 3), true);
});

test("native manufacturing produces valid canonical publication artifacts", async () => {
  const publication = await samplePublication();
  const docx = await buildArtifact("gold-master.docx", publication);
  const interior = await buildArtifact("kdp-interior.pdf", publication);
  const wrap = await buildArtifact("kdp-full-wrap-cover.pdf", publication);
  const digital = await buildArtifact("digital-asset.pdf", publication);
  const cover = await buildArtifact("ebook-cover.png", publication);
  const packageBytes = await buildArtifact("production-package.zip", publication);

  assert.ok(unzipSync(docx)["word/document.xml"]);
  const interiorPageCount = (await PDFDocument.load(interior)).getPageCount();
  assert.ok(interiorPageCount >= 70);
  assert.ok(interiorPageCount <= 76);
  assert.equal((await PDFDocument.load(wrap)).getPageCount(), 1);
  assert.ok((await PDFDocument.load(digital)).getPageCount() > 20);
  assert.deepEqual([...cover.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const files = Object.keys(unzipSync(packageBytes));
  assert.equal(files.some(name => name.endsWith("Gold-Master.docx")), true);
  assert.equal(files.some(name => name.endsWith("KDP-Interior.pdf")), true);
  assert.equal(files.some(name => name.endsWith("KDP-Full-Wrap-Cover.pdf")), true);
  assert.equal(files.some(name => name.endsWith("eBook-Cover.png")), true);
  assert.equal(files.includes("production-manifest.json"), true);
});

test("persistent native project advances to cover approval and final delivery", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockResearchFetch;
  try {
    const storage = new MemoryStorage();
    const project = new KairosProject({ storage }, {});
    const createdResponse = await project.fetch(new Request("https://kairos.internal/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: "00000000-0000-4000-8000-000000000001", idea: IDEA }) }));
    const created = await createdResponse.json();
    assert.equal(created.status, "queued");
    assert.equal(created.manuscriptRequired, false);

    let current;
    for (let index = 0; index < 80; index += 1) {
      await project.alarm();
      current = await (await project.fetch(new Request("https://kairos.internal/status"))).json();
      if (["awaiting-cover-approval", "needs-attention"].includes(current.status)) break;
    }
    assert.equal(current.status, "awaiting-cover-approval");
    assert.equal(current.preview.approvalRequired, true);
    assert.equal(current.quality.tripleEditorialPass, true);

    const approval = await project.fetch(new Request("https://kairos.internal/cover-approval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved: true }) }));
    assert.equal(approval.status, 202);
    await project.alarm();
    const completed = await (await project.fetch(new Request("https://kairos.internal/status"))).json();
    assert.equal(completed.status, "completed");
    assert.equal(completed.artifacts.length, 19);
    assert.equal(completed.artifacts.some(item => item.name === "complete-production-package.zip"), true);
    assert.equal(completed.artifacts.some(item => item.name === "shopify-product-page.html"), true);
    assert.equal(completed.externalInferenceAPI, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("persistent publishing stages use the Kairos private runtime when configured", async () => {
  const originalFetch = globalThis.fetch;
  const privateRequests = [];
  globalThis.fetch = (url, init) => mockPrivateRuntimeFetch(url, init, privateRequests);
  try {
    const storage = new MemoryStorage();
    const project = new KairosProject({ storage }, { KAIROS_INFERENCE_URL: "https://kairos-gpu.example", KAIROS_INFERENCE_TOKEN: "private-test-key", KAIROS_MODEL: "Qwen/Qwen3.6-35B-A3B" });
    await project.fetch(new Request("https://kairos.internal/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: "00000000-0000-4000-8000-000000000002", idea: IDEA }) }));
    for (let index = 0; index < 10 && !(await storage.get("chapter:0")); index += 1) await project.alarm();
    const chapter = await storage.get("chapter:0");
    const job = await storage.get("job");
    assert.ok(chapter);
    assert.equal(chapter.generatedBy, "kairos-private-runtime-v1");
    assert.equal(job.selfHostedInference, "active");
    assert.equal(job.inferenceEvidence.length, 3);
    assert.equal(job.inferenceFailures.length, 0);
    assert.equal(privateRequests.length, 3);
    assert.equal(privateRequests.some(request => JSON.stringify(request).toLowerCase().includes("openai")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("approved-cover creation project auto-packages Shopify, EPUB, product assets, and the complete ZIP", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockResearchFetch;
  try {
    const cover = await buildArtifact("ebook-cover.png", await samplePublication());
    const storage = new MemoryStorage();
    const project = new KairosProject({ storage }, {});
    const createdResponse = await project.fetch(new Request("https://kairos.internal/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "00000000-0000-4000-8000-000000000003",
        idea: "Write a complete beginner-friendly book titled AI Prompts for Beginners and create its product page and assets.",
        creationType: "product_asset_copy",
        cover: { name: "AI-Prompts-for-Beginners.png", type: "image/png", dataBase64: Buffer.from(cover).toString("base64") },
      }),
    }));
    assert.equal(createdResponse.status, 202);
    let current;
    for (let index = 0; index < 90; index += 1) {
      await project.alarm();
      current = await (await project.fetch(new Request("https://kairos.internal/status"))).json();
      if (["completed", "needs-attention"].includes(current.status)) break;
    }
    assert.equal(current.status, "completed");
    assert.equal(current.coverProvided, true);
    assert.equal(current.preview.approvalRequired, false);
    assert.equal(current.preview.product.benefits.length, 5);
    assert.deepEqual(current.artifacts.map(item => item.name), creationArtifactNames({ type: "image/png" }));

    const approvedCover = new Uint8Array(await (await project.fetch(new Request("https://kairos.internal/artifacts/approved-cover.png"))).arrayBuffer());
    assert.deepEqual(approvedCover, cover);
    const productJSON = await (await project.fetch(new Request("https://kairos.internal/artifacts/product-package.json"))).json();
    assert.match(productJSON.valueProposition, /AI/i);
    const html = await (await project.fetch(new Request("https://kairos.internal/artifacts/shopify-product-page.html"))).text();
    assert.match(html, /What you will learn/);
    const epub = unzipSync(new Uint8Array(await (await project.fetch(new Request("https://kairos.internal/artifacts/ebook.epub"))).arrayBuffer()));
    assert.equal(new TextDecoder().decode(epub.mimetype), "application/epub+zip");
    assert.ok(epub["OEBPS/content.opf"]);
    const complete = unzipSync(new Uint8Array(await (await project.fetch(new Request("https://kairos.internal/artifacts/complete-production-package.zip"))).arrayBuffer()));
    assert.ok(complete["gold-master.docx"]);
    assert.ok(complete["shopify-product-page.html"]);
    assert.ok(complete["product-hero.svg"]);
    assert.ok(complete["approved-cover.png"]);
    assert.ok(complete["production-manifest.json"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("creation artifact builder publishes the complete deterministic file contract", async () => {
  const publication = await samplePublication();
  const product = buildProductPackage(publication);
  const html = await buildCreationArtifact("shopify-product-page.html", publication, product);
  const asset = await buildCreationArtifact("product-hero.svg", publication, product);
  assert.match(new TextDecoder().decode(html), /mmg-book-product/);
  assert.match(new TextDecoder().decode(asset), /approved-cover\.png/);
});

async function samplePublication() {
  const analysis = analyzeBookIdea(IDEA);
  const research = await researchBookIdea(analysis, mockResearchFetch);
  const architecture = buildPublishingArchitecture(analysis, research);
  const chapters = architecture.chapterPlan.map((_, index) => {
    let chapter = composeChapter(analysis, research, architecture, index);
    for (let pass = 1; pass <= 3; pass += 1) chapter = editorialPass(chapter, pass);
    return chapter;
  });
  return buildPublicationRecord({ projectId: "test-project", analysis, research, architecture, chapters, approval: { approved: true, decidedAt: new Date().toISOString() } });
}

async function mockResearchFetch(url) {
  const value = String(url);
  if (value.includes("wikipedia.org")) return Response.json({ query: { search: [{ title: "Creator economy", snippet: "A context record about independent creators." }] } });
  if (value.includes("openalex.org")) return Response.json({ results: [{ id: "https://openalex.org/W1", display_name: "Creative practice and consistency", publication_year: 2024, doi: "https://doi.org/10.0000/example" }] });
  if (value.includes("crossref.org")) return Response.json({ message: { items: [{ DOI: "10.0000/example2", title: ["Systems for sustained creative work"], URL: "https://doi.org/10.0000/example2", published: { "date-parts": [[2023]] } }] } });
  if (value.includes("openlibrary.org")) return Response.json({ docs: [{ key: "/works/OL1W", title: "The Practice of Creative Progress", author_name: ["Example Author"], first_publish_year: 2020 }] });
  return Response.json({}, { status: 404 });
}

class MemoryStorage {
  constructor() { this.values = new Map(); this.alarmAt = null; }
  async get(key) { return this.values.get(key); }
  async put(key, value) {
    if (typeof key === "object" && key !== null && value === undefined) for (const [entryKey, entryValue] of Object.entries(key)) this.values.set(entryKey, structuredClone(entryValue));
    else this.values.set(key, structuredClone(value));
  }
  async setAlarm(value) { this.alarmAt = value; }
}

async function mockPrivateRuntimeFetch(url, init, requests) {
  const value = String(url);
  if (!value.includes("kairos-gpu.example")) return mockResearchFetch(url);
  const request = JSON.parse(init?.body || "{}");
  requests.push(request);
  const system = String(request.messages?.[0]?.content || "");
  let text = "## Result\nCompleted by the private Kairos runtime.";
  if (/evidence map/i.test(system)) text = "## Evidence Map\nDirect records supplied to Kairos.\n\n## Themes\nDurable practice.\n\n## Limits\nNo unsupported claims.\n\n## Manuscript Guidance\nUse practical analysis.";
  else if (/editorial architecture/i.test(system)) text = "## Verdict\nThe sequence delivers the promise.\n\n## Risks\nAvoid duplication.\n\n## Recommended Adjustments\nMaintain progression.";
  else if (/one substantive beginner-friendly book chapter/i.test(system)) text = modelChapter();
  return Response.json({ choices: [{ message: { content: text } }], usage: { completion_tokens: 1600 } });
}

function modelChapter() {
  const headings = ["Core Principle", "Why It Matters", "A Practical Framework", "How to Apply It", "Common Failure Patterns", "MMG Tool", "Action Step", "Chapter Summary"];
  const sentence = "Kairos connects a defined outcome to disciplined action, direct evidence, useful review, and a practical next decision for the reader.";
  return headings.map(heading => `## ${heading}\n\n${Array.from({ length: 13 }, () => sentence).join(" ")}`).join("\n\n");
}
