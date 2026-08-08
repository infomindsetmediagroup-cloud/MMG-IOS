const CONCIERGE_BUILD = "kairos-concierge-20260807-1";
const STORAGE_KEY = "kairos:concierge:history:v1";
const MAX_HISTORY = 24;

const state = {
  open: false,
  busy: false,
  listening: false,
  recognition: null,
  messages: loadHistory(),
};

mount();

function mount() {
  if (document.querySelector("#kairos-concierge")) return;
  const style = document.createElement("style");
  style.textContent = `
    #kairos-concierge{position:fixed;right:22px;bottom:22px;z-index:9999;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;color:#111827}
    .kc-launcher{width:58px;height:58px;border:0;border-radius:50%;background:#0071e3;color:#fff;box-shadow:0 16px 45px rgba(0,113,227,.34);font-size:25px;cursor:pointer;display:grid;place-items:center}
    .kc-panel{position:absolute;right:0;bottom:70px;width:min(390px,calc(100vw - 28px));height:min(620px,calc(100vh - 120px));background:rgba(255,255,255,.98);border:1px solid rgba(15,23,42,.12);border-radius:24px;box-shadow:0 24px 80px rgba(15,23,42,.2);overflow:hidden;display:none;grid-template-rows:auto 1fr auto;backdrop-filter:blur(20px)}
    .kc-panel[data-open="true"]{display:grid}
    .kc-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(15,23,42,.09)}
    .kc-title{display:flex;gap:10px;align-items:center}.kc-mark{width:34px;height:34px;border-radius:11px;background:#071a34;color:#fff;display:grid;place-items:center;font-weight:800}.kc-title strong{display:block;font-size:15px}.kc-title small{display:block;color:#687386;font-size:12px;margin-top:1px}
    .kc-close{border:0;background:transparent;font-size:22px;cursor:pointer;color:#4b5563}
    .kc-log{padding:17px;overflow:auto;display:flex;flex-direction:column;gap:12px;background:linear-gradient(#fbfdff,#f7faff)}
    .kc-msg{max-width:86%;padding:11px 13px;border-radius:16px;line-height:1.42;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.kc-user{align-self:flex-end;background:#0071e3;color:#fff;border-bottom-right-radius:5px}.kc-kairos{align-self:flex-start;background:#fff;border:1px solid rgba(15,23,42,.1);border-bottom-left-radius:5px}.kc-status{align-self:flex-start;color:#6b7280;font-size:12px;padding:0 3px}
    .kc-compose{padding:12px;border-top:1px solid rgba(15,23,42,.09);background:#fff}.kc-row{display:grid;grid-template-columns:42px 1fr 42px;gap:8px;align-items:end}.kc-mic,.kc-send{width:42px;height:42px;border-radius:50%;border:1px solid rgba(15,23,42,.12);background:#fff;cursor:pointer;font-size:17px}.kc-mic[data-listening="true"]{background:#fee2e2;border-color:#fecaca}.kc-send{background:#111827;color:#fff;border-color:#111827}.kc-input{width:100%;min-height:42px;max-height:120px;resize:none;border:1px solid rgba(15,23,42,.14);border-radius:18px;padding:10px 12px;font:inherit;line-height:1.35;outline:none}.kc-input:focus{border-color:#2997ff;box-shadow:0 0 0 3px rgba(41,151,255,.12)}
    .kc-note{font-size:11px;color:#7b8493;margin:7px 4px 0;text-align:center}
    @media(max-width:600px){#kairos-concierge{right:14px;bottom:14px}.kc-panel{position:fixed;inset:12px;width:auto;height:auto;border-radius:22px}.kc-launcher{width:54px;height:54px}}
    @media(prefers-reduced-motion:reduce){.kc-panel,.kc-launcher{scroll-behavior:auto}}
  `;
  document.head.appendChild(style);

  const host = document.createElement("aside");
  host.id = "kairos-concierge";
  host.setAttribute("aria-label", "Kairos Concierge");
  host.innerHTML = `
    <section class="kc-panel" data-open="false" role="dialog" aria-modal="false" aria-label="Kairos Concierge">
      <header class="kc-head"><div class="kc-title"><span class="kc-mark">K</span><span><strong>Kairos Concierge</strong><small>Private runtime assistant</small></span></div><button class="kc-close" type="button" aria-label="Close Concierge">×</button></header>
      <div class="kc-log" aria-live="polite"></div>
      <form class="kc-compose"><div class="kc-row"><button class="kc-mic" type="button" aria-label="Speak to Kairos" title="Microphone permission is requested only when you tap this button">🎙</button><textarea class="kc-input" rows="1" maxlength="6000" placeholder="Ask Kairos…" aria-label="Message Kairos"></textarea><button class="kc-send" type="submit" aria-label="Send">↑</button></div><div class="kc-note">Text always works. Voice activates only after your permission.</div></form>
    </section>
    <button class="kc-launcher" type="button" aria-label="Open Kairos Concierge" aria-expanded="false">✦</button>`;
  document.body.appendChild(host);

  host.querySelector(".kc-launcher").addEventListener("click", toggle);
  host.querySelector(".kc-close").addEventListener("click", () => setOpen(false));
  host.querySelector(".kc-compose").addEventListener("submit", onSubmit);
  host.querySelector(".kc-input").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); host.querySelector(".kc-compose").requestSubmit(); }
  });
  host.querySelector(".kc-mic").addEventListener("click", toggleVoice);
  renderMessages();
}

function toggle(){ setOpen(!state.open); }
function setOpen(open){
  state.open = open;
  const host = document.querySelector("#kairos-concierge");
  host.querySelector(".kc-panel").dataset.open = String(open);
  host.querySelector(".kc-launcher").setAttribute("aria-expanded", String(open));
  if (open) setTimeout(() => host.querySelector(".kc-input").focus(), 20);
}

async function onSubmit(event){
  event.preventDefault();
  if (state.busy) return;
  const input = document.querySelector("#kairos-concierge .kc-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  append("user", text);
  state.busy = true;
  renderMessages("Kairos is working…");
  try {
    const history = state.messages.slice(-10).map(({role,text}) => ({role,text}));
    const response = await fetch("/api/hub/run", {
      method: "POST",
      headers: {"Content-Type":"application/json","X-MMG-Client-Build":CONCIERGE_BUILD},
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({
        action: "support-intelligence",
        objective: text,
        context: {surface:"kairos-concierge", history}
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error("Your secure session has expired. Sign in again to continue.");
    if (!response.ok) throw new Error(payload?.error?.message || "Kairos could not complete that request.");
    append("kairos", normalizeReply(payload));
  } catch (error) {
    append("kairos", error?.message || "Kairos could not complete that request.");
  } finally {
    state.busy = false;
    renderMessages();
  }
}

function normalizeReply(payload){
  if (typeof payload?.answer === "string" && payload.answer.trim()) return payload.answer.trim();
  if (typeof payload?.summary === "string" && payload.summary.trim()) {
    const sections = Array.isArray(payload.sections) ? payload.sections.map(section => section?.content).filter(Boolean) : [];
    return [payload.summary, ...sections, payload.nextAction ? `Next: ${payload.nextAction}` : ""].filter(Boolean).join("\n\n");
  }
  if (typeof payload?.result === "string") return payload.result;
  return "Kairos completed the request, but no conversational response was returned.";
}

async function toggleVoice(){
  if (state.listening) { stopVoice(); return; }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { append("kairos", "Voice input is not supported by this browser. Type your request instead."); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    stream.getTracks().forEach(track => track.stop());
  } catch {
    append("kairos", "Microphone access was not granted. Text input remains available.");
    return;
  }
  const recognition = new Recognition();
  recognition.lang = document.documentElement.lang || "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = event => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) document.querySelector("#kairos-concierge .kc-input").value = transcript;
  };
  recognition.onerror = () => stopVoice();
  recognition.onend = () => stopVoice();
  state.recognition = recognition;
  state.listening = true;
  document.querySelector("#kairos-concierge .kc-mic").dataset.listening = "true";
  recognition.start();
}

function stopVoice(){
  try { state.recognition?.stop(); } catch {}
  state.recognition = null;
  state.listening = false;
  const button = document.querySelector("#kairos-concierge .kc-mic");
  if (button) button.dataset.listening = "false";
}

function append(role,text){
  state.messages.push({role,text:String(text),at:new Date().toISOString()});
  state.messages = state.messages.slice(-MAX_HISTORY);
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.messages)); } catch {}
  renderMessages();
}

function loadHistory(){
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(parsed)) return parsed.filter(item => item && ["user","kairos"].includes(item.role) && typeof item.text === "string").slice(-MAX_HISTORY);
  } catch {}
  return [];
}

function renderMessages(status=""){
  const log = document.querySelector("#kairos-concierge .kc-log");
  if (!log) return;
  const items = state.messages.length ? state.messages : [{role:"kairos",text:"I’m Kairos Concierge. Ask me about your work, projects, publishing, site operations, or the next action."}];
  log.innerHTML = items.map(item => `<div class="kc-msg ${item.role === "user" ? "kc-user" : "kc-kairos"}">${escapeHTML(item.text)}</div>`).join("") + (status ? `<div class="kc-status">${escapeHTML(status)}</div>` : "");
  log.scrollTop = log.scrollHeight;
}

function escapeHTML(value){return String(value??"").replace(/[&<>'\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"})[c]);}
