// Safari-safe Command Center boot. The primary workspace renders before optional modules load.
const BUILD = "kairos-command-hub-loader-20260717-5";
const HUB_SELECTOR = "#kairos-hub";
const LOADING_TEXT = "Loading Kairos Command Center";
const SOURCE_URL = "/scripts/command-hub.js?v=operational-20260717-14";

(() => {
  const hub = document.querySelector(HUB_SELECTOR);
  const startupErrors = [];
  window.addEventListener("error", event => {
    startupErrors.push(String(event?.error?.message || event?.message || "Unknown startup error"));
  });
  window.addEventListener("unhandledrejection", event => {
    startupErrors.push(String(event?.reason?.message || event?.reason || "Unhandled startup rejection"));
  });

  try {
    const source = readSourceSynchronously(SOURCE_URL);
    const transformed = detachWorkspaceModuleDependency(source);
    executeClassicScript(transformed);
    assertInitialized(hub);
    document.documentElement.dataset.kairosBoot = "ready";
    window.KairosCommandHubLoader = { build: BUILD, status: "ready", mode: "classic-same-origin", errors: startupErrors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Command Center startup failed");
    startupErrors.push(message);
    renderFailure(hub, message);
    document.documentElement.dataset.kairosBoot = "failed";
    window.KairosCommandHubLoader = { build: BUILD, status: "failed", mode: "classic-same-origin", errors: startupErrors };
  }
})();

function readSourceSynchronously(url) {
  const request = new XMLHttpRequest();
  request.open("GET", `${url}&boot=${Date.now()}`, false);
  request.setRequestHeader("Cache-Control", "no-cache");
  request.send(null);
  if (request.status < 200 || request.status >= 300) {
    throw new Error(`Command Center source returned HTTP ${request.status || 0}.`);
  }
  const source = String(request.responseText || "");
  if (!source.includes('const BUILD="kairos-command-hub') || !source.includes("renderApp();")) {
    throw new Error("Command Center source did not contain the verified application runtime.");
  }
  return source;
}

function detachWorkspaceModuleDependency(source) {
  const importPattern = /^import\{cleanupDomainWorkspace,isDomainWorkspace,openDomainWorkspace\}from"\.\/workspace-runtime\.js\?v=20260716-2";\s*/;
  if (!importPattern.test(source)) {
    throw new Error("Command Center dependency boundary did not match the verified source.");
  }
  const compatibility = `
const cleanupDomainWorkspace=()=>window.KairosWorkspaceRuntime?.cleanup?.();
const isDomainWorkspace=id=>Boolean(window.KairosWorkspaceRuntime?.registry?.[id]);
const openDomainWorkspace=(id,detail={})=>window.KairosWorkspaceRuntime?.open?.(id,detail)??Promise.resolve(false);
`;
  return source.replace(importPattern, compatibility);
}

function executeClassicScript(source) {
  const script = document.createElement("script");
  script.dataset.kairosPrimaryRuntime = BUILD;
  script.text = `${source}\n//# sourceURL=/scripts/command-hub-classic-runtime.js`;
  document.head.appendChild(script);
}

function assertInitialized(hub) {
  const text = hub?.textContent || "";
  const initialized = Boolean(hub?.querySelector("#command-view")) && !text.includes(LOADING_TEXT);
  if (!initialized || !window.KairosCommandHub) {
    throw new Error("Command Center runtime executed but did not initialize the Website workspace.");
  }
}

function renderFailure(hub, message) {
  if (!hub) return;
  hub.innerHTML = `
    <main class="command-view">
      <section class="job routed-job" style="margin:24px auto;max-width:760px">
        <p class="eyebrow">Startup recovery</p>
        <h1 style="margin:0 0 12px">Kairos could not finish opening.</h1>
        <p class="error">${escapeHTML(message)}</p>
        <p>The application source is online, but startup could not complete. Reloading requests a clean app shell.</p>
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
