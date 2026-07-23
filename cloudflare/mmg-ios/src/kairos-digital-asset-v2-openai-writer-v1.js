import { normalizeApprovedCoverToPNG } from "./kairos-digital-asset-v2-manuscript-writer-v1.js";

export { normalizeApprovedCoverToPNG };
export const KAIROS_DIGITAL_ASSET_V2_WRITER_BUILD = "kairos-digital-asset-v2-openai-writer-20260723-1";

const DEFAULT_MODEL = "gpt-5";
const TARGET_CHAPTER_WORDS = 1125;
const MINIMUM_TOTAL_WORDS = 25_500;
const MAX_CHAPTERS = 30;
const CONCURRENCY = 3;
const OPENAI_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `You are the editorial writing engine for Mindset Media Group™. Rewrite and expand source material into a premium customer-facing operating manual. Preserve the source's meaning, examples, prompt formulas, and practical intent. Do not invent statistics, legal conclusions, platform guarantees, private URLs, internal workflow notes, storefront instructions, or individual author attribution. Do not mention Kairos, Shopify, production manifests, QA reports, or an individual person's name. Write polished instructional prose for the paying customer. Avoid filler, repeated conclusions, generic motivational padding, and duplicated paragraphs. Every chapter must teach a usable system.`;

export async function writeDigitalAssetEditionV2({ title, subtitle = "", manuscript = "", env }) {
  const source = sanitize(String(manuscript || ""));
  const sections = extractSections(source);
  const chapterSections = sections.filter((section) => /^Chapter\s+\d+/i.test(section.title)).slice(0, MAX_CHAPTERS);

  if (chapterSections.length < 8) {
    throw writerError("digital_asset_v2_source_structure_incomplete", "The source manuscript does not contain enough developed chapters for Digital Asset Edition V2 expansion.");
  }
  if (!env?.OPENAI_API_KEY) {
    throw writerError("digital_asset_v2_openai_key_required", "OPENAI_API_KEY is required for the zero-neuron Digital Asset Edition V2 writer.");
  }

  const expanded = await mapLimit(chapterSections, CONCURRENCY, (section, index) =>
    expandChapter({ title, subtitle, section, index, chapterCount: chapterSections.length, env }),
  );
  const expandedByTitle = new Map(expanded.map((section) => [canonical(section.title), section]));
  const assembled = sections.map((section) => expandedByTitle.get(canonical(section.title)) || preserveSection(section));

  let output = assembled.map(renderSection).join("\n\n").replace(/\n{4,}/g, "\n\n\n").trim();
  let wordCount = countWords(output);
  if (wordCount < MINIMUM_TOTAL_WORDS) {
    const supplements = await buildSupplements({ title, subtitle, chapterSections: expanded, deficit: MINIMUM_TOTAL_WORDS - wordCount, env });
    output = `${output}\n\n${supplements.map(renderSection).join("\n\n")}`.trim();
    wordCount = countWords(output);
  }
  if (wordCount < MINIMUM_TOTAL_WORDS) {
    throw writerError("digital_asset_v2_expansion_incomplete", `The V2 writing pass produced ${wordCount} words; at least ${MINIMUM_TOTAL_WORDS} source-grounded words are required.`);
  }

  return {
    text: output,
    wordCount,
    estimatedPages: Math.ceil(wordCount / 250),
    chapterCount: chapterSections.length,
    sectionCount: assembled.length,
    model: String(env.KAIROS_OPENAI_MODEL || DEFAULT_MODEL),
    provider: "openai-responses-api",
    cloudflareWorkersAIUsed: false,
    build: KAIROS_DIGITAL_ASSET_V2_WRITER_BUILD,
  };
}

async function expandChapter({ title, subtitle, section, index, chapterCount, env }) {
  const sourceWords = countWords(section.content);
  const target = Math.max(TARGET_CHAPTER_WORDS, sourceWords + 750);
  const prompt = `BOOK TITLE: ${title}\nSUBTITLE: ${subtitle || "None"}\nCHAPTER: ${section.title}\nCHAPTER POSITION: ${index + 1} of ${chapterCount}\nTARGET LENGTH: ${target} to ${target + 175} words.\n\nSOURCE CHAPTER:\n${section.content.slice(0, 9000)}\n\nRewrite this chapter as a complete Digital Asset Edition V2 chapter. Use these exact headings once each:\n## Core Principle\n## Why It Matters\n## Prompt Framework\n## Production Workflow\n## Worked Example\n## Common Failure Patterns\n## Practice Lab\n## Action Checklist\n## Chapter Summary\n\nBuild directly from the source, include concrete prompt language and decision rules, preserve original meaning, avoid unsupported facts, and return only the finished Markdown chapter body.`;
  let body = cleanModelOutput(await runOpenAI(env, prompt, 5000), section.title);
  if (countWords(body) < 850) {
    const continuation = await runOpenAI(env, `Add 450 to 650 non-repetitive words to this chapter, deepening the worked example, workflow, failure patterns, and practice lab. Return only added Markdown.\n\nCHAPTER: ${section.title}\n\nDRAFT:\n${body.slice(0, 12000)}`, 2500);
    body = `${body}\n\n## Extended Implementation Notes\n\n${cleanModelOutput(continuation, section.title)}`.trim();
  }
  if (section.content.trim()) body = `${body}\n\n## Source Prompt Examples and Original Notes\n\n${section.content.trim()}`;
  return { ...section, content: sanitize(body), generatedBy: KAIROS_DIGITAL_ASSET_V2_WRITER_BUILD, generatedAt: new Date().toISOString(), sourceWordCount: sourceWords, expandedWordCount: countWords(body) };
}

async function buildSupplements({ title, subtitle, chapterSections, deficit, env }) {
  const count = Math.min(4, Math.max(1, Math.ceil(deficit / 1400)));
  const summary = chapterSections.map((chapter) => chapter.title).join("; ");
  const names = [
    "Implementation Workbook — From Brief to Finished Visual",
    "Prompt Diagnostic Lab — Repairing Weak Outputs",
    "Visual Consistency System — Building a Reusable Style Language",
    "Commercial Production Lab — Campaign Planning and Quality Control",
  ];
  return mapLimit(Array.from({ length: count }, (_, index) => index), 2, async (index) => {
    const sectionTitle = names[index] || `Implementation Lab ${index + 1}`;
    const prompt = `BOOK TITLE: ${title}\nSUBTITLE: ${subtitle || "None"}\nEXISTING CHAPTERS: ${summary}\n\nWrite a 1300 to 1600-word customer-facing bonus section titled "${sectionTitle}". Synthesize only the book's existing methods. Include a framework, workflow, worksheet, diagnostic checklist, practice assignment, decision rules, and completion standard. Return only the Markdown body.`;
    return { title: `Bonus ${4 + index} — ${sectionTitle}`, content: sanitize(cleanModelOutput(await runOpenAI(env, prompt, 5500), sectionTitle)), kind: "supplement" };
  });
}

async function runOpenAI(env, userPrompt, maxOutputTokens) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "X-Client-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        model: String(env.KAIROS_OPENAI_MODEL || DEFAULT_MODEL),
        instructions: SYSTEM_PROMPT,
        input: userPrompt,
        max_output_tokens: maxOutputTokens,
        store: false,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}.`);
    const text = extractOutputText(payload);
    if (!text.trim()) throw new Error("OpenAI returned an empty chapter.");
    return text;
  } catch (error) {
    const message = error?.name === "AbortError" ? "The OpenAI writing request timed out." : (error instanceof Error ? error.message : "The OpenAI writing request failed.");
    throw writerError("digital_asset_v2_openai_failed", message);
  } finally {
    clearTimeout(timeout);
  }
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function extractSections(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const candidates = [];
  let current = { title: "Front Matter", content: [] };
  const heading = /^(Introduction(?:\s*[—:-].*)?|Chapter\s+\d+\s*[—:-].*|Conclusion(?:\s*[—:-].*)?|Bonus\s+\d+\s*[—:-].*|Closing(?:\s+Thoughts)?|Thank You)\s*$/i;
  const flush = () => { const content = current.content.join("\n").trim(); if (current.title !== "Front Matter" || content) candidates.push({ title: current.title.trim(), content }); };
  for (const raw of lines) { const line = raw.trim(); if (heading.test(line)) { flush(); current = { title: line, content: [] }; } else current.content.push(raw); }
  flush();
  const order = []; const best = new Map();
  for (const section of candidates) { if (section.title === "Front Matter") continue; const key = canonical(section.title); if (!best.has(key)) order.push(key); const previous = best.get(key); if (!previous || countWords(section.content) > countWords(previous.content)) best.set(key, section); }
  return order.map((key) => best.get(key)).filter((section) => section?.content?.trim());
}

function cleanModelOutput(value, title) { let text = String(value || "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim(); const escaped = String(title || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); if (escaped) text = text.replace(new RegExp(`^#{1,3}\\s*${escaped}\\s*`, "i"), "").trim(); return text; }
function preserveSection(section) { return { ...section, content: sanitize(section.content), generatedBy: "customer-source-preserved" }; }
function renderSection(section) { return `# ${sanitize(section.title)}\n\n${sanitize(section.content)}`.trim(); }
function canonical(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function sanitize(value) { return String(value == null ? "" : value).replace(/Michael\s+King/gi, "Mindset Media Group™").replace(/\bKairos\b/gi, "the production system").replace(/\bShopify\b/gi, "the customer platform").replace(/admin asset vault/gi, "customer library").replace(/production manifest/gi, "package record").replace(/qa report/gi, "quality review").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim(); }
function countWords(value) { return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length; }
async function mapLimit(items, limit, mapper) { const output = new Array(items.length); let cursor = 0; const workers = Array.from({ length: Math.min(limit, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; output[index] = await mapper(items[index], index); } }); await Promise.all(workers); return output; }
function writerError(code, message) { const error = new Error(message); error.code = code; error.status = 502; return error; }
