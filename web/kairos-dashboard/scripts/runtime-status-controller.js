const BUILD = "kairos-runtime-status-controller-20260717-1";
const HEALTH_URL = "/api/health";
const REQUEST_TIMEOUT_MS = 8000;
const ONLINE_STATES = new Set(["ready", "ok", "operational"]);
let lastKnownOnline = false;
let retryTimer = null;

start();

function start() {
  updateClock();
  probeHealth();
  window.addEventListener("online", probeHealth);
  window.addEventListener("focus", probeHealth);
}

async function probeHealth() {
  clearTimeout(retryTimer);
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${HEALTH_URL}?header-status=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", "X-MMG-Client-Build": BUILD },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    const online = response.ok && ONLINE_STATES.has(String(body?.status || "").toLowerCase());
    lastKnownOnline = online;
    renderStatus(online, Math.max(1, Math.round(performance.now() - started)));
    scheduleNext(online ? 30000 : 5000);
  } catch {
    renderStatus(lastKnownOnline, null, true);
    scheduleNext(lastKnownOnline ? 15000 : 3000);
  } finally {
    clearTimeout(timeout);
  }
}

function renderStatus(online, latency, reconnecting = false) {
  const root = document.querySelector("#kairos-hub");
  if (!root) {
    scheduleNext(250);
    return;
  }
  updateClock();
  const dot = root.querySelector("[data-runtime-dot]");
  const label = root.querySelector("[data-runtime-label]");
  const signal = root.querySelector("[data-runtime-signal]");
  const card = root.querySelector("[data-runtime-card]");
  const value = root.querySelector("[data-runtime-value]");
  const detail = root.querySelector("[data-runtime-detail]");
  const wave = root.querySelector("[data-runtime-wave]");

  if (dot) dot.className = `state-dot ${online ? "" : reconnecting ? "checking" : "offline"}`.trim();
  if (label) label.textContent = online ? "Systems online" : reconnecting ? "Reconnecting" : "Attention required";
  if (signal) signal.textContent = online ? "Live" : reconnecting ? "Reconnecting" : "Runtime unavailable";
  if (card) card.dataset.state = online ? "live" : "limited";
  if (value) value.textContent = online ? "Online" : reconnecting ? "Connecting" : "Unavailable";
  if (detail) detail.textContent = latency ? `${latency} ms response` : reconnecting ? "Retrying health check" : "No response";
  wave?.classList.toggle("active", online);

  window.dispatchEvent(new CustomEvent("kairos:runtime-status", {
    detail: { online, latency, reconnecting, build: BUILD },
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
