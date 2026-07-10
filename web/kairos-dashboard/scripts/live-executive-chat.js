const DEFAULT_RUNTIME_BASE_URL = "https://mmg-ios.vercel.app";
const TOKEN_SESSION_KEY = "mmg.kairos.runtime-token";

const runtimeBaseURL = window.location.hostname.endsWith("vercel.app")
  ? window.location.origin
  : DEFAULT_RUNTIME_BASE_URL;

const state = {
  open: false,
  sending: false,
  ready: false,
};

const shell = document.createElement("section");
shell.className = "live-chat-shell";
shell.setAttribute("aria-label", "Kairos live executive chat");
shell.innerHTML = `
  <button class="live-chat-launcher" type="button" aria-expanded="false" aria-controls="live-chat-panel">
    <span aria-hidden="true">✦</span>
    <span>Live Kairos</span>
  </button>
  <div id="live-chat-panel" class="live-chat-panel" hidden>
    <header class="live-chat-header">
      <div>
        <p class="eyebrow">Checkpoint 006</p>
        <h3>Executive Chat</h3>
      </div>
      <button class="live-chat-close" type="button" aria-label="Close live chat">×</button>
    </header>
    <div class="live-chat-runtime">
      <span class="live-chat-status-dot" data-runtime-status></span>
      <div>
        <strong data-runtime-label>Checking runtime…</strong>
        <p class="muted" data-runtime-detail>${runtimeBaseURL}</p>
      </div>
    </div>
    <div class="live-chat-auth" data-auth-panel>
      <label for="kairos-runtime-token">Internal runtime token</label>
      <input id="kairos-runtime-token" type="password" autocomplete="off" placeholder="Paste the internal gateway token">
      <p class="muted">Stored only in this browser tab. It is never written to the repository or page source.</p>
      <div class="live-chat-auth-actions">
        <button type="button" class="action-button" data-save-token>Use token</button>
        <button type="button" class="action-button" data-clear-token>Clear</button>
      </div>
    </div>
    <div class="live-chat-messages" data-messages aria-live="polite">
      <article class="live-chat-message kairos">
        <span>Kairos</span>
        <p>Production runtime connected. Enter the internal gateway token once, then direct Kairos in plain language.</p>
      </article>
    </div>
    <form class="live-chat-composer" data-chat-form>
      <textarea name="objective" rows="2" maxlength="8000" placeholder="Direct Kairos…" required></textarea>
      <button type="submit" class="live-chat-send">Send</button>
    </form>
    <footer class="live-chat-footer">
      Controlled internal operation · request and audit identifiers preserved
    </footer>
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
const saveTokenButton = shell.querySelector("[data-save-token]");
const clearTokenButton = shell.querySelector("[data-clear-token]");
const messages = shell.querySelector("[data-messages]");
const form = shell.querySelector("[data-chat-form]");
const objectiveInput = form.elements.objective;
const sendButton = shell.querySelector(".live-chat-send");

launcher.addEventListener("click", () => setOpen(!state.open));
closeButton.addEventListener("click", () => setOpen(false));
saveTokenButton.addEventListener("click", saveToken);
clearTokenButton.addEventListener("click", clearToken);
form.addEventListener("submit", sendObjective);

function setOpen(open) {
  state.open = open;
  panel.hidden = !open;
  launcher.setAttribute("aria-expanded", String(open));
  if (open) {
    tokenInput.value = sessionStorage.getItem(TOKEN_SESSION_KEY) || "";
    checkHealth();
    window.setTimeout(() => objectiveInput.focus(), 50);
  }
}

async function checkHealth() {
  setRuntimeState("checking", "Checking production runtime…", runtimeBaseURL);
  try {
    const response = await fetch(`${runtimeBaseURL}/api/health`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const body = await readJSON(response);
    state.ready = response.ok && body.status === "ready";
    if (state.ready) {
      setRuntimeState("ready", "Production runtime ready", `${runtimeBaseURL} · provider, model, and gateway configured`);
    } else {
      setRuntimeState("degraded", "Runtime requires attention", `${runtimeBaseURL} · ${body.status || response.status}`);
    }
  } catch (error) {
    state.ready = false;
    setRuntimeState("degraded", "Runtime unreachable", error instanceof Error ? error.message : "Network failure");
  }
  updateComposerState();
}

function saveToken() {
  const token = tokenInput.value.trim();
  if (!token) {
    appendMessage("system", "Enter the internal runtime token before sending a request.");
    return;
  }
  sessionStorage.setItem(TOKEN_SESSION_KEY, token);
  tokenInput.value = token;
  appendMessage("system", "Runtime token loaded for this browser tab only.");
  updateComposerState();
  objectiveInput.focus();
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_SESSION_KEY);
  tokenInput.value = "";
  appendMessage("system", "Runtime token cleared from this browser tab.");
  updateComposerState();
}

async function sendObjective(event) {
  event.preventDefault();
  const objective = objectiveInput.value.trim();
  const token = sessionStorage.getItem(TOKEN_SESSION_KEY) || tokenInput.value.trim();

  if (!objective || state.sending) return;
  if (!state.ready) {
    appendMessage("system", "Kairos runtime is not ready. Recheck the production deployment before retrying.");
    return;
  }
  if (!token) {
    appendMessage("system", "Load the internal runtime token first.");
    tokenInput.focus();
    return;
  }

  sessionStorage.setItem(TOKEN_SESSION_KEY, token);
  appendMessage("executive", objective);
  objectiveInput.value = "";
  state.sending = true;
  updateComposerState();
  const progressMessage = appendMessage("progress", "Kairos is routing and preparing a governed response…");

  try {
    const response = await fetch(`${runtimeBaseURL}/api/kairos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        objective,
        department: "Executive Office",
        routingConfidence: 0.8,
        executionPlan: [
          "Interpret the executive objective.",
          "Return the clearest governed next action.",
          "Preserve request and audit traceability.",
        ],
        governanceNote: "Controlled internal browser session. Do not claim external actions were completed without evidence.",
      }),
    });
    const body = await readJSON(response);
    progressMessage.remove();

    if (!response.ok) {
      const message = body?.error?.message || body?.message || `Kairos returned ${response.status}.`;
      appendMessage("system", message);
      if (response.status === 401) {
        sessionStorage.removeItem(TOKEN_SESSION_KEY);
        tokenInput.value = "";
      }
      return;
    }

    appendMessage("kairos", body.message, {
      department: body.department,
      requestId: body.requestId,
      auditId: body.auditId,
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

function appendMessage(role, text, metadata) {
  const article = document.createElement("article");
  article.className = `live-chat-message ${role}`;
  const label = role === "executive" ? "Executive" : role === "kairos" ? "Kairos" : role === "progress" ? "Working" : "System";
  article.innerHTML = `<span>${escapeHTML(label)}</span><p>${escapeHTML(text)}</p>`;
  if (metadata) {
    const details = [
      metadata.department && `department=${metadata.department}`,
      metadata.requestId && `request=${metadata.requestId}`,
      metadata.auditId && `audit=${metadata.auditId}`,
    ].filter(Boolean).join(" · ");
    if (details) {
      const meta = document.createElement("small");
      meta.textContent = details;
      article.append(meta);
    }
  }
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function updateComposerState() {
  const hasToken = Boolean(sessionStorage.getItem(TOKEN_SESSION_KEY) || tokenInput.value.trim());
  objectiveInput.disabled = state.sending || !state.ready;
  sendButton.disabled = state.sending || !state.ready || !hasToken;
  sendButton.textContent = state.sending ? "Working…" : "Send";
}

function setRuntimeState(kind, label, detail) {
  statusDot.dataset.state = kind;
  statusLabel.textContent = label;
  statusDetail.textContent = detail;
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

updateComposerState();
