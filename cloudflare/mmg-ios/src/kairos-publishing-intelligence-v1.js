const BUILD = "kairos-publishing-intelligence-20260722-2";
const DEFAULT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

export async function runPublishingIntelligence(state, project, env = {}) {
  const artifact = project.artifacts.find((item) => item.kind === "NORMALIZED_MANUSCRIPT");
  if (!artifact) throw new PublishingIntelligenceError("normalized_manuscript_missing", "Normalized manuscript artifact is required.", false, true);

  const stored = await state.storage.get(artifact.storageKey);
  if (!stored) throw new PublishingIntelligenceError("normalized_manuscript_unavailable", "Normalized manuscript bytes are unavailable.", false, true);

  const text = decodeStoredText(stored);
  if (!text.trim()) throw new PublishingIntelligenceError("normalized_manuscript_empty", "Normalized manuscript contains no usable text.", true, false);

  const deterministic = inferDeterministicMetadata(text, project.metadata || {});
  const structure = analyzeStructure(text);
  const providerResult = await callGovernedProvider(env, text, deterministic, structure);
  const merged = mergeProviderResult(deterministic, providerResult?.output);
  const qa = buildEditorialQA(text, merged, structure, providerResult);
  const requiresHumanReview = qa.blockers.length > 0 || qa.score < 72 || merged.confidence < 0.72;

  const generatedAt = new Date().toISOString();
  const metadataRecord = {
    build: BUILD,
    generatedAt,
    metadata: merged,
    deterministic,
    provider: providerResult?.audit || { mode: "deterministic", invoked: false },
    confidence: merged.confidence,
    requiresHumanReview,
  };

  const editorialRecord = {
    build: BUILD,
    generatedAt,
    score: qa.score,
    grade: qa.grade,
    blockers: qa.blockers,
    warnings: qa.warnings,
    strengths: qa.strengths,
    structuralAssessment: structure,
    recommendations: qa.recommendations,
    requiresHumanReview,
  };

  const metadataArtifact = await storeJSONArtifact(state, project.id, "METADATA_INFERENCE", "metadata-inference.json", metadataRecord);
  const qaArtifact = await storeJSONArtifact(state, project.id, "QA_REPORT", "editorial-qa-report.json", editorialRecord);

  return {
    metadata: metadataRecord,
    editorial: editorialRecord,
    artifacts: [metadataArtifact, qaArtifact],
    requiresHumanReview,
  };
}

export function inferDeterministicMetadata(text, existing = {}) {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const headings = lines.filter((line) => /^#{1,3}\s+/.test(line)).map((line) => line.replace(/^#{1,3}\s+/, "").trim());
  const title = cleanTitle(existing.workingTitle || headings[0] || lines[0] || "Untitled Digital Guide");
  const subtitle = cleanOptional(existing.subtitle || inferSubtitle(lines, title));
  const author = cleanOptional(existing.author || inferAuthor(lines));
  const intendedAudience = cleanOptional(existing.intendedAudience || inferAudience(text));
  const productType = normalizeProductType(existing.productType || inferProductType(text, headings));
  const keywords = inferKeywords(text, title);
  const summary = summarizeDeterministically(text);

  let confidence = 0.55;
  if (existing.workingTitle || headings[0]) confidence += 0.12;
  if (author) confidence += 0.08;
  if (intendedAudience) confidence += 0.08;
  if (summary.length >= 80) confidence += 0.08;
  if (headings.length >= 2) confidence += 0.06;

  return {
    title,
    subtitle,
    author,
    intendedAudience,
    productType,
    keywords,
    summary,
    confidence: Math.min(0.95, Number(confidence.toFixed(2))),
    sources: {
      title: existing.workingTitle ? "project_metadata" : headings[0] ? "first_heading" : "first_line",
      author: existing.author ? "project_metadata" : author ? "manuscript_pattern" : "unresolved",
      audience: existing.intendedAudience ? "project_metadata" : intendedAudience ? "manuscript_heuristic" : "unresolved",
      productType: existing.productType ? "project_metadata" : "manuscript_heuristic",
    },
  };
}

export function analyzeStructure(text) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const paragraphs = normalized.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  const words = normalized.match(/[\p{L}\p{N}’'-]+/gu) || [];
  const headings = lines.filter((line) => /^#{1,6}\s+/.test(line.trim()));
  const listItems = lines.filter((line) => /^\s*(?:[-*+] |\d+[.)] )/.test(line));
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter((value) => value.trim().length > 0);
  const averageSentenceWords = sentences.length ? words.length / sentences.length : words.length;
  const averageParagraphWords = paragraphs.length ? words.length / paragraphs.length : words.length;
  const duplicateParagraphs = findDuplicateParagraphs(paragraphs);
  const veryLongParagraphs = paragraphs.filter((paragraph) => countWords(paragraph) > 220).length;
  const veryLongSentences = sentences.filter((sentence) => countWords(sentence) > 45).length;

  return {
    wordCount: words.length,
    characterCount: normalized.length,
    paragraphCount: paragraphs.length,
    headingCount: headings.length,
    listItemCount: listItems.length,
    sentenceCount: sentences.length,
    averageSentenceWords: Number(averageSentenceWords.toFixed(1)),
    averageParagraphWords: Number(averageParagraphWords.toFixed(1)),
    duplicateParagraphCount: duplicateParagraphs.length,
    duplicateParagraphSamples: duplicateParagraphs.slice(0, 5),
    veryLongParagraphCount: veryLongParagraphs,
    veryLongSentenceCount: veryLongSentences,
    hasTableOfContentsSignal: /table of contents|contents\s*$/im.test(normalized),
    hasIntroductionSignal: /(^|\n)#{0,3}\s*introduction\b/im.test(normalized),
    hasConclusionSignal: /(^|\n)#{0,3}\s*(conclusion|final thoughts|next steps)\b/im.test(normalized),
  };
}

export function buildEditorialQA(text, metadata, structure, providerResult = null) {
  const blockers = [];
  const warnings = [];
  const strengths = [];
  const recommendations = [];
  let score = 100;

  if (structure.wordCount < 300) {
    blockers.push("Manuscript is below 300 words and is not substantial enough for a commercial guide.");
    score -= 35;
  } else if (structure.wordCount < 1000) {
    warnings.push("Manuscript is short for a standalone commercial digital product.");
    score -= 12;
  } else {
    strengths.push("Manuscript has sufficient length for substantive review.");
  }

  if (!metadata.title || /^untitled/i.test(metadata.title)) {
    blockers.push("A reliable commercial title could not be established.");
    score -= 20;
  } else {
    strengths.push("A usable title is present.");
  }

  if (!metadata.author) {
    warnings.push("Author name remains unresolved.");
    score -= 6;
    recommendations.push("Confirm the final author credit before packaging.");
  }

  if (!metadata.intendedAudience) {
    warnings.push("Intended audience remains unresolved.");
    score -= 6;
    recommendations.push("Define the primary reader before final product positioning.");
  }

  if (structure.headingCount === 0 && structure.wordCount > 700) {
    warnings.push("No heading structure was detected in a long manuscript.");
    score -= 10;
    recommendations.push("Add descriptive section headings for navigation and readability.");
  } else if (structure.headingCount >= 2) {
    strengths.push("The manuscript has a navigable heading structure.");
  }

  if (structure.veryLongParagraphCount > 0) {
    warnings.push(`${structure.veryLongParagraphCount} paragraph(s) exceed 220 words.`);
    score -= Math.min(12, structure.veryLongParagraphCount * 3);
    recommendations.push("Break oversized paragraphs into focused, scannable units.");
  }

  if (structure.veryLongSentenceCount > 0) {
    warnings.push(`${structure.veryLongSentenceCount} sentence(s) exceed 45 words.`);
    score -= Math.min(10, structure.veryLongSentenceCount * 2);
    recommendations.push("Shorten long sentences where clarity is reduced.");
  }

  if (structure.duplicateParagraphCount > 0) {
    warnings.push(`${structure.duplicateParagraphCount} duplicated paragraph(s) were detected.`);
    score -= Math.min(15, structure.duplicateParagraphCount * 5);
    recommendations.push("Review duplicated passages before finalization.");
  }

  if (metadata.productType === "WORKBOOK" && structure.listItemCount === 0) {
    warnings.push("Workbook classification was inferred, but no exercises or list structure were detected.");
    score -= 8;
  }

  if (structure.averageSentenceWords <= 24) strengths.push("Average sentence length supports accessible reading.");
  if (structure.averageParagraphWords <= 130) strengths.push("Average paragraph length supports digital readability.");

  if (providerResult?.audit?.failed) {
    warnings.push("AI enrichment failed; deterministic metadata and QA were used.");
    score -= 2;
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    grade: score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F",
    blockers,
    warnings,
    strengths,
    recommendations: [...new Set(recommendations)],
  };
}

async function callGovernedProvider(env, text, deterministic, structure) {
  if (!env?.AI || typeof env.AI.run !== "function") {
    return { output: null, audit: { mode: "deterministic", invoked: false, reason: "provider_unavailable" } };
  }

  const model = String(env.KAIROS_WORKERS_AI_MODEL || DEFAULT_MODEL);
  const requestId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const excerpt = text.slice(0, 18000);
  const prompt = [
    "Return strict JSON only.",
    "Infer publishing metadata without inventing facts.",
    "Unknown fields must be null.",
    "Schema: {title, subtitle, author, intendedAudience, productType, keywords, summary, confidence}.",
    `Deterministic baseline: ${JSON.stringify(deterministic)}`,
    `Structure: ${JSON.stringify(structure)}`,
    `Manuscript excerpt:\n${excerpt}`,
  ].join("\n\n");

  try {
    const response = await env.AI.run(model, {
      messages: [
        { role: "system", content: "You are Kairos Publishing Intelligence. Preserve uncertainty and never fabricate author identity or claims." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 900,
    });
    const raw = String(response?.response || response?.result || response?.text || "");
    const output = parseProviderJSON(raw);
    return {
      output,
      audit: {
        mode: "workers-ai",
        invoked: true,
        provider: "cloudflare-workers-ai",
        model,
        requestId,
        startedAt,
        completedAt: new Date().toISOString(),
        inputCharacters: excerpt.length,
        outputAccepted: Boolean(output),
        failed: false,
      },
    };
  } catch (error) {
    return {
      output: null,
      audit: {
        mode: "deterministic-fallback",
        invoked: true,
        provider: "cloudflare-workers-ai",
        model,
        requestId,
        startedAt,
        completedAt: new Date().toISOString(),
        failed: true,
        errorCode: "provider_call_failed",
        errorMessage: error instanceof Error ? error.message : "AI provider call failed.",
      },
    };
  }
}

function mergeProviderResult(base, output) {
  if (!output || typeof output !== "object") return base;
  const confidence = clampNumber(output.confidence, 0, 1, base.confidence);
  return {
    ...base,
    title: cleanTitle(output.title || base.title),
    subtitle: cleanOptional(output.subtitle) || base.subtitle,
    author: cleanOptional(output.author) || base.author,
    intendedAudience: cleanOptional(output.intendedAudience) || base.intendedAudience,
    productType: normalizeProductType(output.productType || base.productType),
    keywords: normalizeKeywords(output.keywords, base.keywords),
    summary: cleanOptional(output.summary)?.slice(0, 1200) || base.summary,
    confidence: Number(confidence.toFixed(2)),
    enrichment: "governed-provider",
  };
}

async function storeJSONArtifact(state, projectId, kind, filename, payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const id = crypto.randomUUID();
  const storageKey = `publishing:artifact:${id}`;
  await state.storage.put(storageKey, bytes);
  return {
    id,
    projectId,
    kind,
    filename,
    mimeType: "application/json",
    byteSize: bytes.byteLength,
    sha256: await digestHex(bytes),
    storageKey,
    createdAt: new Date().toISOString(),
    immutable: true,
    build: BUILD,
  };
}

function inferSubtitle(lines, title) {
  const candidate = lines.find((line, index) => index > 0 && line !== title && line.length >= 12 && line.length <= 140);
  return candidate || null;
}

function inferAuthor(lines) {
  for (const line of lines.slice(0, 20)) {
    const match = line.match(/^(?:by|written by|author:)\s+(.{2,100})$/i);
    if (match) return match[1].trim();
  }
  return null;
}

function inferAudience(text) {
  const patterns = [
    /(?:this (?:book|guide|workbook) is for|designed for|written for)\s+([^.!?\n]{8,140})/i,
    /(?:whether you are|if you are)\s+([^.!?\n]{8,120})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function inferProductType(text, headings) {
  if (/workbook|worksheet|exercise|reflection prompt|journal prompt/i.test(text)) return "WORKBOOK";
  if (/step-by-step|how to|guide|roadmap|framework|playbook/i.test(`${headings.join(" ")} ${text.slice(0, 4000)}`)) return "GUIDE";
  if (/chapter\s+\d+|prologue|epilogue/i.test(text)) return "DIGITAL_BOOK";
  return "GUIDE";
}

function normalizeProductType(value) {
  const normalized = String(value || "GUIDE").toUpperCase().replace(/[ -]+/g, "_");
  return ["DIGITAL_BOOK", "GUIDE", "WORKBOOK", "OTHER"].includes(normalized) ? normalized : "OTHER";
}

function inferKeywords(text, title) {
  const stop = new Set(["this", "that", "with", "from", "your", "have", "will", "into", "about", "there", "their", "they", "them", "then", "than", "when", "what", "where", "which", "while", "were", "been", "being", "also", "more", "most", "some", "such", "only", "over", "under", "guide", "book", "chapter"]);
  const frequencies = new Map();
  for (const word of `${title} ${text}`.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) {
    if (stop.has(word)) continue;
    frequencies.set(word, (frequencies.get(word) || 0) + 1);
  }
  return [...frequencies.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([word]) => word);
}

function summarizeDeterministically(text) {
  const plain = text.replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").trim();
  const sentences = plain.split(/(?<=[.!?])\s+/).filter(Boolean);
  const selected = sentences.slice(0, 3).join(" ");
  return (selected || plain).slice(0, 900);
}

function parseProviderJSON(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const value = JSON.parse(cleaned);
    return value && typeof value === "object" ? value : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

function decodeStoredText(value) {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder("utf-8", { fatal: true }).decode(value);
  if (value instanceof ArrayBuffer) return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  throw new PublishingIntelligenceError("normalized_manuscript_invalid", "Normalized manuscript storage format is invalid.", false, true);
}

function cleanTitle(value) {
  const cleaned = String(value || "").replace(/^#{1,6}\s+/, "").replace(/\s+/g, " ").trim().slice(0, 180);
  return cleaned || "Untitled Digital Guide";
}

function cleanOptional(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function normalizeKeywords(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.map((item) => cleanOptional(item)?.toLowerCase()).filter(Boolean).slice(0, 12);
  return cleaned.length ? [...new Set(cleaned)] : fallback;
}

function findDuplicateParagraphs(paragraphs) {
  const seen = new Set();
  const duplicates = [];
  for (const paragraph of paragraphs) {
    const canonical = paragraph.toLowerCase().replace(/\s+/g, " ").trim();
    if (canonical.length < 60) continue;
    if (seen.has(canonical)) duplicates.push(paragraph.slice(0, 180));
    else seen.add(canonical);
  }
  return duplicates;
}

function countWords(value) {
  return (String(value).match(/[\p{L}\p{N}’'-]+/gu) || []).length;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export class PublishingIntelligenceError extends Error {
  constructor(code, message, requiresHumanReview = false, retryable = true) {
    super(message);
    this.name = "PublishingIntelligenceError";
    this.code = code;
    this.requiresHumanReview = requiresHumanReview;
    this.retryable = retryable;
  }
}
