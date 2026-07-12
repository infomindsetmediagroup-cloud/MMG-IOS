const DEFAULT_RUNTIME_BASE_URL = "https://mmg-ios.info-mindsetmediagroup.workers.dev";
const runtimeBaseURL = window.location.hostname.endsWith("github.io") ? DEFAULT_RUNTIME_BASE_URL : window.location.origin;
const sameOriginRuntime = new URL(runtimeBaseURL).origin === window.location.origin;
const BUILD = "command-center-shopify-mutation-20260711-8";

const state = { open: false, sending: false, ready: false, authenticated: false, session: null };

const shell = document.createElement("section");
shell.className = "live-chat-shell";
shell.setAttribute("aria-label", "Kairos live executive chat");
shell.innerHTML = `
  <button class="live-chat-launcher" type="button" aria-expanded="false" aria-controls="live-chat-panel">
    <span aria-hidden="true">✦</span><span>Live Kairos</span>
  </button>
  <div id="live-chat-panel" class="live-chat-panel" hidden>
    <header class="live-chat-header">
      <div><p class="eyebrow">MMG Command Center</p><h3>Executive Chat</h3></div>
      <button class="live-chat-close" type="button" aria-label="Close live chat">×</button>
    </header>
    <div class="live-chat-runtime">
      <span class="live-chat-status-dot" data-runtime-status></span>
      <div><strong data-runtime-label>Checking runtime…</strong><p class="muted" data-runtime-detail>${runtimeBaseURL}</p></div>
    </div>
    <div class="live-chat-messages" data-messages aria-live="polite">
      <article class="live-chat-message kairos"><span>Kairos</span><p>Your authenticated Command Center session is reused automatically. Direct Kairos in plain language.</p></article>
    </div>
    <form class="live-chat-composer" data-chat-form>
      <textarea name="objective" rows="2" maxlength="8000" placeholder="Direct Kairos…" required></textarea>
      <button type="submit" class="live-chat-send">Send</button>
    </form>
    <footer class="live-chat-footer">Session-authorized operation · request and audit identifiers preserved</footer>
  </div>`;

document.body.append(shell);

const launcher = shell.querySelector(".live-chat-launcher");
const panel = shell.querySelector(".live-chat-panel");
const closeButton = shell.querySelector(".live-chat-close");
const statusDot = shell.querySelector("[data-runtime-status]");
const statusLabel = shell.querySelector("[data-runtime-label]");
const statusDetail = shell.querySelector("[data-runtime-detail]");
const messages = shell.querySelector("[data-messages]");
const form = shell.querySelector("[data-chat-form]");
const objectiveInput = form.elements.objective;
const sendButton = shell.querySelector(".live-chat-send");

launcher.addEventListener("click", () => setOpen(!state.open));
closeButton.addEventListener("click", () => setOpen(false));
form.addEventListener("submit", sendObjective);
window.addEventListener("kairos:auth", event => {
  state.authenticated = true;
  state.session = event.detail?.session || null;
  refreshStatus();
});
window.addEventListener("kairos:execute-approved-action", executeApprovedAction);

function setOpen(open) {
  state.open = open;
  panel.hidden = !open;
  launcher.setAttribute("aria-expanded", String(open));
  if (open) refreshStatus();
}

async function refreshStatus() {
  await checkHealth();
  await checkSession();
  updateComposerState();
}

async function checkHealth() {
  setRuntimeState("checking", "Checking production runtime…", runtimeBaseURL);
  try {
    const response = await fetch(`${runtimeBaseURL}/api/health`, { headers: { Accept: "application/json" }, cache: "no-store", credentials: sameOriginRuntime ? "include" : "omit" });
    const body = await readJSON(response);
    state.ready = response.ok && (body.status === "ready" || body.status === "ok");
  } catch {
    state.ready = false;
  }
}

async function checkSession() {
  if (!sameOriginRuntime) {
    state.authenticated = false;
    state.session = null;
    setRuntimeState("degraded", "Open the secure Command Center", "GitHub Pages is recovery-only.");
    return;
  }
  try {
    const response = await fetch(`${runtimeBaseURL}/api/session`, { headers: { Accept: "application/json" }, cache: "no-store", credentials: "include" });
    const body = await readJSON(response);
    state.authenticated = response.ok && body.status === "authenticated";
    state.session = state.authenticated ? body.session : null;
    setRuntimeState(
      state.ready && state.authenticated ? "ready" : "degraded",
      state.authenticated ? "Secure operator session active" : "Operator session required",
      state.authenticated ? `${body.session?.operator || "Operator"} · ${runtimeBaseURL}` : runtimeBaseURL,
    );
  } catch {
    state.authenticated = false;
    state.session = null;
    setRuntimeState("degraded", "Session service unavailable", runtimeBaseURL);
  }
}

async function sendObjective(event) {
  event.preventDefault();
  const objective = objectiveInput.value.trim();
  if (!objective || state.sending) return;
  if (!state.ready || !state.authenticated) {
    appendMessage("system", "A ready runtime and authenticated operator session are required.");
    await refreshStatus();
    return;
  }

  appendMessage("executive", objective);
  objectiveInput.value = "";
  state.sending = true;
  updateComposerState();
  const progress = appendMessage("progress", "Kairos is routing and preparing a governed response…");

  try {
    const response = await fetch(`${runtimeBaseURL}/api/kairos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
      body: JSON.stringify({
        objective,
        department: "Executive Office",
        routingConfidence: 0.8,
        executionPlan: ["Interpret the executive objective.", "Return the clearest governed next action.", "Preserve request and audit traceability."],
        governanceNote: "Controlled internal browser operation. Do not claim external actions without evidence.",
      }),
    });
    const body = await readJSON(response);
    progress.remove();
    if (!response.ok) {
      appendMessage("system", body?.error?.message || body?.message || `Kairos returned ${response.status}.`);
      if (response.status === 401) state.authenticated = false;
      return;
    }
    appendMessage("kairos", body.message || "Kairos completed the request.", {
      department: body.department,
      requestId: body.requestId,
      auditId: body.auditId,
      authorizationMode: body.executionContext?.authorizationMode,
      sessionId: body.executionContext?.sessionId,
    });
  } catch (error) {
    progress.remove();
    appendMessage("system", error instanceof Error ? error.message : "Kairos request failed.");
  } finally {
    state.sending = false;
    updateComposerState();
    objectiveInput.focus();
  }
}

async function executeApprovedAction(event) {
  const action = event.detail || {};
  if (!action.id || !action.actionType || !action.objective) return;
  if (!state.ready || !state.authenticated) {
    setOpen(true);
    appendMessage("system", "An authenticated production session is required for governed actions.");
    dispatchActionStatus(action.id, "Needs Attention", 10, "Production authorization is required.", null, action.phase);
    return;
  }

  const preparing = action.phase === "prepare";
  const mutation = action.proposal?.mutationPlan || action.proposal?.mutation || null;
  if (action.actionType === "shopify.theme.files.upsert" && !mutation) {
    const message = "The approved proposal does not yet contain an exact Shopify mutation plan with a current theme ID, file paths, complete replacement content, and optional source hashes. Regenerate the proposal before publishing.";
    dispatchActionStatus(action.id, "Needs Attention", 50, message, null, action.phase);
    setOpen(true);
    appendMessage("system", message);
    return;
  }

  dispatchActionStatus(action.id, "Working", 45, "", null, action.phase);
  try {
    const response = await fetch(`${runtimeBaseURL}/api/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
      body: JSON.stringify({
        actionType: action.actionType,
        objective: action.objective,
        phase: action.phase || "execute",
        proposal: action.proposal || null,
        mutation,
        governance: {
          requiresReview: Boolean(action.requiresReview),
          doNotPublishWithoutApproval: preparing,
        },
        approval: {
          approved: !preparing,
          actor: state.session?.operator || "Mike",
          approvedAt: preparing ? null : new Date().toISOString(),
        },
      }),
    });
    const body = await readJSON(response);
    if (!response.ok) {
      const message = body?.error?.message || body?.message || `Action returned ${response.status}.`;
      dispatchActionStatus(action.id, "Needs Attention", 45, message, null, action.phase);
      appendMessage("system", message);
      return;
    }
    if (preparing && action.requiresReview) {
      dispatchActionStatus(action.id, "Proposal Ready", 100, "", body, action.phase);
      appendMessage("kairos", "Proposal prepared. Executive approval is required before any production change executes.");
      return;
    }
    dispatchActionStatus(action.id, "Completed", 100, "", body, action.phase);
    appendMessage("kairos", body.executionContext?.mutationAdapter
      ? "Approved Shopify changes were applied, re-read from production, verified, and preserved with rollback evidence."
      : "Approved action completed, verified, and preserved as evidence.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Governed action failed.";
    dispatchActionStatus(action.id, "Needs Attention", 45, message, null, action.phase);
    appendMessage("system", message);
  }
}

function dispatchActionStatus(id, status, progress, error = "", result = null, phase = "execute") {
  window.dispatchEvent(new CustomEvent("kairos:approved-action-status", { detail: { id, status, progress, error, result, phase } }));
}

function setRuntimeState(status, label, detail) {
  statusDot.dataset.status = status;
  statusLabel.textContent = label;
  statusDetail.textContent = detail;
}

function updateComposerState() {
  const enabled = state.ready && state.authenticated && !state.sending;
  objectiveInput.disabled = !enabled;
  sendButton.disabled = !enabled;
}

function appendMessage(role, text, metadata) {
  const article = document.createElement("article");
  article.className = `live-chat-message ${role}`;
  const label = role === "executive" ? "Executive" : role === "kairos" ? "Kairos" : role === "progress" ? "Working" : "System";
  article.innerHTML = `<span>${escapeHTML(label)}</span><p>${escapeHTML(text)}</p>${metadata ? `<small>${escapeHTML(Object.entries(metadata).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(" · "))}</small>` : ""}`;
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

refreshStatus();
