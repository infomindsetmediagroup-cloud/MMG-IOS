const BUILD = "kairos-command-hub-loader-20260717-1";
const HUB_SELECTOR = "#kairos-hub";
const LOADING_TEXT = "Loading Kairos Command Center";
const MODULE_URL = "/scripts/command-hub.js?v=operational-20260717-13";

const startupErrors = [];
window.addEventListener("error", event => {
  const message = event?.error?.message || event?.message || "Unknown startup error";
  startupErrors.push(String(message));
});
window.addEventListener("unhandledrejection", event => {
  const message = event?.reason?.message || event?.reason || "Unhandled startup rejection";
  startupErrors.push(String(message));
});

boot();

async function boot() {
  const hub = document.querySelector(HUB_SELECTOR);
  try {
    await import(MODULE_URL);
    await waitForInitialization(hub, 8000);
    document.documentElement.dataset.kairosBoot = "ready";
    window.KairosCommandHubLoader = { build: BUILD, status: "ready", errors: startupErrors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Command Center startup failed");
    startupErrors.push(message);
    renderFailure(hub, message);
    document.documentElement.dataset.kairosBoot = "failed";
    window.KairosCommandHubLoader = { build: BUILD, status: "failed", errors: startupErrors };
  }
}

function waitForInitialization(hub, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const text = hub?.textContent || "";
      const initialized = Boolean(hub?.querySelector("#command-view")) && !text.includes(LOADING_TEXT);
      if (initialized) return resolve();
      if (Date.now() - started >= timeoutMs) return reject(new Error("Command Center module loaded but did not initialize the workspace."));
      setTimeout(check, 150);
    };
    check();
  });
}

function renderFailure(hub, message) {
  if (!hub) return;
  hub.innerHTML = `
    <main class="command-view">
      <section class="job routed-job" style="margin:24px auto;max-width:760px">
        <p class="eyebrow">Startup recovery</p>
        <h1 style="margin:0 0 12px">Kairos could not finish opening.</h1>
        <p class="error">${escapeHTML(message)}</p>
        <p>The app shell is online, but a browser module failed during startup. Reloading uses a fresh module address.</p>
        <div class="job-actions"><button class="primary" type="button" data-kairos-retry>Reload Kairos</button></div>
      </section>
    </main>`;
  hub.querySelector("[data-kairos-retry]")?.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.set("recovery", Date.now());
    location.replace(url.toString());
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}
