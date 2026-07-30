const BUILD = "kairos-local-inference-ui-20260730-4-local-only";
const WEBLLM_VERSION = "0.2.82";
const MODULE_URLS = Object.freeze([
  `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/+esm`,
  `https://esm.run/@mlc-ai/web-llm@${WEBLLM_VERSION}`,
]);
const STORE_CONFIRMATION = "STORE LOCAL INFERENCE";
const TARGET_WORDS = 25500;
const MAX_GENERATION_STEPS = 32;
const SOURCE_TARGET_WORDS = 1500;
const SOURCE_MAX_STEPS = 8;
const MODULE_TIMEOUT_MS = 45000;

let engine = null;
let selectedModel = "";
let moduleSource = "";
let diagnostics = Object.freeze({ build: BUILD, status: "idle", provider: "browser-webgpu", externalPaidAPIUsed: false });

async function generateSource({ projectId, title = "MMG Digital Asset", objective = "", onProgress = () => {} } = {}) {
  if (!projectId) throw new Error("Kairos could not identify the active project for local source generation.");
  const existing = await readExistingSource(projectId);
  if (existing) return { status: "source-ready", build: BUILD, existing: true, model: existing?.source?.localModel || null, ...existing };
  const normalizedObjective = String(objective || "").trim();
  if (normalizedObjective.length < 3) throw new Error("Kairos requires the approved objective before generating the authoritative source locally.");

  await prepareEngine(onProgress);
  const workingTitle = String(title || "MMG Digital Asset").trim().slice(0, 180) || "MMG Digital Asset";
  const focuses = [
    "final working title, intended audience, transformation promise, introduction, and core framework",
    "the main principles, decision rules, practical workflow, and concrete examples",
    "implementation steps, checklists, exercises, common failure patterns, and quality controls",
    "advanced application, repeatable operating procedure, conclusion, and production QA checklist",
    "additional practical examples and scenario-based application without unsupported facts",
    "implementation workbook material and measurable completion standards",
    "clarifications that remove ambiguity and strengthen customer usefulness",
    "final editorial continuity, conclusion, and concise production QA checklist",
  ];
  const sections = [];
  let words = 0;

  try {
    for (let step = 0; step < SOURCE_MAX_STEPS && words < SOURCE_TARGET_WORDS; step += 1) {
      onProgress(`Kairos is writing the authoritative source locally… section ${step + 1} of up to ${SOURCE_MAX_STEPS}`);
      const completion = await engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are Kairos Local Inference Model for Mindset Media Group. Create polished customer-facing digital-asset manuscript content using only the approved objective. Do not invent research statistics, citations, testimonials, customer results, guarantees, prices, publication status, private URLs, people, products, or external actions. Never mention the inference system, browser, GPU, production workflow, Shopify, or internal notes. Return only finished manuscript prose in Markdown.",
          },
          {
            role: "user",
            content: `WORKING TITLE: ${workingTitle}\nAPPROVED OBJECTIVE: ${normalizedObjective}\nSECTION ${step + 1} FOCUS: ${focuses[step]}\n\nWrite 500 to 800 words of substantive, non-repetitive manuscript content. Use clear Markdown headings and practical explanation. Keep every claim grounded in the objective. Return only the finished section.`,
          },
        ],
        temperature: 0.35,
        top_p: 0.85,
        repetition_penalty: 1.12,
        max_tokens: 1200,
      });
      const text = cleanOutput(completion?.choices?.[0]?.message?.content || "");
      const sectionWords = countWords(text);
      if (sectionWords < 180) throw new Error(`The local model returned an incomplete source section at step ${step + 1}.`);
      sections.push(text);
      words += sectionWords;
    }
  } catch (error) {
    engine = null;
    throw normalizeMobileLoadError(error, "local authoritative-source writing");
  }

  const manuscript = `# ${workingTitle}\n\n${sections.join("\n\n")}`.trim();
  if (countWords(manuscript) < SOURCE_TARGET_WORDS) {
    throw new Error(`Kairos local source generation stopped before the ${SOURCE_TARGET_WORDS}-word minimum was reached.`);
  }

  onProgress("Verifying and storing the local authoritative source…");
  const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source-text`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
    body: JSON.stringify({
      manuscript,
      title: workingTitle,
      filename: `${slug(workingTitle)}-authoritative-source.txt`,
      generatedLocally: true,
      provider: "browser-webgpu",
      model: selectedModel,
      externalPaidAPIUsed: false,
    }),
  });
  const stored = await readJSON(response);
  if (!response.ok) throw new Error(stored?.error?.message || "The locally generated authoritative source could not be stored.");
  diagnostics = Object.freeze({ ...diagnostics, status: "source-ready", moduleSource, selectedModel, sourceWordCount: countWords(manuscript) });
  return {
    status: "source-ready",
    build: BUILD,
    existing: false,
    provider: "browser-webgpu",
    externalPaidAPIUsed: false,
    model: selectedModel,
    wordCount: countWords(manuscript),
    stored,
  };
}

async function run({ projectId, onProgress = () => {} } = {}) {
  if (!projectId) throw new Error("Kairos could not identify the active manuscript project.");
  const existingInference = await readExistingInference(projectId);
  if (existingInference) return { status: "local-inference-ready", build: BUILD, existing: true, model: existingInference?.localInference?.model || "", stored: existingInference };

  onProgress("Loading authoritative manuscript…");
  const sourceResponse = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/text`, { credentials: "include", cache: "no-store" });
  const sourceBody = await readJSON(sourceResponse);
  if (!sourceResponse.ok) throw new Error(sourceBody?.error?.message || "The authoritative manuscript could not be loaded.");
  const source = String(sourceBody?.manuscript || "").trim();
  if (source.length < 500) throw new Error("The authoritative manuscript is too short for local inference.");

  await prepareEngine(onProgress);
  const sections = splitSections(source);
  const generated = [];
  let totalWords = countWords(source);
  let step = 0;

  try {
    while (totalWords < TARGET_WORDS && step < MAX_GENERATION_STEPS) {
      const section = sections[step % sections.length];
      const cycle = Math.floor(step / sections.length) + 1;
      onProgress(`Writing locally on this device… section ${step + 1} of up to ${MAX_GENERATION_STEPS}`);
      const completion = await engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are Kairos Local Inference Model, the source-grounded editorial engine for Mindset Media Group. Expand only from the supplied manuscript. Do not invent statistics, guarantees, legal claims, private URLs, citations, people, products, or events. Produce polished customer-facing instructional prose. Never mention the inference system, production workflow, Shopify, an asset vault, or internal notes.",
          },
          { role: "user", content: buildPrompt(section, cycle, step) },
        ],
        temperature: 0.35,
        top_p: 0.85,
        repetition_penalty: 1.12,
        max_tokens: 1450,
      });
      const text = cleanOutput(completion?.choices?.[0]?.message?.content || "");
      if (countWords(text) < 250) throw new Error(`The local model returned an incomplete section at step ${step + 1}.`);
      generated.push(`# Local Expansion ${step + 1}: ${section.title}\n\n${text}`);
      totalWords += countWords(text);
      step += 1;
    }
  } catch (error) {
    engine = null;
    throw normalizeMobileLoadError(error, "local writing");
  }

  const manuscript = `${source}\n\n# Expanded Digital Asset Edition\n\n${generated.join("\n\n")}`.trim();
  onProgress("Verifying and storing the local manuscript…");
  const storeResponse = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/local-inference`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
    body: JSON.stringify({
      confirmation: STORE_CONFIRMATION,
      manuscript,
      model: selectedModel,
      sourceChecksum: sourceBody?.source?.checksum || null,
      wordCount: countWords(manuscript),
      provider: "browser-webgpu",
      externalPaidAPIUsed: false,
    }),
  });
  const stored = await readJSON(storeResponse);
  if (!storeResponse.ok) throw new Error(stored?.error?.message || "The locally inferred manuscript could not be stored.");

  diagnostics = Object.freeze({ ...diagnostics, status: "ready", moduleSource, selectedModel, wordCount: countWords(manuscript) });
  return {
    status: "local-inference-ready",
    build: BUILD,
    existing: false,
    provider: "browser-webgpu",
    externalPaidAPIUsed: false,
    model: selectedModel,
    wordCount: countWords(manuscript),
    generatedSections: generated.length,
    stored,
  };
}

async function prepareEngine(onProgress) {
  if (globalThis.navigator?.onLine === false) throw new Error("This device is offline. Reconnect to Wi-Fi and retry local Kairos production.");
  if (!globalThis.navigator?.gpu) throw new Error("This device or browser does not expose WebGPU. Kairos local inference requires Safari 26 or another WebGPU-capable browser.");
  if (engine) return engine;
  onProgress("Checking Safari WebGPU and device storage…");
  const device = await inspectDevice();
  diagnostics = Object.freeze({ build: BUILD, status: "device-ready", provider: "browser-webgpu", externalPaidAPIUsed: false, ...device });
  let webllm;
  try {
    webllm = await loadWebLLM(onProgress);
  } catch (error) {
    throw normalizeMobileLoadError(error, "runtime download");
  }
  try {
    engine = await createCompatibleEngine(webllm, device, onProgress);
    return engine;
  } catch (error) {
    engine = null;
    selectedModel = "";
    throw normalizeMobileLoadError(error, "model download and initialization");
  }
}

async function readExistingSource(projectId) {
  const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/text`, { credentials: "include", cache: "no-store" });
  if (response.status === 404) return null;
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || "Kairos could not inspect the existing authoritative source.");
  return String(body?.manuscript || "").trim().length >= 500 ? body : null;
}

async function readExistingInference(projectId) {
  const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/local-inference`, { credentials: "include", cache: "no-store" });
  if (response.status === 404) return null;
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || "Kairos could not inspect existing local inference.");
  return body?.localInference?.provider === "browser-webgpu" && body?.localInference?.externalPaidAPIUsed === false ? body : null;
}

async function loadWebLLM(onProgress) {
  const failures = [];
  for (let index = 0; index < MODULE_URLS.length; index += 1) {
    const url = MODULE_URLS[index];
    onProgress(`Downloading the local inference runtime… source ${index + 1} of ${MODULE_URLS.length}`);
    try {
      const module = await withTimeout(import(url), MODULE_TIMEOUT_MS, "The local inference runtime download timed out.");
      if (typeof module?.CreateMLCEngine !== "function" || !module?.prebuiltAppConfig?.model_list) throw new Error("The downloaded runtime did not expose the required WebLLM interface.");
      moduleSource = url;
      return module;
    } catch (error) {
      failures.push(`${url}: ${String(error?.message || error)}`);
      await delay(500);
    }
  }
  throw new Error(`All local inference runtime sources failed. ${failures.join(" | ")}`);
}

async function createCompatibleEngine(webllm, device, onProgress) {
  const modelList = Array.isArray(webllm.prebuiltAppConfig?.model_list) ? webllm.prebuiltAppConfig.model_list : [];
  const candidates = chooseModels(modelList, device.shaderF16);
  if (!candidates.length) throw new Error("No compatible compact language model is available in the current WebLLM registry.");
  const failures = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const model = candidates[index];
    selectedModel = model;
    onProgress(`Loading local model ${index + 1} of ${candidates.length}…`);
    try {
      const created = await webllm.CreateMLCEngine(model, {
        appConfig: { ...webllm.prebuiltAppConfig, cacheBackend: "indexeddb" },
        logLevel: "INFO",
        initProgressCallback: (progress) => {
          const pct = Number.isFinite(progress?.progress) ? Math.round(progress.progress * 100) : null;
          onProgress(pct == null ? String(progress?.text || "Loading local model…") : `Loading local model… ${pct}%`);
        },
      });
      diagnostics = Object.freeze({ ...diagnostics, status: "model-ready", moduleSource, selectedModel: model });
      return created;
    } catch (error) {
      failures.push(`${model}: ${String(error?.message || error)}`);
      selectedModel = "";
      await delay(750);
    }
  }
  throw new Error(`Compatible model attempts failed. ${failures.join(" | ")}`);
}

function chooseModels(modelList, shaderF16) {
  const ids = modelList.map((item) => String(item?.model_id || "")).filter(Boolean);
  const preferences = shaderF16
    ? ["Qwen2.5-0.5B-Instruct-q4f16_1-MLC", "Qwen2-0.5B-Instruct-q4f16_1-MLC", "Qwen2.5-0.5B-Instruct-q4f32_1-MLC", "Qwen2-0.5B-Instruct-q4f32_1-MLC", "Llama-3.2-1B-Instruct-q4f16_1-MLC"]
    : ["Qwen2.5-0.5B-Instruct-q4f32_1-MLC", "Qwen2-0.5B-Instruct-q4f32_1-MLC", "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", "Qwen2-0.5B-Instruct-q4f16_1-MLC", "Llama-3.2-1B-Instruct-q4f32_1-MLC"];
  const ordered = [];
  for (const preferred of preferences) {
    const exact = ids.find((id) => id === preferred);
    if (exact && !ordered.includes(exact)) ordered.push(exact);
  }
  for (const id of ids) if (/0\.5B.*Instruct.*q4f(?:16|32)_1/i.test(id) && !ordered.includes(id)) ordered.push(id);
  return ordered.slice(0, 4);
}

async function inspectDevice() {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" }) || await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("Safari exposed WebGPU but could not create a GPU adapter. Close other memory-heavy tabs and retry.");
  let storage = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) storage = { quota: Number(estimate.quota || 0), usage: Number(estimate.usage || 0), available: Math.max(0, Number(estimate.quota || 0) - Number(estimate.usage || 0)) };
  } catch {}
  return { shaderF16: Boolean(adapter.features?.has?.("shader-f16")), maxStorageBufferBindingSize: Number(adapter.limits?.maxStorageBufferBindingSize || 0), storage, userAgent: navigator.userAgent };
}

function normalizeMobileLoadError(error, stage) {
  const raw = String(error?.message || error || "Unknown local inference failure.");
  diagnostics = Object.freeze({ ...diagnostics, status: "failed", stage, rawError: raw, moduleSource, selectedModel });
  if (/load failed|failed to fetch|networkerror|timed out|all local inference runtime sources failed/i.test(raw)) return new Error("Safari could not download the local AI runtime or model. Keep this page open on stable Wi-Fi, disable content blockers for this site, and retry. Your project remains saved.");
  if (/quota|storage|disk|not enough space|out of memory|memory/i.test(raw)) return new Error("The device does not have enough available storage or memory for the local model. Close other tabs, free device storage, reopen Kairos, and retry. Your project remains saved.");
  if (/device lost|gpu.*lost|external instance|adapter/i.test(raw)) return new Error("Safari lost access to the device GPU. Close other tabs, keep Kairos in the foreground, reload the page, and retry. Your project remains saved.");
  return new Error(`Local inference stopped during ${stage}: ${raw}`);
}

function splitSections(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/(?=^(?:#{1,3}\s+|Chapter\s+\d+|Introduction\b|Conclusion\b))/gim).map((value) => value.trim()).filter(Boolean);
  const source = blocks.length ? blocks : normalized.split(/\n{2,}/).filter(Boolean);
  return source.slice(0, 24).map((content, index) => {
    const first = content.split("\n").find(Boolean) || `Section ${index + 1}`;
    return { title: first.replace(/^#{1,3}\s+/, "").slice(0, 120), content: content.slice(0, 7000) };
  });
}

function buildPrompt(section, cycle, step) {
  const focus = ["core principle, practical workflow, and decision rules", "worked example, diagnostic method, and common failure patterns", "implementation workbook, checklist, and measurable completion standard", "advanced application, quality control, and repeatable operating procedure"][(cycle - 1) % 4];
  return `SOURCE SECTION TITLE: ${section.title}\nEXPANSION PASS: ${cycle}\nFOCUS: ${focus}\n\nSOURCE MATERIAL:\n${section.content}\n\nWrite 850 to 1150 words of new, non-repetitive, customer-facing instructional content grounded strictly in the source material. Use clear Markdown subheadings. Preserve the source's terminology, methods, examples, and practical intent. Add useful explanation and application, but do not add unsupported facts. This is expansion unit ${step + 1}; return only the finished content.`;
}

function cleanOutput(value) { return String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").replace(/\n{4,}/g, "\n\n\n").trim(); }
function slug(value) { return String(value || "mmg-digital-asset").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "mmg-digital-asset"; }
function withTimeout(promise, timeoutMs, message) { return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs))]); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function countWords(value) { return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length; }
async function readJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`); } }

window.KairosLocalInference = Object.freeze({
  ready: true,
  build: BUILD,
  provider: "browser-webgpu",
  externalPaidAPIUsed: false,
  generateSource,
  run,
  getModel: () => selectedModel,
  getDiagnostics: () => diagnostics,
});
