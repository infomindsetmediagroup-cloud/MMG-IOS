const CONCIERGE_BUILD = "kairos-concierge-20260807-4-v38-compatible";
const BASE_STORAGE_KEY = "kairos:concierge:history:v2";
const MAX_HISTORY = 32;
const WORKER_ORIGIN = "https://mmg-ios.info-mindsetmediagroup.workers.dev";
const SECURE_PORTAL_URL = `${WORKER_ORIGIN}/customer-portal`;
const CURRENT_PATH = location.pathname;
const SECURE_CUSTOMER_PORTAL = CURRENT_PATH === "/customer-portal"
  || CURRENT_PATH === "/customer-portal/"
  || CURRENT_PATH.endsWith("/customer-portal.html");
const PUBLIC_CUSTOMER_PORTAL = CURRENT_PATH === "/pages/customer-portal"
  || CURRENT_PATH === "/pages/customer-portal/";
const STOREFRONT = /(^|\.)themindsetmediagroup\.com$/iu.test(location.hostname);
const CUSTOMER_PORTAL = SECURE_CUSTOMER_PORTAL || PUBLIC_CUSTOMER_PORTAL;
const SURFACE = SECURE_CUSTOMER_PORTAL ? "customer" : STOREFRONT ? "storefront" : "operator";

let storageKey = `${BASE_STORAGE_KEY}:${SURFACE === "customer" ? "customer-session" : SURFACE}`;

const state = {
  open: false,
  busy: false,
  listening: false,
  voiceEnabled: false,
  recognition: null,
  customerId: "",
  messages: loadHistory(),
};

mount();
hydrateIdentity();

function mount() {
  if (document.querySelector("#kairos-concierge")) return;

  const style = document.createElement("style");
  style.id = "kairos-concierge-style";
  style.setAttribute("nonce", "kairos-dashboard-v1");
  style.textContent = `
    #kairos-concierge{position:fixed;right:22px;bottom:22px;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;color:#111827}
    #kairos-concierge[data-offset="back-to-top"]{bottom:88px}
    .kc-launcher{width:58px;height:58px;border:0;border-radius:50%;background:#0071e3;color:#fff;box-shadow:0 16px 45px rgba(0,113,227,.34);font-size:25px;cursor:pointer;display:grid;place-items:center}
    .kc-panel{position:absolute;right:0;bottom:70px;width:min(390px,calc(100vw - 28px));height:min(620px,calc(100vh - 120px));background:rgba(255,255,255,.98);border:1px solid rgba(15,23,42,.12);border-radius:24px;box-shadow:0 24px 80px rgba(15,23,42,.2);overflow:hidden;display:none;grid-template-rows:auto auto 1fr auto;backdrop-filter:blur(20px)}
    .kc-panel[data-open="true"]{display:grid}
    .kc-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(15,23,42,.09)}
    .kc-title{display:flex;gap:10px;align-items:center}.kc-mark{width:34px;height:34px;border-radius:11px;background:#071a34;color:#fff;display:grid;place-items:center;font-weight:800}.kc-title strong{display:block;font-size:15px}.kc-title small{display:block;color:#687386;font-size:12px;margin-top:1px}
    .kc-close{border:0;background:transparent;font-size:22px;cursor:pointer;color:#4b5563}
    .kc-quick{display:flex;gap:7px;overflow:auto;padding:9px 12px;border-bottom:1px solid rgba(15,23,42,.08);background:#fbfdff;scrollbar-width:none}.kc-quick::-webkit-scrollbar{display:none}
    .kc-chip{flex:0 0 auto;border:1px solid rgba(15,23,42,.12);border-radius:999px;background:#fff;color:#243044;padding:7px 10px;font:700 11px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;cursor:pointer}
    .kc-log{padding:17px;overflow:auto;display:flex;flex-direction:column;gap:12px;background:linear-gradient(#fbfdff,#f7faff)}
    .kc-msg{max-width:86%;padding:11px 13px;border-radius:16px;line-height:1.42;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.kc-user{align-self:flex-end;background:#0071e3;color:#fff;border-bottom-right-radius:5px}.kc-kairos{align-self:flex-start;background:#fff;border:1px solid rgba(15,23,42,.1);border-bottom-left-radius:5px}.kc-status{align-self:flex-start;color:#6b7280;font-size:12px;padding:0 3px}
    .kc-compose{padding:12px;border-top:1px solid rgba(15,23,42,.09);background:#fff}.kc-row{display:grid;grid-template-columns:42px 1fr 42px;gap:8px;align-items:end}.kc-mic,.kc-send{width:42px;height:42px;border-radius:50%;border:1px solid rgba(15,23,42,.12);background:#fff;cursor:pointer;font-size:17px}.kc-mic[data-listening="true"]{background:#fee2e2;border-color:#fecaca}.kc-mic[data-voice="true"]{box-shadow:0 0 0 3px rgba(0,113,227,.12)}.kc-send{background:#111827;color:#fff;border-color:#111827}.kc-send:disabled,.kc-mic:disabled{opacity:.55;cursor:wait}.kc-input{width:100%;min-height:42px;max-height:120px;resize:none;border:1px solid rgba(15,23,42,.14);border-radius:18px;padding:10px 12px;font:inherit;line-height:1.35;outline:none}.kc-input:focus{border-color:#2997ff;box-shadow:0 0 0 3px rgba(41,151,255,.12)}
    .kc-note{font-size:11px;color:#7b8493;margin:7px 4px 0;text-align:center}
    @media(max-width:600px){#kairos-concierge{right:14px;bottom:14px}#kairos-concierge[data-offset="back-to-top"]{bottom:82px}.kc-panel{position:fixed;inset:12px;width:auto;height:auto;border-radius:22px}.kc-launcher{width:54px;height:54px}}
    @media(prefers-reduced-motion:reduce){.kc-panel,.kc-launcher,.kc-log{scroll-behavior:auto}}
  `;
  document.head.appendChild(style);

  const host = document.createElement("aside");
  host.id = "kairos-concierge";
  host.setAttribute("aria-label", "Kairos Concierge");
  host.innerHTML = `
    <section class="kc-panel" data-open="false" role="dialog" aria-modal="false" aria-label="Kairos Concierge" aria-busy="false">
      <header class="kc-head"><div class="kc-title"><span class="kc-mark">K</span><span><strong>Kairos Concierge</strong><small>${surfaceLabel()}</small></span></div><button class="kc-close" type="button" aria-label="Close Concierge">×</button></header>
      <div class="kc-quick" aria-label="Quick requests"></div>
      <div class="kc-log" aria-live="polite" aria-relevant="additions text"></div>
      <form class="kc-compose"><div class="kc-row"><button class="kc-mic" type="button" aria-label="Speak to Kairos" title="Microphone permission is requested only when you tap this button">🎙</button><textarea class="kc-input" rows="1" maxlength="6000" placeholder="Ask Kairos…" aria-label="Message Kairos"></textarea><button class="kc-send" type="submit" aria-label="Send">↑</button></div><div class="kc-note">Text always works. Voice activates only after your permission.</div></form>
    </section>
    <button class="kc-launcher" type="button" aria-label="Open Kairos Concierge" aria-expanded="false" aria-controls="kairos-concierge-panel">✦</button>`;

  const panel = host.querySelector(".kc-panel");
  panel.id = "kairos-concierge-panel";
  document.body.appendChild(host);
  syncBackToTopOffset();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncBackToTopOffset, { once: true });
  }
  setTimeout(syncBackToTopOffset, 250);

  const quick = host.querySelector(".kc-quick");
  quickPrompts().forEach((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "kc-chip";
    button.textContent = label;
    button.addEventListener("click", () => submitMessage(label));
    quick.appendChild(button);
  });

  host.querySelector(".kc-launcher").addEventListener("click", toggle);
  host.querySelector(".kc-close").addEventListener("click", () => setOpen(false));
  host.querySelector(".kc-compose").addEventListener("submit", onSubmit);
  host.querySelector(".kc-input").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      host.querySelector(".kc-compose").requestSubmit();
    }
  });
  host.querySelector(".kc-mic").addEventListener("click", toggleVoice);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && state.open) setOpen(false);
  });
  renderMessages();
}

function surfaceLabel() {
  if (SECURE_CUSTOMER_PORTAL) return "Authenticated customer assistant";
  if (STOREFRONT) return "Mindset Media Group assistant";
  return "Private runtime assistant";
}

function quickPrompts() {
  if (SECURE_CUSTOMER_PORTAL) return ["Project status", "Approvals", "Deliverables", "Support"];
  if (PUBLIC_CUSTOMER_PORTAL) return ["Secure Portal", "Project Guide", "Customer Service", "Services"];
  if (STOREFRONT) return ["Customer Portal", "Services", "Free Tools", "Customer Service"];
  return ["Runtime status", "Command Center", "Customer Portal", "Support boundary"];
}

function syncBackToTopOffset() {
  const host = document.querySelector("#kairos-concierge");
  if (!host) return;
  if (document.querySelector(".back, .mmg-global-backtop")) host.dataset.offset = "back-to-top";
  else delete host.dataset.offset;
}

async function hydrateIdentity() {
  if (!SECURE_CUSTOMER_PORTAL) return;
  try {
    const response = await fetch("/api/customer/auth/session?t=" + Date.now(), {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    const id = typeof payload?.customer?.id === "string" ? payload.customer.id.trim() : "";
    if (!response.ok || payload?.authenticated !== true || !id) return;
    state.customerId = id;
    storageKey = `${BASE_STORAGE_KEY}:customer:${hashText(id)}`;
    state.messages = loadHistory();
    renderMessages();
  } catch {}
}

function hashText(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function toggle() { setOpen(!state.open); }

function setOpen(open) {
  state.open = open;
  const host = document.querySelector("#kairos-concierge");
  if (!host) return;
  host.querySelector(".kc-panel").dataset.open = String(open);
  host.querySelector(".kc-launcher").setAttribute("aria-expanded", String(open));
  if (open) setTimeout(() => host.querySelector(".kc-input").focus(), 20);
  else {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    host.querySelector(".kc-launcher").focus();
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const input = document.querySelector("#kairos-concierge .kc-input");
  await submitMessage(input?.value || "");
}

async function submitMessage(raw) {
  if (state.busy) return;
  const text = String(raw || "").trim();
  if (!text) return;

  const input = document.querySelector("#kairos-concierge .kc-input");
  if (input) input.value = "";
  append("user", text);
  setBusy(true);
  renderMessages("Kairos is working…");

  try {
    let reply;
    if (SECURE_CUSTOMER_PORTAL) reply = await answerCustomerRequest(text);
    else if (STOREFRONT) reply = answerStorefrontRequest(text);
    else reply = answerRuntimeRequest(text);
    append("kairos", reply);
    if (state.voiceEnabled) speak(reply);
  } catch (error) {
    const reply = error?.message || "Kairos could not complete that request.";
    append("kairos", reply);
    if (state.voiceEnabled) speak(reply);
  } finally {
    setBusy(false);
    renderMessages();
    input?.focus();
  }
}

function setBusy(busy) {
  state.busy = busy;
  const host = document.querySelector("#kairos-concierge");
  if (!host) return;
  host.querySelector(".kc-panel").setAttribute("aria-busy", String(busy));
  host.querySelector(".kc-send").disabled = busy;
  host.querySelector(".kc-mic").disabled = busy;
}

async function answerCustomerRequest(text) {
  const normalized = text.toLowerCase();

  if (/\b(support|help|problem|issue|billing|customer service)\b/u.test(normalized)) {
    const support = document.querySelector("#account");
    support?.scrollIntoView({ behavior: "smooth", block: "center" });
    return "I opened Account / Support. Use Mindset Media Group Customer Service for project questions, account help, delivery issues, billing questions, or resolution requests.";
  }

  if (!/\b(project|status|progress|timeline|approval|approve|proof|review|deliverable|download|file|package|asset)\b/u.test(normalized)) {
    return "I can securely help with your project status, approvals, deliverables, or customer support. Tell me which one you need.";
  }

  const payload = await customerProjects();
  const projects = Array.isArray(payload?.projects) ? payload.projects : [];

  if (/\b(approval|approve|proof|review)\b/u.test(normalized)) {
    const approvals = projects.flatMap(project =>
      (Array.isArray(project?.approvals) ? project.approvals : []).map(approval => ({ ...approval, project }))
    );
    const pending = approvals.filter(item => item?.status === "pending");
    document.querySelector("#approvals")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!pending.length) return "You have no customer approval gates waiting for a decision.";
    const names = pending.slice(0, 3).map(item => human(item?.gate || item?.project?.title || "approval"));
    return `${pending.length} approval${pending.length === 1 ? " is" : "s are"} waiting for you: ${names.join(", ")}.`;
  }

  if (/\b(deliverable|download|file|package|asset)\b/u.test(normalized)) {
    const deliverables = projects.flatMap(project =>
      (Array.isArray(project?.deliverables) ? project.deliverables : []).map(deliverable => ({ ...deliverable, project }))
    );
    const downloadable = deliverables.filter(item => item?.project?.packageDownloadAvailable === true);
    document.querySelector("#deliverables")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!deliverables.length) return "No customer-visible deliverables are available yet.";
    return `${deliverables.length} customer-visible deliverable${deliverables.length === 1 ? "" : "s"} found; ${downloadable.length} project${downloadable.length === 1 ? " has" : "s have"} final package download enabled.`;
  }

  document.querySelector("#projects")?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (!projects.length) return "Your secure Kairos workspace is connected, but no active customer-linked projects are listed yet.";
  const active = projects.filter(project => !["delivered", "archived", "cancelled"].includes(String(project?.state || "").toLowerCase()));
  const top = active[0] || projects[0];
  const percent = Math.max(0, Math.min(100, Number(top?.progress?.percent) || 0));
  const next = String(top?.nextAction?.label || "").trim();
  return `${projects.length} project${projects.length === 1 ? "" : "s"} found; ${active.length} currently active. ${String(top?.title || top?.projectId || "Your leading project")} is at ${percent}%${next ? ` — next action: ${next}` : ""}.`;
}

function answerStorefrontRequest(text) {
  const normalized = text.toLowerCase();
  if (/\b(project|status|progress|timeline|approval|approve|proof|review|deliverable|download package|account|secure portal|secure workspace)\b/u.test(normalized)) {
    return `Private project and account data is available only inside the authenticated Kairos workspace. Open Customer Portal and use “Kairos Customer Portal” to continue securely: ${SECURE_PORTAL_URL}`;
  }
  if (/\b(customer portal|portal)\b/u.test(normalized)) {
    return PUBLIC_CUSTOMER_PORTAL
      ? `You are on the public Customer Portal entry page. Use the Kairos Customer Portal button to enter the secure workspace: ${SECURE_PORTAL_URL}`
      : "Open Customer Portal from the site navigation. Private project details remain inside the authenticated Kairos workspace.";
  }
  if (/\b(customer service|support|billing|help|problem|issue)\b/u.test(normalized)) {
    return "Use Customer Service from the site footer for account help, billing questions, delivery issues, or resolution requests.";
  }
  if (/\b(project guide|guide)\b/u.test(normalized)) {
    return "Open the Project Guide from the Customer Portal or Services experience for publishing-project instructions and next steps.";
  }
  if (/\b(free tool|free tools|creator tool|toolkit)\b/u.test(normalized)) {
    return "Open Free Tools from the main navigation to access Mindset Media Group creator resources.";
  }
  if (/\b(service|publishing|publish|book build|cover design)\b/u.test(normalized)) {
    return "Open Services from the main navigation to review Mindset Media Group publishing and production services.";
  }
  if (/\b(catalog|product|digital download|download)\b/u.test(normalized)) {
    return "Open Catalog from the main navigation to browse Mindset Media Group digital products and resources.";
  }
  return "I can guide you to Catalog, Free Tools, Services, Customer Portal, or Customer Service. Private project and account information is handled only inside the authenticated Kairos workspace.";
}

function answerRuntimeRequest(text) {
  const normalized = text.toLowerCase();
  if (/\b(runtime|status|provider|inference)\b/u.test(normalized)) {
    return "Kairos Concierge is mounted on the governed runtime surface. External model-provider calls are disabled; operational actions stay inside the Command Center and approval-gated workflows.";
  }
  if (/\b(customer|portal)\b/u.test(normalized)) {
    return `Customer account and project assistance belongs in the authenticated Kairos Customer Portal: ${SECURE_PORTAL_URL}`;
  }
  if (/\b(command|objective|workflow|operation|action)\b/u.test(normalized)) {
    return "Use the Kairos Command Center controls for governed objectives and operational workflows. Concierge does not convert free-form chat into operational project creation.";
  }
  return "Kairos Concierge is available here for runtime guidance. Use the Command Center for governed operational actions, or the authenticated Customer Portal for private customer-project assistance.";
}

async function customerProjects() {
  const response = await fetch("/api/kairos/customer/projects?t=" + Date.now(), {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("Your secure customer session has expired. Sign in again to continue.");
  if (!response.ok || payload?.success !== true || !Array.isArray(payload?.projects)) {
    throw new Error(payload?.error?.message || "Customer project data is unavailable right now.");
  }
  return payload;
}

async function toggleVoice() {
  if (state.listening) {
    stopVoice();
    return;
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition || !navigator.mediaDevices?.getUserMedia) {
    append("kairos", "Voice input is not supported by this browser. Type your request instead.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    state.voiceEnabled = true;
    document.querySelector("#kairos-concierge .kc-mic").dataset.voice = "true";
  } catch {
    state.voiceEnabled = false;
    append("kairos", "Microphone access was not granted. Text input remains available.");
    return;
  }

  const recognition = new Recognition();
  recognition.lang = document.documentElement.lang || "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = event => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (!transcript) return;
    const input = document.querySelector("#kairos-concierge .kc-input");
    if (input) input.value = transcript;
    queueMicrotask(() => document.querySelector("#kairos-concierge .kc-compose")?.requestSubmit());
  };
  recognition.onerror = () => stopVoice();
  recognition.onend = () => stopVoice();
  state.recognition = recognition;
  state.listening = true;
  document.querySelector("#kairos-concierge .kc-mic").dataset.listening = "true";
  recognition.start();
}

function stopVoice() {
  try { state.recognition?.stop(); } catch {}
  state.recognition = null;
  state.listening = false;
  const button = document.querySelector("#kairos-concierge .kc-mic");
  if (button) button.dataset.listening = "false";
}

function speak(text) {
  if (!state.voiceEnabled || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 3500));
    utterance.lang = document.documentElement.lang || "en-US";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

function append(role, text) {
  state.messages.push({ role, text: String(text), at: new Date().toISOString() });
  state.messages = state.messages.slice(-MAX_HISTORY);
  try { localStorage.setItem(storageKey, JSON.stringify(state.messages)); } catch {}
  renderMessages();
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (Array.isArray(parsed)) {
      return parsed
        .filter(item => item && ["user", "kairos"].includes(item.role) && typeof item.text === "string")
        .slice(-MAX_HISTORY);
    }
  } catch {}
  return [];
}

function renderMessages(status = "") {
  const log = document.querySelector("#kairos-concierge .kc-log");
  if (!log) return;
  const items = state.messages.length
    ? state.messages
    : [{ role: "kairos", text: welcomeMessage() }];
  log.innerHTML = items
    .map(item => `<div class="kc-msg ${item.role === "user" ? "kc-user" : "kc-kairos"}">${escapeHTML(item.text)}</div>`)
    .join("") + (status ? `<div class="kc-status">${escapeHTML(status)}</div>` : "");
  log.scrollTop = log.scrollHeight;
}

function welcomeMessage() {
  if (SECURE_CUSTOMER_PORTAL) return "I’m Kairos Concierge. Ask me about your project status, approvals, deliverables, or customer support.";
  if (STOREFRONT) return "I’m Kairos Concierge. I can guide you through Mindset Media Group services, tools, Customer Portal, and support without exposing private account data on the public storefront.";
  return "I’m Kairos Concierge. I can guide you across the governed Kairos runtime; use Command Center controls for operational actions.";
}

function human(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/gu, character => character.toUpperCase());
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  })[character]);
}

window.KairosConcierge = Object.freeze({
  build: CONCIERGE_BUILD,
  surface: SURFACE,
  securePortalUrl: SECURE_PORTAL_URL,
  open: () => setOpen(true),
  close: () => setOpen(false),
  send: submitMessage,
});
