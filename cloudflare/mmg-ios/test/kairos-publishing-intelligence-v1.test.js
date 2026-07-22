import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeStructure,
  buildEditorialQA,
  inferDeterministicMetadata,
  runPublishingIntelligence,
} from "../src/kairos-publishing-intelligence-v1.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) {
    const value = this.values.get(key);
    if (value instanceof Uint8Array) return new Uint8Array(value);
    return value === undefined ? undefined : structuredClone(value);
  }
  async put(key, value) {
    this.values.set(key, value instanceof Uint8Array ? new Uint8Array(value) : structuredClone(value));
  }
}

function state() { return { storage: new MemoryStorage() }; }
function longManuscript() {
  const sections = [];
  for (let index = 1; index <= 8; index += 1) {
    sections.push(`# Section ${index}\n\nThis practical guide helps creators build a repeatable publishing workflow with clear decisions, focused execution, quality control, and customer-ready deliverables. Each section explains a specific part of the process and gives the reader concrete next steps they can apply immediately. The objective is to reduce confusion, preserve source integrity, and move a useful idea into a complete digital product without skipping review or commercial preparation.`);
  }
  return `# The Publishing Workflow\n\nBy Michael King\n\nThis guide is designed for independent creators and first-time digital publishers.\n\n${sections.join("\n\n")}`;
}
function project() {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    metadata: {},
    artifacts: [{
      id: "normalized-1",
      projectId: "55555555-5555-4555-8555-555555555555",
      kind: "NORMALIZED_MANUSCRIPT",
      filename: "normalized-manuscript.md",
      mimeType: "text/markdown",
      byteSize: 10,
      sha256: "a".repeat(64),
      storageKey: "publishing:artifact:normalized-1",
      createdAt: "2026-07-22T00:00:00.000Z",
    }],
  };
}

test("deterministically infers title, author, audience, type, keywords, and summary", () => {
  const metadata = inferDeterministicMetadata(longManuscript(), {});
  assert.equal(metadata.title, "The Publishing Workflow");
  assert.equal(metadata.author, "Michael King");
  assert.match(metadata.intendedAudience, /independent creators/i);
  assert.equal(metadata.productType, "GUIDE");
  assert.ok(metadata.keywords.includes("publishing"));
  assert.ok(metadata.summary.length > 80);
  assert.ok(metadata.confidence >= 0.8);
});

test("structural QA identifies duplicate and oversized content", () => {
  const duplicate = "This repeated paragraph is intentionally long enough to trigger duplicate detection because it contains more than sixty characters and should not appear twice in a finished manuscript.";
  const text = `# Guide\n\n${duplicate}\n\n${duplicate}\n\n${"word ".repeat(230)}.`;
  const structure = analyzeStructure(text);
  const metadata = inferDeterministicMetadata(text, { workingTitle: "Guide", author: "Michael King" });
  const qa = buildEditorialQA(text, metadata, structure);
  assert.equal(structure.duplicateParagraphCount, 1);
  assert.equal(structure.veryLongParagraphCount, 1);
  assert.ok(qa.warnings.some((warning) => /duplicated paragraph/i.test(warning)));
  assert.ok(qa.warnings.some((warning) => /exceed 220 words/i.test(warning)));
  assert.ok(qa.score < 90);
});

test("stores governed metadata and QA artifacts without an AI provider", async () => {
  const durable = state();
  const sourceProject = project();
  await durable.storage.put(sourceProject.artifacts[0].storageKey, new TextEncoder().encode(longManuscript()));
  const result = await runPublishingIntelligence(durable, sourceProject, {});
  assert.equal(result.metadata.provider.mode, "deterministic");
  assert.equal(result.metadata.provider.invoked, false);
  assert.equal(result.requiresHumanReview, false);
  assert.equal(result.artifacts.length, 2);
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "METADATA_INFERENCE"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "QA_REPORT"));
  for (const artifact of result.artifacts) {
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.equal(artifact.immutable, true);
    assert.ok(await durable.storage.get(artifact.storageKey));
  }
});

test("uses governed provider enrichment and records an audit trail", async () => {
  const durable = state();
  const sourceProject = project();
  await durable.storage.put(sourceProject.artifacts[0].storageKey, new TextEncoder().encode(longManuscript()));
  const env = {
    KAIROS_WORKERS_AI_MODEL: "test-model",
    AI: {
      async run(model, payload) {
        assert.equal(model, "test-model");
        assert.equal(payload.temperature, 0.1);
        return { response: JSON.stringify({
          title: "The Publishing Workflow",
          subtitle: "A Practical System for Independent Creators",
          author: "Michael King",
          intendedAudience: "independent creators and first-time digital publishers",
          productType: "GUIDE",
          keywords: ["publishing", "creators", "workflow"],
          summary: "A practical guide to turning a source manuscript into a governed, customer-ready digital product.",
          confidence: 0.94,
        }) };
      },
    },
  };
  const result = await runPublishingIntelligence(durable, sourceProject, env);
  assert.equal(result.metadata.provider.mode, "workers-ai");
  assert.equal(result.metadata.provider.invoked, true);
  assert.equal(result.metadata.provider.outputAccepted, true);
  assert.equal(result.metadata.metadata.subtitle, "A Practical System for Independent Creators");
  assert.equal(result.metadata.metadata.confidence, 0.94);
});

test("falls back deterministically when the provider fails", async () => {
  const durable = state();
  const sourceProject = project();
  await durable.storage.put(sourceProject.artifacts[0].storageKey, new TextEncoder().encode(longManuscript()));
  const result = await runPublishingIntelligence(durable, sourceProject, {
    AI: { async run() { throw new Error("provider unavailable"); } },
  });
  assert.equal(result.metadata.provider.mode, "deterministic-fallback");
  assert.equal(result.metadata.provider.failed, true);
  assert.equal(result.metadata.metadata.title, "The Publishing Workflow");
  assert.ok(result.editorial.warnings.some((warning) => /AI enrichment failed/i.test(warning)));
});

test("requires review for short or commercially incomplete manuscripts", async () => {
  const durable = state();
  const sourceProject = project();
  await durable.storage.put(sourceProject.artifacts[0].storageKey, new TextEncoder().encode("# Note\n\nA very short note."));
  const result = await runPublishingIntelligence(durable, sourceProject, {});
  assert.equal(result.requiresHumanReview, true);
  assert.ok(result.editorial.blockers.some((blocker) => /below 300 words/i.test(blocker)));
  assert.ok(result.editorial.score < 72);
});
