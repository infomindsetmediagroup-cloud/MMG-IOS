const BUILD = "kairos-kernel-20260712-12";
const STORAGE_KEY = "kairos.guidedWebsiteObjective";
const MAX_CHARS = 12000;

queueMicrotask(installDirectiveResilience);

function installDirectiveResilience() {
  const textarea = document.querySelector("#guided-job-objective");
  if (!textarea || document.querySelector("#guided-job-character-count")) return;

  textarea.maxLength = MAX_CHARS;
  textarea.rows = 10;
  textarea.setAttribute("aria-describedby", "guided-job-character-count");

  const saved = readSaved();
  if (saved && !textarea.value) textarea.value = saved.slice(0, MAX_CHARS);

  const counter = document.createElement("small");
  counter.id = "guided-job-character-count";
  counter.className = "directive-character-count";
  textarea.insertAdjacentElement("afterend", counter);

  const update = () => {
    const value = textarea.value.slice(0, MAX_CHARS);
    if (value !== textarea.value) textarea.value = value;
    counter.textContent = `${value.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()} characters`;
    try { sessionStorage.setItem(STORAGE_KEY, value); } catch {}
  };

  textarea.addEventListener("input", update);
  update();
}

function readSaved() {
  try { return sessionStorage.getItem(STORAGE_KEY) || ""; }
  catch { return ""; }
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async function kairosResilientFetch(input, init) {
  const url = typeof input === "string" ? input : input?.url || "";
  const isPlanning = url.includes("/api/shopify/staging/plan");
  if (!isPlanning) return nativeFetch(input, init);

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await nativeFetch(input, init);
      if (response.ok || attempt === 2) return response;

      const body = await safeJSON(response.clone());
      const message = String(body?.error?.message || body?.summary || "").toLowerCase();
      const timedOut = response.status >= 500 && (message.includes("timeout") || message.includes("aborted"));
      if (!timedOut) return response;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || "").toLowerCase();
      const timedOut = error?.name === "AbortError" || message.includes("timeout") || message.includes("aborted") || message.includes("load failed");
      if (!timedOut || attempt === 2) throw error;
    }

    showRetryState();
    await delay(1200);
  }

  throw lastError || new Error("Kairos planning did not complete after retry.");
};

function showRetryState() {
  const status = document.querySelector("#guided-job-status");
  const progress = document.querySelector("#guided-job-progress");
  if (status) {
    status.textContent = "Retrying Plan";
    status.className = "status-pill limited";
  }
  if (progress) {
    progress.hidden = false;
    progress.className = "approval-state";
    progress.innerHTML = "<strong>The first planning request timed out. Kairos is retrying automatically with the directive preserved.</strong>";
  }
}

async function safeJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
