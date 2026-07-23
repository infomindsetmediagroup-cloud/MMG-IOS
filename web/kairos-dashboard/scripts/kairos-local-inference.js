const BUILD = "kairos-local-inference-ui-20260723-1";
const MODULE_URL = "https://esm.run/@mlc-ai/web-llm";
const STORE_CONFIRMATION = "STORE LOCAL INFERENCE";
const TARGET_WORDS = 25500;
const MAX_GENERATION_STEPS = 32;

let engine = null;
let selectedModel = "";

async function run({ projectId, onProgress = () => {} } = {}) {
  if (!projectId) throw new Error("Kairos could not identify the active manuscript project.");
  if (!globalThis.navigator?.gpu) throw new Error("This device or browser does not expose WebGPU. Kairos local inference requires a WebGPU-capable browser.");

  onProgress("Loading authoritative manuscript…");
  const sourceResponse = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/source/text`, { credentials: "include", cache: "no-store" });
  const sourceBody = await readJSON(sourceResponse);
  if (!sourceResponse.ok) throw new Error(sourceBody?.error?.message || "The authoritative manuscript could not be loaded.");
  const source = String(sourceBody?.manuscript || "").trim();
  if (source.length < 500) throw new Error("The authoritative manuscript is too short for local inference.");

  onProgress("Loading Kairos Local Inference Model…");
  const webllm = await import(MODULE_URL);
  selectedModel = chooseModel(webllm.prebuiltAppConfig?.model_list || []);
  if (!selectedModel) throw new Error("No compatible local language model is available in the current WebLLM model registry.");

  if (!engine) {
    engine = await webllm.CreateMLCEngine(selectedModel, {
      appConfig: { ...webllm.prebuiltAppConfig, cacheBackend: "cache" },
      initProgressCallback: (progress) => {
        const pct = Number.isFinite(progress?.progress) ? Math.round(progress.progress * 100) : null;
        onProgress(pct == null ? String(progress?.text || "Loading local model…") : `Loading local model… ${pct}%`);
      },
    });
  }

  const sections = splitSections(source);
  const generated = [];
  let totalWords = countWords(source);
  let step = 0;

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
        {
          role: "user",
          content: buildPrompt(section, cycle, step),
        },
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
    }),
  });
  const stored = await readJSON(storeResponse);
  if (!storeResponse.ok) throw new Error(stored?.error?.message || "The locally inferred manuscript could not be stored.");

  return {
    status: "local-inference-ready",
    build: BUILD,
    model: selectedModel,
    wordCount: countWords(manuscript),
    generatedSections: generated.length,
    stored,
  };
}

function chooseModel(modelList) {
  const ids = modelList.map((item) => String(item?.model_id || "")).filter(Boolean);
  const preferences = [
    "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    "Qwen2-0.5B-Instruct-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  ];
  for (const preferred of preferences) {
    const exact = ids.find((id) => id === preferred);
    if (exact) return exact;
    const family = ids.find((id) => id.toLowerCase().includes(preferred.toLowerCase().replace(/-q4f16_1-mlc$/, "")) && /q4f16_1/i.test(id));
    if (family) return family;
  }
  return ids.find((id) => /0\.5B.*Instruct.*q4f16_1/i.test(id)) || ids.find((id) => /1B.*Instruct.*q4f16_1/i.test(id)) || "";
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
  const focus = [
    "core principle, practical workflow, and decision rules",
    "worked example, diagnostic method, and common failure patterns",
    "implementation workbook, checklist, and measurable completion standard",
    "advanced application, quality control, and repeatable operating procedure",
  ][(cycle - 1) % 4];
  return `SOURCE SECTION TITLE: ${section.title}\nEXPANSION PASS: ${cycle}\nFOCUS: ${focus}\n\nSOURCE MATERIAL:\n${section.content}\n\nWrite 850 to 1150 words of new, non-repetitive, customer-facing instructional content grounded strictly in the source material. Use clear Markdown subheadings. Preserve the source's terminology, methods, examples, and practical intent. Add useful explanation and application, but do not add unsupported facts. This is expansion unit ${step + 1}; return only the finished content.`;
}

function cleanOutput(value) {
  return String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").replace(/\n{4,}/g, "\n\n\n").trim();
}
function countWords(value) { return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length; }
async function readJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`); } }

window.KairosLocalInference = Object.freeze({ ready: true, build: BUILD, run, getModel: () => selectedModel });
