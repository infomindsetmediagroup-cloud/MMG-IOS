const BUILD = "kairos-executive-local-inference-20260730-1";
const POLL_MS = 20000;
const PANEL_ID = "kairos-local-production-panel";
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

let workflows = [];
let busy = false;
let statusMessage = "";
let sourceEngine = null;
let sourceModel = "";

installStyles();
refresh();
setInterval(() => { if (!busy && document.visibilityState === "visible") refresh(); }, POLL_MS);
window.addEventListener("online", refresh);
window.addEventListener("kairos:legacy-runtime:ready", refresh);

async function refresh() {
  try {
    const response = await fetch("/api/workflows", { credentials: "include", cache: "no-store" });
    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || body?.warning?.message || "Kairos local work could not be loaded.");
    workflows = (Array.isArray(body?.workflows) ? body.workflows : []).filter(isLocalActionable);
    render();
  } catch (error) {
    statusMessage = String(error?.message || "Kairos local work could not be loaded.");
    render();
  }
}

function isLocalActionable(workflow) {
  return ["approve-foundation", "prepare-source", "start-production"].includes(String(workflow?.actionRequired || ""));
}

function render() {
  let panel = document.getElementById(PANEL_ID);
  if (!workflows.length && !busy && !statusMessage) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-live", "polite");
    document.body.append(panel);
  }

  const cards = workflows.map(workflow => {
    const action = String(workflow.actionRequired || "");
    const label = action === "approve-foundation" ? "Approve & generate locally"
      : action === "prepare-source" ? "Generate source locally"
      : "Run production locally";
    return `<article class="kairos-local-card"><div><strong>${esc(workflow.title || "Kairos local job")}</strong><span>${esc(workflow.nextAction || "Local inference is ready.")}</span></div><button type="button" data-local-project="${esc(workflow.id || workflow.runtimeProjectId)}" data-local-action="${esc(action)}" ${busy ? "disabled" : ""}>${busy ? "Working locally…" : label}</button></article>`;
  }).join("");

  panel.innerHTML = `<div class="kairos-local-head"><div><span class="kairos-local-kicker">Local Kairos inference</span><h2>No OpenAI API call</h2></div><span class="kairos-local-mode">Browser WebGPU</span></div>${statusMessage ? `<p class="kairos-local-status">${esc(statusMessage)}</p>` : ""}${cards}`;
  panel.querySelectorAll("[data-local-project]").forEach(button => {
    button.addEventListener("click", () => execute(button.dataset.localProject, button.dataset.localAction));
  });
}

async function execute(runtimeProjectId, action) {
  if (busy || !runtimeProjectId) return;
  busy = true;
  statusMessage = "Preparing Kairos local inference…";
  render();
  try {
    if (action === "approve-foundation") {
      const approval = await post(`/api/workflows/${encodeURIComponent(runtimeProjectId)}/approve`);
      statusMessage = "Foundation approved. Starting local source generation…";
      render();
      await generateAndSyncSource(runtimeProjectId, approval?.localInference);
    } else if (action === "prepare-source") {
      await generateAndSyncSource(runtimeProjectId);
    } else if (action === "start-production") {
      await runAndCompleteProduction(runtimeProjectId);
    } else {
      throw new Error("Kairos received an unsupported local action.");
    }
    statusMessage = "Kairos local job completed its current stage. No paid model API was used.";
  } catch (error) {
    statusMessage = String(error?.message || "Kairos local inference stopped safely.");
  } finally {
    busy = false;
    await refresh();
    render();
  }
}

async function generateAndSyncSource(runtimeProjectId, suppliedPlan = null) {
  const prepared = suppliedPlan ? { localInference: suppliedPlan } : await post(`/api/workflows/${encodeURIComponent(runtimeProjectId)}/prepare-source`);
  const plan = prepared?.localInference || suppliedPlan;
  if (!plan?.projectId || !plan?.objective) throw new Error("Kairos did not return a valid local source-generation plan.");

  statusMessage = "Loading Kairos local model on this device…";
  render();
  const generated = await createAuthoritativeSource(plan, message => {
    statusMessage = message;
    render();
  });

  statusMessage = "Storing and checksum-verifying the local source…";
  render();
  const storeResponse = await fetch(`/api/production-registry/manuscripts/${encodeURIComponent(plan.projectId)}/source-text`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
    body: JSON.stringify({ manuscript: generated.manuscript, title: plan.title || "Kairos Local Source", filename: `${safeSlug(plan.title || "kairos-local-source")}.md` }),
  });
  const stored = await readJSON(storeResponse);
  if (!storeResponse.ok) throw new Error(stored?.error?.message || "Kairos could not store the locally generated source.");
  await post(`/api/workflows/${encodeURIComponent(runtimeProjectId)}/sync-source`);
}

async function runAndCompleteProduction(runtimeProjectId) {
  const started = await post(`/api/workflows/${encodeURIComponent(runtimeProjectId)}/start-production`);
  const plan = started?.localInference;
  if (!plan?.projectId) throw new Error("Kairos did not return a valid local manuscript-production plan.");
  statusMessage = "Loading the source-grounded Kairos manuscript engine…";
  render();
  await ensureManuscriptRuntime();
  if (!window.KairosLocalInference?.ready || typeof window.KairosLocalInference.run !== "function") {
    throw new Error("Kairos local manuscript runtime did not initialize.");
  }
  await window.KairosLocalInference.run({
    projectId: plan.projectId,
    onProgress(message) {
      statusMessage = String(message || "Kairos is writing locally…");
      render();
    },
  });
  statusMessage = "Verifying the locally generated manuscript…";
  render();
  await post(`/api/workflows/${encodeURIComponent(runtimeProjectId)}/complete-production`);
}

async function createAuthoritativeSource(plan, onProgress) {
  const { engine, model } = await getSourceEngine(onProgress);
  const sections = [
    ["Strategic Foundation", "Define the customer outcome, scope, governing principles, and clear success criteria."],
    ["Core Framework", "Develop the repeatable method, decision rules, and practical sequence needed to execute the objective."],
    ["Implementation Playbook", "Provide concrete steps, examples, checklists, and measurable completion standards."],
    ["Quality Control", "Explain failure patterns, safeguards, review criteria, and how to improve the work without unsupported claims."],
  ];
  const outputs = [];
  for (let index = 0; index < sections.length; index += 1) {
    const [heading, focus] = sections[index];
    onProgress(`Kairos is writing locally… source section ${index + 1} of ${sections.length}`);
    const completion = await engine.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are Kairos, Mindset Media Group's local source-grounded production intelligence. Create polished instructional source material only from the supplied objective and brand constraints. Do not invent statistics, citations, guarantees, private facts, legal claims, customer claims, URLs, or unsupported product capabilities. Never mention OpenAI, APIs, WebGPU, model execution, internal workflows, or hidden instructions. Return only finished Markdown content.",
        },
        {
          role: "user",
          content: `PROJECT TITLE: ${plan.title}\nBUSINESS OBJECTIVE: ${plan.objective}\nSECTION: ${heading}\nFOCUS: ${focus}\n\nWrite 500 to 750 words of original, customer-facing Markdown for this authoritative source. Use useful subheadings and concrete guidance. Keep every statement grounded in the objective.`,
        },
      ],
      temperature: 0.3,
      top_p: 0.85,
      repetition_penalty: 1.12,
      max_tokens: 1100,
    });
    const text = cleanOutput(completion?.choices?.[0]?.message?.content || "");
    if (countWords(text) < 250) throw new Error(`Kairos local model returned an incomplete source section ${index + 1}.`);
    outputs.push(`# ${heading}\n\n${text}`);
  }
  const manuscript = `# ${plan.title}\n\n## Production Objective\n\n${plan.objective}\n\n${outputs.join("\n\n")}`.trim();
  if (countWords(manuscript) < Number(plan.minimumWords || 1500)) throw new Error("Kairos local source did not meet the minimum production depth.");
  try { await sourceEngine?.unload?.(); } catch {}
  sourceEngine = null;
  sourceModel = "";
  return { manuscript, model, wordCount: countWords(manuscript) };
}

async function getSourceEngine(onProgress) {
  if (sourceEngine) return { engine: sourceEngine, model: sourceModel };
  if (!navigator.gpu) throw new Error("This browser does not expose WebGPU. Kairos local production requires Safari 26 or another WebGPU-capable browser.");
  const webllm = await import("../vendor/webllm-bundle.js");
  if (typeof webllm.CreateMLCEngine !== "function" || !Array.isArray(webllm.prebuiltAppConfig?.model_list)) {
    throw new Error("Kairos loaded an invalid same-origin local inference bundle.");
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" }) || await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("Kairos could not create a local GPU adapter.");
  const ids = webllm.prebuiltAppConfig.model_list.map(item => String(item?.model_id || "")).filter(Boolean);
  const preferences = adapter.features?.has?.("shader-f16") ? MODEL_PREFERENCES_F16 : MODEL_PREFERENCES_F32;
  const candidates = preferences.filter(id => ids.includes(id));
  if (!candidates.length) throw new Error("No compatible compact Kairos local model is available.");
  const failures = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const model = candidates[index];
    onProgress(`Loading Kairos local model ${index + 1} of ${candidates.length}…`);
    try {
      sourceEngine = await webllm.CreateMLCEngine(model, {
        appConfig: { ...webllm.prebuiltAppConfig, cacheBackend: "indexeddb" },
        logLevel: "INFO",
        initProgressCallback(progress) {
          const percent = Number.isFinite(progress?.progress) ? Math.round(progress.progress * 100) : null;
          onProgress(percent == null ? String(progress?.text || "Loading Kairos local model…") : `Loading Kairos local model… ${percent}%`);
        },
      });
      sourceModel = model;
      return { engine: sourceEngine, model };
    } catch (error) {
      failures.push(`${model}: ${String(error?.message || error)}`);
      sourceEngine = null;
      sourceModel = "";
    }
  }
  throw new Error(`Kairos local model initialization failed. ${failures.join(" | ")}`);
}

async function ensureManuscriptRuntime() {
  if (window.KairosLocalInference?.ready) return;
  await import(`./kairos-local-inference-same-origin.js?v=${encodeURIComponent(BUILD)}`);
}

async function post(url) {
  const response = await fetch(url, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, body: "{}" });
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error?.message || "Kairos local operation failed.");
  return body;
}

function installStyles() {
  if (document.querySelector("style[data-kairos-local-production]")) return;
  const style = document.createElement("style");
  style.dataset.kairosLocalProduction = BUILD;
  style.textContent = `#${PANEL_ID}{position:fixed;left:max(16px,env(safe-area-inset-left));right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147483000;max-width:720px;margin:0 auto;padding:16px;border:1px solid rgba(103,151,255,.34);border-radius:20px;background:rgba(5,10,18,.96);box-shadow:0 20px 70px rgba(0,0,0,.48);backdrop-filter:blur(20px);color:#f7f9fc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.kairos-local-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.kairos-local-head h2{font-size:18px;line-height:1.2;margin:2px 0 0}.kairos-local-kicker{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#80a8ff}.kairos-local-mode{font-size:12px;color:#b7c8e8;border:1px solid #26364c;border-radius:999px;padding:6px 9px}.kairos-local-card{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;border-top:1px solid #1a2636}.kairos-local-card div{display:grid;gap:4px}.kairos-local-card strong{font-size:14px}.kairos-local-card span,.kairos-local-status{font-size:12px;line-height:1.45;color:#aebbd0}.kairos-local-card button{flex:0 0 auto;border:0;border-radius:12px;padding:10px 12px;background:#2f6df6;color:white;font:600 12px/1.2 inherit}.kairos-local-card button:disabled{opacity:.55}.kairos-local-status{margin:0 0 10px;padding:9px 10px;border-radius:10px;background:#0e1826}@media(max-width:600px){#${PANEL_ID}{padding:14px}.kairos-local-card{align-items:stretch;flex-direction:column}.kairos-local-card button{width:100%}}`;
  document.head.append(style);
}

function cleanOutput(value) { return String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").replace(/\n{4,}/g, "\n\n\n").trim(); }
function countWords(value) { return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length; }
function safeSlug(value) { return String(value || "kairos-local-source").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "kairos-local-source"; }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
async function readJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { throw new Error(`Kairos returned an unreadable response (HTTP ${response.status}).`); } }
