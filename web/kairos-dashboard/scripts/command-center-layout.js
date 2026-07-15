const BUILD = "kairos-command-center-layout-20260714-8";

const layoutState = {
  menuOpen: false,
  online: "Connecting",
  onlineState: "checking",
  activeWork: "0",
  finishedWork: "0",
  workToBeDone: "0",
};

let observer;
let scheduled = false;

start();

function start() {
  document.addEventListener("click", handleCommandClick, true);
  document.addEventListener("keydown", handleCommandKeydown, true);
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

function handleCommandClick(event) {
  const toggle = event.target.closest?.("[data-command-menu]");
  if (toggle) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setMenuOpen(!layoutState.menuOpen);
    return;
  }

  const center = event.target.closest?.("[data-menu-center]");
  if (center) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const hub = document.querySelector("#kairos-hub");
    const target = hub?.querySelector(`[data-center="${center.dataset.menuCenter}"]`);
    layoutState.menuOpen = false;
    target?.click();
    applyLayout();
    return;
  }

  const pulse = event.target.closest?.("[data-work-pulse]");
  if (pulse) {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { filter: pulse.dataset.workPulse } }));
  }
}

function handleCommandKeydown(event) {
  if (event.key === "Escape" && layoutState.menuOpen) {
    event.preventDefault();
    setMenuOpen(false);
  }
}

function setMenuOpen(open) {
  layoutState.menuOpen = Boolean(open);
  applyLayout();
  requestAnimationFrame(() => {
    const button = document.querySelector("[data-command-menu]");
    const menu = document.querySelector("#command-center-menu");
    button?.setAttribute("aria-expanded", String(layoutState.menuOpen));
    if (menu) menu.hidden = !layoutState.menuOpen;
    if (layoutState.menuOpen) menu?.querySelector("button")?.focus({ preventScroll: true });
  });
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

    strip.innerHTML = `<button class="command-menu-button" type="button" aria-label="${layoutState.menuOpen ? "Close" : "Open"} operating centers" aria-expanded="${layoutState.menuOpen}" data-command-menu><span></span><span></span><span></span></button><div class="command-indicator command-online"><i class="${layoutState.onlineState}"></i><span>${escapeHTML(layoutState.online)}</span></div>${pulseButton("active","In Progress",layoutState.activeWork)}${pulseButton("finished","Done 24h",layoutState.finishedWork)}${pulseButton("pending","Not Started",layoutState.workToBeDone)}`;

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
  } finally {
    observe();
  }
}

function pulseButton(filter, label, value) {
  return `<button class="command-indicator command-pulse" type="button" data-work-pulse="${filter}" aria-label="Open ${escapeHTML(label)} workflows"><small>${escapeHTML(label)}</small><strong>${escapeHTML(value)}</strong></button>`;
}

function captureMetricValues(metrics) {
  if (!metrics) return;
  const cards = [...metrics.querySelectorAll(".metric")];
  const read = label => cards.find(card => card.querySelector("span")?.textContent?.trim().toLowerCase() === label)?.querySelector("strong")?.textContent?.trim();
  const runtime = read("runtime");
  const active = read("active work");
  const finished = read("finished work");
  const remaining = read("work to be done");
  if (runtime) {
    layoutState.online = runtime === "Online" ? "Online" : runtime;
    layoutState.onlineState = runtime === "Online" ? "" : "checking";
  }
  if (active !== undefined) layoutState.activeWork = active;
  if (finished !== undefined) layoutState.finishedWork = finished;
  if (remaining !== undefined) layoutState.workToBeDone = remaining;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

window.KairosCommandCenterLayout = { build: BUILD, refresh: applyLayout, setMenuOpen };
