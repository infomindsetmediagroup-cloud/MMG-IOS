import * as webllm from "../vendor/webllm-bundle.js";

const BUILD = "kairos-local-inference-ui-20260724-4-same-origin";
const STORE_CONFIRMATION = "STORE LOCAL INFERENCE";
const TARGET_WORDS = 25500;
const MAX_GENERATION_STEPS = 32;
const MODEL_PREFERENCES_F16 = [
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
  "Qwen2-0.5B-Instruct-q4f32_1-MLC",
];
const MODEL_PREFERENCES_F32 = [
  "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
  "Qwen2-0.5B-Instruct-q4f32_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2-0.5B-Instruct-q4f16_1-MLC",
];

let engine = null;
let selectedModel = "";
let diagnostics = Object.freeze({ build: BUILD, status: "idle", moduleSource: "same-origin" });

async function run({ projectId, onProgress = () => {} } = {}) {
  if (!projectId) throw new Error("Kairos could not identify the active manuscript project.");
  if (navigator.onLine === false) throw new Error("This device is offline. Reconnect to Wi-Fi and tap Start Production Job again.");
  if (!navigator.gpu) throw new Error("This device or browser does not expose WebGPU. Kairos local inference requires Safari 26 or another WebGPU-capable browser.");

  onProgress("Loading authoritative manuscript…");
  const sourceResponse = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/text`, { credentials: "include", cache: "no-store" });
  const sourceBody = await readJSON(sourceResponse);
  if (!sourceResponse.ok) throw new Error(sourceBody?.error?.message || "The authoritative manuscript could not be loaded.");
  const source = String(sourceBody?.manuscript || "").trim();
  if (source.length < 500) throw new Error("The authoritative manuscript is too short for local inference.");

  onProgress("Checking Safari WebGPU and device storage…");
  const device = await inspectDevice();
  diagnostics = Object.freeze({ build: BUILD, status: "device-ready", moduleSource: "same-origin", ...device });

  if (typeof webllm.CreateMLCEngine !== "function" || !Array.isArray(webllm.prebuiltAppConfig?.model_list)) {
    throw new Error("Kairos loaded an invalid local inference runtime bundle.");
  }

  try {
    if (!engine) engine = await createCompatibleEngine(device, onProgress);
  } catch (error) {
    engine = null;
    selectedModel = "";
    throw normalizeError(error, "model download and initialization");
  }

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
          { role: "system", content: "You are Kairos Local Inference Model, the source-grounded editorial engine for Mindset Media Group. Expand only from the supplied manuscript. Do not invent statistics, guarantees, legal claims, private URLs, citations, people, products, or events. Produce polished customer-facing instructional prose. Never mention the inference system, production workflow, Shopify, an asset vault, or internal notes." },
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
    throw normalizeError(error, "local writing");
  }

  const manuscript = `${source}\n\n# Expanded Digital Asset Edition\n\n${generated.join("\n\n")}`.trim();
  onProgress("Verifying and storing the local manuscript…");
  const response = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/local-inference`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
    body: JSON.stringify({ confirmation: STORE_CONFIRMATION, manuscript, model: selectedModel, sourceChecksum: sourceBody?.source?.checksum || null, wordCount: countWords(manuscript) }),
  });
  const stored = await readJSON(response);
  if (!response.ok) throw new Error(stored?.error?.message || "The locally inferred manuscript could not be stored.");

  diagnostics = Object.freeze({ ...diagnostics, status: "ready", selectedModel, wordCount: countWords(manuscript) });
  return { status: "local-inference-ready", build: BUILD, model: selectedModel, wordCount: countWords(manuscript), generatedSections: generated.length, stored };
}

async function createCompatibleEngine(device, onProgress) {
  const ids = webllm.prebuiltAppConfig.model_list.map(item => String(item?.model_id || "")).filter(Boolean);
  const preferences = device.shaderF16 ? MODEL_PREFERENCES_F16 : MODEL_PREFERENCES_F32;
  const candidates = preferences.filter(id => ids.includes(id));
  if (!candidates.length) throw new Error("No compatible compact language model is available in the bundled WebLLM registry.");
  const failures = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const model = candidates[index];
    selectedModel = model;
    onProgress(`Loading local model ${index + 1} of ${candidates.length}…`);
    try {
      const created = await webllm.CreateMLCEngine(model, {
        appConfig: { ...webllm.prebuiltAppConfig, cacheBackend: "indexeddb" },
        logLevel: "INFO",
        initProgressCallback: progress => {
          const pct = Number.isFinite(progress?.progress) ? Math.round(progress.progress * 100) : null;
          onProgress(pct == null ? String(progress?.text || "Loading local model…") : `Loading local model… ${pct}%`);
        },
      });
      diagnostics = Object.freeze({ ...diagnostics, status: "model-ready", selectedModel: model });
      return created;
    } catch (error) {
      failures.push(`${model}: ${String(error?.message || error)}`);
      selectedModel = "";
    }
  }
  throw new Error(`Compatible model attempts failed. ${failures.join(" | ")}`);
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

function normalizeError(error, stage) {
  const raw = String(error?.message || error || "Unknown local inference failure.");
  diagnostics = Object.freeze({ ...diagnostics, status: "failed", stage, rawError: raw, selectedModel });
  if (/load failed|failed to fetch|networkerror|timed out/i.test(raw)) return new Error("Safari could not download the local model files. Keep Kairos open on stable Wi-Fi and tap Start Production Job again. The runtime itself is now delivered by Kairos, and your manuscript and cover remain saved.");
  if (/quota|storage|disk|out of memory|memory/i.test(raw)) return new Error("The device does not have enough storage or memory for the local model. Close other tabs, free storage, reopen Kairos, and retry. Your manuscript and cover remain saved.");
  if (/device lost|gpu.*lost|adapter/i.test(raw)) return new Error("Safari lost access to the device GPU. Close other tabs, keep Kairos in the foreground, reload, and retry. Your manuscript and cover remain saved.");
  return new Error(`Local inference stopped during ${stage}: ${raw}`);
}

function splitSections(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/(?=^(?:#{1,3}\s+|Chapter\s+\d+|Introduction\b|Conclusion\b))/gim).map(value => value.trim()).filter(Boolean);
  const source = blocks.length ? blocks : normalized.split(/\n{2,}/).filter(Boolean);
  return source.slice(0, 24).map((content, index) => ({ title: (content.split("\n").find(Boolean) || `Section ${index + 1}`).replace(/^#{1,3}\s+/, "").slice(0, 120), content: content.slice(0, 7000) }));
}

function buildPrompt(section, cycle, step) {
  const focus = ["core principle, practical workflow, and decision rules", "worked example, diagnostic method, and common failure patterns", "implementation workbook, checklist, and measurable completion standard", "advanced application, quality control, and repeatable operating procedure"][(cycle - 1) % 4];
  return `SOURCE SECTION TITLE: ${section.title}\nEXPANSION PASS: ${cycle}\nFOCUS: ${focus}\n\nSOURCE MATERIAL:\n${section.content}\n\nWrite 850 to 1150 words of new, non-repetitive, customer-facing instructional content grounded strictly in the source material. Use clear Markdown subheadings. Preserve the source terminology, methods, examples, and practical intent. Add useful explanation and application, but do not add unsupported facts. This is expansion unit ${step + 1}; return only the finished content.`;
}

function cleanOutput(value) { return String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").replace(/\n{4,}/g, "\n\n\n").trim(); }
function countWords(value) { return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length; }
async function readJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`); } }

window.KairosLocalInference = Object.freeze({ ready: true, build: BUILD, run, getModel: () => selectedModel, getDiagnostics: () => diagnostics });
