const BUILD = "kairos-command-center-layout-20260713-1";

const layoutState = { menuOpen: false };

start();

function start() {
  const observer = new MutationObserver(() => applyLayout());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  applyLayout();
}

function applyLayout() {
  const hub = document.querySelector("#kairos-hub");
  const header = hub?.querySelector(".app-header");
  const hero = hub?.querySelector(".hero");
  if (!hub || !header || !hero) return;

  hub.querySelector(".metrics")?.remove();

  const heroCopy = hero.querySelector(".hero-copy");
  if (heroCopy) heroCopy.textContent = "Real-time visibility. Governed tools. Measurable outcomes.";

  let strip = hub.querySelector("#command-status-strip");
  if (!strip) {
    strip = document.createElement("section");
    strip.id = "command-status-strip";
    strip.className = "command-status-strip";
    header.insertAdjacentElement("afterend", strip);
  }

  const ready = Boolean(window.__kairosCommandState?.health?.status === "ready" || window.__kairosCommandState?.health?.status === "ok");
  const activeWork = Number(window.__kairosCommandState?.activeJobs || 0);
  const capabilities = capabilityCount();

  strip.innerHTML = `<button class="command-menu-button" type="button" aria-label="Open operating centers" aria-expanded="${layoutState.menuOpen}" data-command-menu><span></span><span></span><span></span></button><div class="command-indicator command-online"><i class="${ready ? "" : "checking"}"></i><span>Online</span></div><div class="command-indicator"><small>Active Work</small><strong>${activeWork}</strong></div><div class="command-indicator"><small>Capabilities</small><strong>${capabilities}</strong></div><div class="command-indicator"><small>Entry Points</small><strong>25</strong></div>`;

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
}

function capabilityCount() {
  const state = window.__kairosCommandState;
  const source = state?.capabilities?.capabilities || state?.health?.capabilities;
  if (!source || typeof source !== "object") return "—";
  return String(Object.values(source).filter(value => value === "available" || value === true || value === "operational").length);
}

window.KairosCommandCenterLayout = { build: BUILD, refresh: applyLayout };
