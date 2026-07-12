const BUILD = "kairos-kernel-20260712-22";
const ACTIVE_EXECUTION_KEY = "kairos.guidedWebsiteExecutionJob";
const POLL_INTERVAL_MS = 2200;

const priorFetch = window.fetch.bind(window);
window.fetch = async function kairosResumableExecutionFetch(input, init = {}) {
  const rawURL = typeof input === "string" ? input : input?.url || "";
  const url = new URL(rawURL, window.location.href);
  const isExecution = url.pathname === "/api/shopify/staging/execute" && String(init?.method || "GET").toUpperCase() === "POST";
  if (!isExecution) return priorFetch(input, init);

  let payload = {};
  try { payload = JSON.parse(String(init?.body || "{}")); }
  catch { return response({ error: { message: "The approved execution payload was invalid." } }, 400); }

  setExecutionState("Submitting Execution", "Kairos is submitting the approved generation as a resumable execution job.");
  const submitResponse = await priorFetch("/api/shopify/staging/execute/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-MMG-Client-Build": BUILD },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const submitted = await safeJSON(submitResponse.clone());
  if (!submitResponse.ok || !submitted?.jobID) return submitResponse;

  writeStorage(ACTIVE_EXECUTION_KEY, submitted.jobID);
  setExecutionState("Generating", submitted.summary || "OpenAI is generating the approved homepage document.");

  while (true) {
    await delay(POLL_INTERVAL_MS);
    let statusResponse;
    try {
      statusResponse = await priorFetch(submitted.pollURL || `/api/shopify/staging/execute/jobs/${submitted.jobID}`, {
        method: "GET",
        headers: { Accept: "application/json", "X-MMG-Client-Build": BUILD },
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      setExecutionState("Reconnecting", "The mobile connection changed. Kairos is reconnecting to the same approved execution; no duplicate write was submitted.");
      continue;
    }

    const job = await safeJSON(statusResponse.clone());
    if (job?.status === "generating" || job?.status === "committing") {
      setExecutionState(job.status === "committing" ? "Writing and Verifying" : "Generating", job?.summary || "Kairos is continuing the approved execution.");
      continue;
    }

    removeStorage(ACTIVE_EXECUTION_KEY);
    if (job?.status === "completed" && job?.result) return response(job.result, 200, submitted.jobID);

    return response({
      summary: job?.summary || "Kairos could not complete the approved website execution.",
      error: job?.error || { message: "The resumable execution job failed." },
      jobID: submitted.jobID,
    }, Number(job?.httpStatus || statusResponse.status || 500), submitted.jobID);
  }
};

function setExecutionState(label, message) {
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");
  if (status) {
    status.textContent = label;
    status.className = "status-pill limited";
  }
  if (result) result.innerHTML = `<p class="lead compact">${escapeHTML(message)}</p>`;
}

function response(body, status, jobID = "") {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (jobID) headers["X-MMG-Execution-Job"] = jobID;
  return new Response(JSON.stringify(body), { status, headers });
}
function writeStorage(key, value) { try { sessionStorage.setItem(key, value); } catch {} }
function removeStorage(key) { try { sessionStorage.removeItem(key); } catch {} }
async function safeJSON(response) { try { return await response.json(); } catch { return {}; } }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
