export const KAIROS_DIGITAL_ASSET_V2_WRITER_BUILD = "kairos-digital-asset-v2-writer-20260722-1";

const DEFAULT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const TARGET_CHAPTER_WORDS = 1125;
const MINIMUM_TOTAL_WORDS = 25_500;
const MAX_CHAPTERS = 30;
const CONCURRENCY = 4;

const SYSTEM_PROMPT = `You are the editorial writing engine for Mindset Media Group™. Rewrite and expand source material into a premium customer-facing operating manual. Preserve the source's meaning, examples, prompt formulas, and practical intent. Do not invent statistics, legal conclusions, platform guarantees, private URLs, internal workflow notes, storefront instructions, or individual author attribution. Do not mention Kairos, Shopify, production manifests, QA reports, or an individual person's name. Write polished instructional prose for the paying customer. Avoid filler, repeated conclusions, generic motivational padding, and duplicated paragraphs. Every chapter must teach a usable system.`;

export async function writeDigitalAssetEditionV2({ title, subtitle = "", manuscript = "", env }) {
  const source = sanitize(String(manuscript || ""));
  const sections = extractSections(source);
  const chapterSections = sections.filter((section) => /^Chapter\s+\d+/i.test(section.title)).slice(0, MAX_CHAPTERS);

  if (chapterSections.length < 8) {
    throw writerError("digital_asset_v2_source_structure_incomplete", "The source manuscript does not contain enough developed chapters for Digital Asset Edition V2 expansion.");
  }
  if (!env?.AI || typeof env.AI.run !== "function") {
    throw writerError("digital_asset_v2_ai_binding_required", "The Workers AI binding is required to rewrite and expand the manuscript to Digital Asset Edition V2.");
  }

  const expanded = await mapLimit(chapterSections, CONCURRENCY, async (section, index) => {
    return expandChapter({ title, subtitle, section, index, chapterCount: chapterSections.length, env });
  });
  const expandedByTitle = new Map(expanded.map((section) => [canonical(section.title), section]));

  const assembled = sections.map((section) => {
    const replacement = expandedByTitle.get(canonical(section.title));
    return replacement || preserveSection(section);
  });

  let output = assembled.map(renderSection).join("\n\n").replace(/\n{4,}/g, "\n\n\n").trim();
  let wordCount = countWords(output);

  if (wordCount < MINIMUM_TOTAL_WORDS) {
    const deficit = MINIMUM_TOTAL_WORDS - wordCount;
    const supplements = await buildSupplements({ title, subtitle, chapterSections: expanded, deficit, env });
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
    model: String(env.KAIROS_WORKERS_AI_MODEL || DEFAULT_MODEL),
    build: KAIROS_DIGITAL_ASSET_V2_WRITER_BUILD,
  };
}

export async function normalizeApprovedCoverToPNG(cover = {}, env) {
  const type = String(cover?.type || "").split(";", 1)[0].toLowerCase();
  if (type === "image/png") return cover;
  if (type !== "image/jpeg") throw writerError("digital_asset_v2_cover_type_invalid", "The approved cover must be a PNG or JPEG image.");
  if (!env?.IMAGES || typeof env.IMAGES.input !== "function") {
    throw writerError("digital_asset_v2_images_binding_required", "The Images binding is required to convert the approved JPEG cover into the canonical PNG source.");
  }

  const bytes = decodeBase64(String(cover?.dataBase64 || "").replace(/^data:image\/jpeg;base64,/i, "").replace(/\s+/g, ""));
  const sourceStream = new Response(bytes).body;
  const transformed = await env.IMAGES
    .input(sourceStream)
    .output({ format: "image/png" });
  const response = transformed.response();
  if (!response.ok) throw writerError("digital_asset_v2_cover_conversion_failed", `The approved cover could not be converted to PNG (${response.status}).`);
  const png = new Uint8Array(await response.arrayBuffer());
  if (!isPNG(png)) throw writerError("digital_asset_v2_cover_conversion_invalid", "The converted cover did not produce a valid PNG image.");
  return {
    type: "image/png",
    dataBase64: bytesToBase64(png),
    normalizedFrom: "image/jpeg",
    customerFacing: true,
    croppingAllowed: false,
    redrawingAllowed: false,
  };
}

async function expandChapter({ title, subtitle, section, index, chapterCount, env }) {
  const sourceWords = countWords(section.content);
  const target = Math.max(TARGET_CHAPTER_WORDS, sourceWords + 750);
  const prompt = `BOOK TITLE: ${title}\nSUBTITLE: ${subtitle || "None"}\nCHAPTER: ${section.title}\nCHAPTER POSITION: ${index + 1} of ${chapterCount}\nTARGET LENGTH: ${target} to ${target + 175} words of substantive customer-facing content.\n\nSOURCE CHAPTER:\n${section.content.slice(0, 9000)}\n\nRewrite this chapter as a complete Digital Asset Edition V2 chapter. Use these exact instructional headings once each:\n## Core Principle\n## Why It Matters\n## Prompt Framework\n## Production Workflow\n## Worked Example\n## Common Failure Patterns\n## Practice Lab\n## Action Checklist\n## Chapter Summary\n\nRequirements:\n- Build directly from the source chapter; do not drift into unrelated topics.\n- Explain the reasoning behind the techniques without exposing private chain-of-thought.\n- Include concrete prompt language, visual direction, decision rules, and a realistic worked example.\n- Make the practice lab and checklist directly usable.\n- Do not repeat the source passage verbatim; the original source material will be preserved separately.\n- Do not include a chapter title, author line, preface, closing thank-you, or notes to the editor.\n- Return only the finished chapter body in Markdown.`;

  let body = await runModel(env, prompt, 2600, 0.45, 1.12);
  body = cleanModelOutput(body, section.title);

  if (countWords(body) < 850) {
    const continuation = await runModel(env, `Expand the following customer chapter with 450 to 650 additional non-repetitive words. Add depth primarily to the worked example, production workflow, failure patterns, and practice lab. Return only the added Markdown content and do not restate existing paragraphs.\n\nCHAPTER: ${section.title}\n\nEXISTING DRAFT:\n${body.slice(0, 11000)}`, 1400, 0.42, 1.15);
    body = `${body}\n\n## Extended Implementation Notes\n\n${cleanModelOutput(continuation, section.title)}`.trim();
  }

  const original = section.content.trim();
  if (original) {
    body = `${body}\n\n## Source Prompt Examples and Original Notes\n\n${original}`;
  }

  return {
    ...section,
    content: sanitize(body),
    generatedBy: KAIROS_DIGITAL_ASSET_V2_WRITER_BUILD,
    generatedAt: new Date().toISOString(),
    sourceWordCount: sourceWords,
    expandedWordCount: countWords(body),
  };
}

async function buildSupplements({ title, subtitle, chapterSections, deficit, env }) {
  const supplementCount = Math.min(4, Math.max(1, Math.ceil(deficit / 1400)));
  const chapterSummary = chapterSections.map((chapter) => chapter.title).join("; ");
  return mapLimit(Array.from({ length: supplementCount }, (_, index) => index), 2, async (index) => {
    const names = [
      "Implementation Workbook — From Brief to Finished Visual",
      "Prompt Diagnostic Lab — Repairing Weak Outputs",
      "Visual Consistency System — Building a Reusable Style Language",
      "Commercial Production Lab — Campaign Planning and Quality Control",
    ];
    const sectionTitle = names[index] || `Implementation Lab ${index + 1}`;
    const prompt = `BOOK TITLE: ${title}\nSUBTITLE: ${subtitle || "None"}\nEXISTING CHAPTERS: ${chapterSummary}\n\nWrite a ${1300 + index * 100} to ${1550 + index * 100}-word customer-facing bonus section titled "${sectionTitle}". It must synthesize and apply the book's existing AI image prompting methods without introducing unsupported external facts. Include a repeatable framework, a step-by-step workflow, a worksheet or template, a diagnostic checklist, a practice assignment, decision rules, and a completion standard. Avoid repeating chapter summaries or generic encouragement. Return only the section body in Markdown, without the title.`;
    const content = cleanModelOutput(await runModel(env, prompt, 2800, 0.42, 1.15), sectionTitle);
    return { title: `Bonus ${4 + index} — ${sectionTitle}`, content: sanitize(content), kind: "supplement" };
  });
}

async function runModel(env, userPrompt, maxTokens, temperature, repetitionPenalty) {
  const model = String(env.KAIROS_WORKERS_AI_MODEL || DEFAULT_MODEL);
  let response;
  try {
    response = await env.AI.run(model, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
      top_p: 0.86,
      repetition_penalty: repetitionPenalty,
      frequency_penalty: 0.18,
      presence_penalty: 0.08,
    });
  } catch (error) {
    throw writerError("digital_asset_v2_model_failed", error instanceof Error ? error.message : "The V2 writing model failed.");
  }
  const content = extractModelText(response);
  if (!content.trim()) throw writerError("digital_asset_v2_model_empty", "The V2 writing model returned an empty chapter.");
  return content;
}

function extractModelText(response) {
  if (typeof response === "string") return response;
  if (typeof response?.response === "string") return response.response;
  if (typeof response?.result?.response === "string") return response.result.response;
  const choice = Array.isArray(response?.choices) ? response.choices[0] : null;
  if (typeof choice?.message?.content === "string") return choice.message.content;
  if (typeof choice?.text === "string") return choice.text;
  return "";
}

function cleanModelOutput(value, title) {
  let text = String(value || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const escaped = String(title || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (escaped) text = text.replace(new RegExp(`^#{1,3}\\s*${escaped}\\s*`, "i"), "").trim();
  return text;
}

function extractSections(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const candidates = [];
  let current = { title: "Front Matter", content: [] };
  const heading = /^(Introduction(?:\s*[—:-].*)?|Chapter\s+\d+\s*[—:-].*|Conclusion(?:\s*[—:-].*)?|Bonus\s+\d+\s*[—:-].*|Closing(?:\s+Thoughts)?|Thank You)\s*$/i;

  const flush = () => {
    const content = current.content.join("\n").trim();
    if (current.title !== "Front Matter" || content) candidates.push({ title: current.title.trim(), content });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (heading.test(line)) {
      flush();
      current = { title: line, content: [] };
    } else current.content.push(raw);
  }
  flush();

  const order = [];
  const best = new Map();
  for (const section of candidates) {
    if (section.title === "Front Matter") continue;
    const key = canonical(section.title);
    if (!best.has(key)) order.push(key);
    const previous = best.get(key);
    if (!previous || countWords(section.content) > countWords(previous.content)) best.set(key, section);
  }
  return order.map((key) => best.get(key)).filter((section) => section && section.content.trim());
}

function preserveSection(section) {
  return { ...section, content: sanitize(section.content), generatedBy: "customer-source-preserved" };
}

function renderSection(section) {
  return `# ${sanitize(section.title)}\n\n${sanitize(section.content)}`.trim();
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function canonical(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sanitize(value) {
  return String(value == null ? "" : value)
    .replace(/Michael\s+King/gi, "Mindset Media Group™")
    .replace(/\bKairos\b/gi, "the production system")
    .replace(/\bShopify\b/gi, "the customer platform")
    .replace(/admin asset vault/gi, "customer library")
    .replace(/production manifest/gi, "package record")
    .replace(/qa report/gi, "quality review")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function countWords(value) {
  return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length;
}

function decodeBase64(value) {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunk)));
  return btoa(binary);
}

function isPNG(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function writerError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  return error;
}
