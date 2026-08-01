const BUILD =
  "kairos-manuscript-production-flow-bootstrap-20260801-1-direct-open";
const RELEASE =
  "manuscript-post-intake-stability-20260731-1";
const COMMAND_RUNTIME_RELEASE =
  "five-center-dashboard-post-intake-stability-20260731-1";
const BOOT_TIMEOUT_MS = 20_000;

try {
  await importWithDeadline(
    `./kairos-state-fetch-install.js?v=${RELEASE}`,
    "bounded state transport",
  );

  // Install the direct-route owner before the large command runtime. It waits
  // for Manuscript Studio to mount and prevents a blank advanced-mode shell.
  await importWithDeadline(
    `./manuscript-direct-open-controller.js?v=${RELEASE}`,
    "Manuscript Studio direct-open recovery",
  );

  await importWithDeadline(
    `./legacy-runtime-loader.js?v=${COMMAND_RUNTIME_RELEASE}`,
    "command runtime loader",
  );

  if (window.KairosLegacyRuntime?.load) {
    await withDeadline(
      window.KairosLegacyRuntime.load(),
      BOOT_TIMEOUT_MS,
      "command runtime initialization",
    );
  }

  // manuscript-auto-pipeline.js is evaluated exactly once by the command runtime.
  // Do not import it again under a second query URL.
  await importWithDeadline(
    `./manuscript-production-flow-guard.js?v=${RELEASE}`,
    "production flow guard",
  );

  window.KairosManuscriptProductionFlowBootstrap = Object.freeze({
    build: BUILD,
    release: RELEASE,
    commandRuntimeRelease: COMMAND_RUNTIME_RELEASE,
    controllerBuild: window.KairosManuscriptAutoPipelineController?.build || null,
    executionMode: window.KairosManuscriptAutoPipelineController?.executionMode || null,
    boundedStateTransport: true,
    directOpenController: window.KairosManuscriptDirectOpen?.build || null,
    postIntakeGuard: window.KairosManuscriptPostIntakeGuard?.build || null,
    singleControllerOwner: "legacy-runtime-loader",
    ready: true,
  });
} catch (error) {
  console.error("[kairos-bootstrap] command center failed", {
    build: BUILD,
    release: RELEASE,
    commandRuntimeRelease: COMMAND_RUNTIME_RELEASE,
    href: location.href,
    message: error?.message || String(error),
    stack: error?.stack || "",
  });
  renderBootstrapFailure(error);
}

function importWithDeadline(url, label) {
  return withDeadline(import(url), BOOT_TIMEOUT_MS, label);
}

function withDeadline(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} did not finish within ${milliseconds} ms.`));
      }, milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

function renderBootstrapFailure(error) {
  const existing = document.querySelector("#kairos-bootstrap-failure");
  if (existing) return;

  const panel = document.createElement("section");
  panel.id = "kairos-bootstrap-failure";
  panel.setAttribute("role", "alert");
  panel.innerHTML = `
    <p class="eyebrow">Kairos recovery</p>
    <h1>The Command Center could not finish loading</h1>
    <p>${escapeHTML(error?.message || "A runtime module did not finish loading.")}</p>
    <button type="button" data-kairos-reload>Reload Command Center</button>
  `;
  Object.assign(panel.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "grid",
    alignContent: "center",
    gap: "12px",
    padding: "28px",
    background: "#05070a",
    color: "#f7f9fc",
    fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
  });
  panel.querySelector("[data-kairos-reload]")?.addEventListener("click", () => location.reload());
  document.body.append(panel);
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
