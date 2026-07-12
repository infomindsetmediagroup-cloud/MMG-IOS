const BUILD = "kairos-kernel-20260712-19";
const STORAGE_KEY = "kairos.guidedWebsiteObjective";
const ACTIVE_JOB_KEY = "kairos.guidedWebsitePlanningJob";
const MAX_CHARS = 12000;
const POLL_INTERVAL_MS = 2200;
const MAX_POLL_MS = 10 * 60 * 1000;

queueMicrotask(installDirectiveResilience);

function installDirectiveResilience() {
  const textarea = document.querySelector("#guided-job-objective");
  if (!textarea || document.querySelector("#guided-job-character-count")) return;

  textarea.maxLength = MAX_CHARS;
  textarea.rows = 10;
  textarea.setAttribute("aria-describedby", "guided-job-character-count");

  const saved = readStorage(STORAGE_KEY);
  if (saved && !textarea.value) textarea.value = saved.slice(0, MAX_CHARS);

  const counter = document.createElement("small");
  counter.id = "guided-job-character-count";
  counter.className = "directive-character-count";
  textarea.insertAdjacentElement("afterend", counter);

  const update = () => {
    const value = textarea.value.slice(0, MAX_CHARS);
    if (value !== textarea.value) textarea.value = value;
    counter.textContent = `${value.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()} characters`;
    writeStorage(STORAGE_KEY, value);
  };

  textarea.addEventListener("input", update);
  update();
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async function kairosResumableFetch(input, init = {}) {
  const rawURL = typeof input === "string" ? input : input?.url || "";
  const url = new URL(rawURL, window.location.href);
  const isLegacyPlanningCall = url.pathname === "/api/shopify/staging/plan" && String(init?.method || "GET").toUpperCase() === "POST";
  if (!isLegacyPlanningCall) return nativeFetch(input, init);

  let payload = {};
  try { payload = JSON.parse(String(init?.body || "{}")); }
  catch { return new Response(JSON.stringify({ error: { message: "The website objective payload was invalid." } }), { status: 400, headers: { "Content-Type": "application/json" } }); }

  const objective = String(payload?.objective || "").trim();
  setPlanningState("Submitting Job", "Kairos is validating the staging source and submitting the approval plan to OpenAI background processing.");

  const submitResponse = await nativeFetch("/api/shopify/staging/plan/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-MMG-Client-Build": BUILD,
    },
    credentials: "include",
    body: JSON.stringify({ objective }),
  });
  const submitted = await safeJSON(submitResponse.clone());
  if (!submitResponse.ok || !submitted?.jobID) return submitResponse;

  writeStorage(ACTIVE_JOB_KEY, submitted.jobID);
  setPlanningState("Preparing Plan", "Job accepted. OpenAI is preparing the source-grounded approval plan while Kairos monitors its status.");

  const started = Date.now();
  while (Date.now() - started < MAX_POLL_MS) {
    await delay(POLL_INTERVAL_MS);
    let statusResponse;
    try {
      statusResponse = await nativeFetch(submitted.pollURL || `/api/shopify/staging/plan/jobs/${submitted.jobID}`, {
        method: "GET",
        headers: { Accept: "application/json", "X-MMG-Client-Build": BUILD },
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      setPlanningState("Reconnecting", "The browser connection changed. Kairos is reconnecting to the same OpenAI planning response; no new job was submitted.");
      continue;
    }

    const job = await safeJSON(statusResponse.clone());
    if (statusResponse.status === 404) {
      removeStorage(ACTIVE_JOB_KEY);
      return new Response(JSON.stringify(job), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    if (job?.status === "queued" || job?.status === "working") {
      setPlanningState("Preparing Plan", job?.summary || "OpenAI is preparing the approval plan.");
      continue;
    }

    removeStorage(ACTIVE_JOB_KEY);
    if (job?.status === "completed" && job?.result) {
      return new Response(JSON.stringify(job.result), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "X-MMG-Planning-Job": submitted.jobID },
      });
    }

    return new Response(JSON.stringify({
      summary: job?.summary || "Kairos could not prepare the website plan.",
      error: job?.error || { message: "The background planning job failed." },
      jobID: submitted.jobID,
    }), {
      status: Number(job?.httpStatus || statusResponse.status || 500),
      headers: { "Content-Type": "application/json; charset=utf-8", "X-MMG-Planning-Job": submitted.jobID },
    });
  }

  return new Response(JSON.stringify({
    summary: "The website planning response is still active.",
    error: { message: "OpenAI has not reached a terminal planning state within ten minutes. The objective remains saved and no Shopify write occurred." },
    jobID: submitted.jobID,
  }), { status: 504, headers: { "Content-Type": "application/json; charset=utf-8" } });
};

function setPlanningState(label, message) {
  const status = document.querySelector("#guided-job-status");
  const progress = document.querySelector("#guided-job-progress");
  if (status) {
    status.textContent = label;
    status.className = "status-pill limited";
  }
  if (progress) {
    progress.hidden = false;
    progress.className = "approval-state";
    progress.innerHTML = `<strong>${escapeHTML(message)}</strong>`;
  }
}

function readStorage(key) {
  try { return sessionStorage.getItem(key) || ""; }
  catch { return ""; }
}

function writeStorage(key, value) {
  try { sessionStorage.setItem(key, value); } catch {}
}

function removeStorage(key) {
  try { sessionStorage.removeItem(key); } catch {}
}

async function safeJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}
