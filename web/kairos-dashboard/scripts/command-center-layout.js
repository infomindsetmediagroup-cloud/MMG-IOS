const BUILD = "kairos-command-center-layout-20260713-4";

const layoutState = {
  menuOpen: false,
  online: "Connecting",
  onlineState: "checking",
  activeWork: "0",
  capabilities: "—",
};

let observer;
let scheduled = false;

start();

function start() {
  observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyLayout();
    });
  });
  observe();
  applyLayout();
}

function observe() {
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function applyLayout() {
  const hub = document.querySelector("#kairos-hub");
  const header = hub?.querySelector(".app-header");
  const hero = hub?.querySelector(".hero");
  if (!hub || !header || !hero) return;

  observer?.disconnect();
  try {
    captureMetricValues(hub.querySelector(".metrics"));
    hub.querySelector(".metrics")?.remove();
    header.querySelector(".app-header-status")?.remove();

    const heroCopy = hero.querySelector(".hero-copy");
    if (heroCopy) heroCopy.textContent = "Real-time visibility. Governed tools. Measurable outcomes.";

    let strip = hub.querySelector("#command-status-strip");
    if (!strip) {
      strip = document.createElement("section");
      strip.id = "command-status-strip";
      strip.className = "command-status-strip";
      header.insertAdjacentElement("afterend", strip);
    }

    strip.innerHTML = `<button class="command-menu-button" type="button" aria-label="Open operating centers" aria-expanded="${layoutState.menuOpen}" data-command-menu><span></span><span></span><span></span></button><div class="command-indicator command-online"><i class="${layoutState.onlineState}"></i><span>${escapeHTML(layoutState.online)}</span></div><div class="command-indicator"><small>Active Work</small><strong>${escapeHTML(layoutState.activeWork)}</strong></div><div class="command-indicator"><small>Capabilities</small><strong>${escapeHTML(layoutState.capabilities)}</strong></div><div class="command-indicator"><small>Entry Points</small><strong>25</strong></div>`;

    let menu = hub.querySelector("#command-center-menu");
    if (!menu) {
      menu = document.createElement("nav");
      menu.id = "command-center-menu";
      menu.className = "command-center-menu";
      menu.setAttribute("aria-label", "Operating centers");
      strip.insertAdjacentElement("afterend", menu);
    }

    menu.hidden = !layoutState.menuOpen;
    menu.innerHTML = [
      ["Knowledge", "knowledge"],
      ["Content", "content"],
      ["Business", "business"],
      ["Customers", "customers"],
      ["Operations", "operations"],
    ].map(([label, id]) => `<button type="button" data-menu-center="${id}">${label}</button>`).join("");

    strip.querySelector("[data-command-menu]")?.addEventListener("click", () => {
      layoutState.menuOpen = !layoutState.menuOpen;
      applyLayout();
    });

    menu.querySelectorAll("[data-menu-center]").forEach(button => button.addEventListener("click", () => {
      layoutState.menuOpen = false;
      const target = hub.querySelector(`[data-center="${button.dataset.menuCenter}"]`);
      target?.click();
      applyLayout();
    }));
  } finally {
    observe();
  }
}

function captureMetricValues(metrics) {
  if (!metrics) return;
  const cards = [...metrics.querySelectorAll(".metric")];
  const read = label => cards.find(card => card.querySelector("span")?.textContent?.trim().toLowerCase() === label)?.querySelector("strong")?.textContent?.trim();
  const runtime = read("runtime");
  const active = read("active work");
  const capabilities = read("capabilities");
  if (runtime) {
    layoutState.online = runtime === "Online" ? "Online" : runtime;
    layoutState.onlineState = runtime === "Online" ? "" : "checking";
  }
  if (active) layoutState.activeWork = active;
  if (capabilities) layoutState.capabilities = capabilities;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

window.KairosCommandCenterLayout = { build: BUILD, refresh: applyLayout };
