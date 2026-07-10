const DEFAULT_RUNTIME_BASE_URL = "https://mmg-ios.vercel.app";
const runtimeBaseURL = window.location.hostname.endsWith("vercel.app") ? window.location.origin : DEFAULT_RUNTIME_BASE_URL;
const sameOriginRuntime = new URL(runtimeBaseURL).origin === window.location.origin;

const state = { open: false, sending: false, ready: false, authenticated: false, session: null, gatewayToken: "" };

const shell = document.createElement("section");
shell.className = "live-chat-shell";
shell.setAttribute("aria-label", "Kairos live executive chat");
shell.innerHTML = `
  <button class="live-chat-launcher" type="button" aria-expanded="false" aria-controls="live-chat-panel"><span aria-hidden="true">✦</span><span>Live Kairos</span></button>
  <div id="live-chat-panel" class="live-chat-panel" hidden>
    <header class="live-chat-header">
      <div><p class="eyebrow">${sameOriginRuntime ? "Authenticated Runtime" : "Production Recovery"}</p><h3>Executive Chat</h3></div>
      <button class="live-chat-close" type="button" aria-label="Close live chat">×</button>
    </header>
    <div class="live-chat-runtime"><span class="live-chat-status-dot" data-runtime-status></span><div><strong data-runtime-label>Checking runtime…</strong><p class="muted" data-runtime-detail>${runtimeBaseURL}</p></div></div>
    ${sameOriginRuntime ? `
      <div class="live-chat-auth" data-session-panel>
        <p class="muted">Live Kairos uses the signed operator session established at login.</p>
        <div class="live-chat-auth-actions"><button type="button" class="action-button" data-end-session>End session</button></div>
      </div>
    ` : `
      <div class="live-chat-auth" data-recovery-panel>
        <label for="kairos-runtime-token">Internal runtime token</label>
        <input id="kairos-runtime-token" type="password" autocomplete="off" placeholder="Enter the internal gateway token">
        <p class="muted">GitHub Pages recovery mode keeps the token only in memory for this tab. It is never written to browser storage.</p>
        <div class="live-chat-auth-actions"><button type="button" class="action-button" data-use-token>Use token</button><button type="button" class="action-button" data-clear-token>Clear authorization</button></div>
      </div>
    `}
    <div class="live-chat-messages" data-messages aria-live="polite"><article class="live-chat-message kairos"><span>Kairos</span><p>${sameOriginRuntime ? "Your authenticated operator session is used automatically." : "Authorize this recovery tab, then direct Kairos in plain language."}</p></article></div>
    <form class="live-chat-composer" data-chat-form><textarea name="objective" rows="2" maxlength="8000" placeholder="Direct Kairos…" required></textarea><button type="submit" class="live-chat-send">Send</button></form>
    <footer class="live-chat-footer">Controlled internal operation · request and audit identifiers preserved</footer>
  </div>
`;
document.body.append(shell);

const launcher = shell.querySelector(".live-chat-launcher");
const panel = shell.querySelector(".live-chat-panel");
const closeButton = shell.querySelector(".live-chat-close");
const statusDot = shell.querySelector("[data-runtime-status]");
const statusLabel = shell.querySelector("[data-runtime-label]");
const statusDetail = shell.querySelector("[data-runtime-detail]");
const tokenInput = shell.querySelector("#kairos-runtime-token");
const useTokenButton = shell.querySelector("[data-use-token]");
const clearTokenButton = shell.querySelector("[data-clear-token]");
const endSessionButton = shell.querySelector("[data-end-session]");
const messages = shell.querySelector("[data-messages]");
const form = shell.querySelector("[data-chat-form]");
const objectiveInput = form.elements.objective;
const sendButton = shell.querySelector(".live-chat-send");

launcher.addEventListener("click", () => setOpen(!state.open));
closeButton.addEventListener("click", () => setOpen(false));
form.addEventListener("submit", sendObjective);
useTokenButton?.addEventListener("click", authorizeRecoveryTab);
clearTokenButton?.addEventListener("click", clearRecoveryAuthorization);
endSessionButton?.addEventListener("click", endSession);
window.addEventListener("kairos:auth", event => {
  if (!sameOriginRuntime) return;
  state.authenticated = true;
  state.session = event.detail?.session || null;
  updateComposerState();
});

function setOpen(open) {
  state.open = open;
  panel.hidden = !open;
  launcher.setAttribute("aria-expanded", String(open));
  if (open) refreshRuntimeAndAuthorization();
}

async function refreshRuntimeAndAuthorization() {
  await checkHealth();
  if (state.ready && sameOriginRuntime) await checkSession();
  updateComposerState();
}

async function checkHealth() {
  setRuntimeState("checking", "Checking production runtime…", runtimeBaseURL);
  try {
    const response = await fetch(`${runtimeBaseURL}/api/health`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      ...(sameOriginRuntime ? { credentials: "include" } : {}),
    });
    const body = await readJSON(response);
    state.ready = response.ok && (body.status === "ready" || body.status === "ok");
    setRuntimeState(state.ready ? "ready" : "degraded", state.ready ? "Production runtime ready" : "Runtime requires attention", state.ready ? `${runtimeBaseURL} · connected` : `${runtimeBaseURL} · ${body.status || response.status}`);
  } catch (error) {
    state.ready = false;
    resetAuthorization();
    setRuntimeState("degraded", "Runtime unreachable", error instanceof Error ? error.message : "Network failure");
  }
}

async function checkSession() {
  try {
    const response = await fetch("/api/session", { headers: { Accept: "application/json" }, cache: "no-store", credentials: "include" });
    const body = await readJSON(response);
    if (response.ok && body.status === "authenticated") {
      state.authenticated = true;
      state.session = body.session;
      setRuntimeState("ready", "Secure operator session active", formatSessionDetail(body.session));
      return;
    }
    state.authenticated = false;
    state.session = null;
    setRuntimeState("degraded", "Operator session required", "Sign in again to continue.");
  } catch {
    state.authenticated = false;
    state.session = null;
  }
}

function authorizeRecoveryTab() {
  const token = tokenInput?.value.trim() || "";
  if (!token) return appendMessage("system", "Enter the internal runtime token first.");
  state.gatewayToken = token;
  state.authenticated = true;
  state.session = null;
  tokenInput.value = "";
  appendMessage("system", "Recovery authorization loaded in memory for this tab only.");
  setRuntimeState("ready", "Gateway recovery mode active", `${runtimeBaseURL} · in-memory authorization`);
  updateComposerState();
}

function clearRecoveryAuthorization() {
  resetAuthorization();
  if (tokenInput) tokenInput.value = "";
  appendMessage("system", "Recovery authorization cleared.");
  updateComposerState();
}

async function endSession() {
  try { await fetch("/api/session", { method: "DELETE", credentials: "include" }); } catch {}
  resetAuthorization();
  appendMessage("system", "Operator session ended.");
  if (typeof window.kairosSignOut === "function") await window.kairosSignOut();
}

async function sendObjective(event) {
  event.preventDefault();
  const objective = objectiveInput.value.trim();
  if (!objective || state.sending) return;
  if (!state.ready) return appendMessage("system", "Kairos runtime is not ready.");
  if (!state.authenticated) return appendMessage("system", sameOriginRuntime ? "Sign in again to continue." : "Authorize this recovery tab first.");

  appendMessage("executive", objective);
  objectiveInput.value = "";
  state.sending = true;
  updateComposerState();
  const progressMessage = appendMessage("progress", "Kairos is routing and preparing a governed response…");

  try {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (state.gatewayToken) headers.Authorization = `Bearer ${state.gatewayToken}`;
    const response = await fetch(`${runtimeBaseURL}/api/kairos`, {
      method: "POST",
      headers,
      ...(sameOriginRuntime ? { credentials: "include" } : {}),
      body: JSON.stringify({
        objective,
        department: "Executive Office",
        routingConfidence: 0.8,
        executionPlan: ["Interpret the executive objective.", "Return the clearest governed next action.", "Preserve request and audit traceability."],
        governanceNote: "Controlled internal browser operation. Do not claim external actions without evidence.",
      }),
    });
    const body = await readJSON(response);
    progressMessage.remove();
    if (!response.ok) {
      appendMessage("system", body?.error?.message || body?.message || `Kairos returned ${response.status}.`);
      if (response.status === 401) resetAuthorization();
      return;
    }
    appendMessage("kairos", body.message || "Kairos completed the request.", {
      department: body.department,
      requestId: body.requestId,
      auditId: body.auditId,
      sessionId: body.executionContext?.sessionId,
      authorizationMode: body.executionContext?.authorizationMode,
    });
  } catch (error) {
    progressMessage.remove();
    appendMessage("system", error instanceof Error ? error.message : "Kairos request failed.");
  } finally {
    state.sending = false;
    updateComposerState();
    objectiveInput.focus();
  }
}

function resetAuthorization() { state.authenticated = false; state.session = null; state.gatewayToken = ""; }

function appendMessage(role, text, metadata) {
  const article = document.createElement("article");
  article.className = `live-chat-message ${role}`;
  const label = role === "executive" ? "Executive" : role === "kairos" ? "Kairos" : role === "progress" ? "Working" : "System";
  article.innerHTML = `<span>${escapeHTML(label)}</span><p>${escapeHTML(text)}</p>`;
  if (metadata) {
    const details = [metadata.department && `department=${metadata.department}`, metadata.requestId && `request=${metadata.requestId}`, metadata.auditId && `audit=${metadata.auditId}`, metadata.sessionId && `session=${metadata.sessionId}`, metadata.authorizationMode && `auth=${metadata.authorizationMode}`].filter(Boolean).join(" · ");
    if (details) { const meta = document.createElement("small"); meta.textContent = details; article.append(meta); }
  }
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function updateComposerState() {
  objectiveInput.disabled = state.sending || !state.ready;
  sendButton.disabled = state.sending || !state.ready || !state.authenticated;
  sendButton.textContent = state.sending ? "Working…" : "Send";
}
function setRuntimeState(kind, label, detail) { statusDot.dataset.state = kind; statusLabel.textContent = label; statusDetail.textContent = detail; }
function formatSessionDetail(session) { return session ? `${session.operator} · ${session.role} · expires ${new Date(session.expiresAt * 1000).toLocaleTimeString()}` : `${runtimeBaseURL} · authenticated`; }
async function readJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return { message: text }; } }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }

updateComposerState();
