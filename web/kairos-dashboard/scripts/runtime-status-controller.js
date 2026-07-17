const BUILD = "kairos-runtime-status-controller-20260717-2";
const HEALTH_URL = "/api/health";
const REQUEST_TIMEOUT_MS = 7000;
const ONLINE_STATES = new Set(["ready", "ok", "operational"]);
let runtimeState = "checking";
let lastLatency = null;
let retryTimer = null;
let running = false;

start();

function start() {
  updateClock();
  installHeaderAuthority();
  enforceStatus();
  probeHealth();
  window.addEventListener("online", probeHealth);
  window.addEventListener("focus", probeHealth);
  window.addEventListener("pageshow", probeHealth);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) probeHealth();
  });
}

function installHeaderAuthority() {
  const root = document.querySelector("#kairos-hub");
  if (!root) {
    setTimeout(installHeaderAuthority, 50);
    return;
  }
  const observer = new MutationObserver(() => enforceStatus());
  observer.observe(root, { childList: true, subtree: true });
}

async function probeHealth() {
  if (running) return;
  running = true;
  clearTimeout(retryTimer);
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${HEALTH_URL}?runtime-header=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache", "X-MMG-Client-Build": BUILD },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    runtimeState = response.ok && ONLINE_STATES.has(String(body?.status || "").toLowerCase()) ? "online" : "offline";
    lastLatency = Math.max(1, Math.round(performance.now() - started));
    enforceStatus();
    scheduleNext(runtimeState === "online" ? 30000 : 5000);
  } catch {
    runtimeState = "offline";
    lastLatency = null;
    enforceStatus();
    scheduleNext(3000);
  } finally {
    clearTimeout(timeout);
    running = false;
  }
}

function enforceStatus() {
  updateClock();
  const root = document.querySelector("#kairos-hub");
  if (!root) return;
  const online = runtimeState === "online";
  const checking = runtimeState === "checking";
  const dot = root.querySelector("[data-runtime-dot]");
  const label = root.querySelector("[data-runtime-label]");
  const signal = root.querySelector("[data-runtime-signal]");
  const card = root.querySelector("[data-runtime-card]");
  const value = root.querySelector("[data-runtime-value]");
  const detail = root.querySelector("[data-runtime-detail]");
  const wave = root.querySelector("[data-runtime-wave]");

  if (dot) dot.className = `state-dot ${online ? "" : checking ? "checking" : "offline"}`.trim();
  if (label) label.textContent = online ? "Online" : checking ? "Checking" : "Offline";
  if (signal) signal.textContent = online ? "Live" : checking ? "Checking runtime" : "Runtime unavailable";
  if (card) card.dataset.state = online ? "live" : "limited";
  if (value) value.textContent = online ? "Online" : checking ? "Checking" : "Unavailable";
  if (detail) detail.textContent = lastLatency ? `${lastLatency} ms response` : checking ? "Verifying live health" : "No health response";
  wave?.classList.toggle("active", online);

  window.dispatchEvent(new CustomEvent("kairos:runtime-status", {
    detail: { online, checking, latency: lastLatency, build: BUILD },
  }));
}

function updateClock() {
  const target = document.querySelector("[data-runtime-time]");
  if (target) target.textContent = new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function scheduleNext(delay) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(probeHealth, delay);
}
