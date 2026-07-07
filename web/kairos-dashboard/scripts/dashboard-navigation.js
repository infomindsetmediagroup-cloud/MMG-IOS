import { expandPanel } from "./panel-layout.js";
import { pushNotification } from "./notifications.js";

const navStateKey = "kairos.dashboard.navigation.v2";

const departmentRules = [
  { id: "intake", label: "Intake", patterns: ["command", "intent", "router", "quick", "palette", "control"] },
  { id: "execution", label: "Execution", patterns: ["queue", "action", "handoff", "approval", "next", "brief", "task"] },
  { id: "commerce", label: "Commerce", patterns: ["shopify", "commerce", "revenue", "bundle", "product", "customer", "delivery"] },
  { id: "content", label: "Content", patterns: ["content", "knowledge", "vault", "taxonomy", "library"] },
  { id: "release", label: "Release", patterns: ["launch", "readiness", "qa", "deployment", "deploy", "rollback", "golden", "milestone", "verifier"] },
  { id: "system", label: "System", patterns: ["system", "health", "activity", "history", "cadence", "runtime", "export", "import", "offline", "keyboard", "diagnostics", "reset", "registry", "layout", "mobile", "notification", "focus", "display", "search", "operator"] }
];

function readState() {
  try {
    return JSON.parse(localStorage.getItem(navStateKey) || "null") || { collapsedDepartments: [] };
  } catch {
    return { collapsedDepartments: [] };
  }
}

function writeState(state) {
  localStorage.setItem(navStateKey, JSON.stringify(state));
  return state;
}

function safeId(value, fallback) {
  return String(value || fallback || "panel")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || fallback;
}

function titleFor(card) {
  return card.querySelector("h3")?.textContent?.trim() || card.dataset.panelId || "Panel";
}

function departmentFor(title) {
  const text = String(title || "").toLowerCase();
  return departmentRules.find(rule => rule.patterns.some(pattern => text.includes(pattern))) || { id: "operations", label: "Operations" };
}

function ensurePanelIdentity(card, index) {
  const title = titleFor(card);
  const id = card.dataset.panelId || safeId(title, "panel-" + index);
  const department = departmentFor(title);
  card.dataset.panelId = id;
  card.dataset.department = department.id;
  card.id = "kairos-" + id;
  return { id, title, department };
}

export function buildDashboardNavigationIndex() {
  const view = document.querySelector("#dashboard-view");
  if (!view) return [];

  return Array.from(view.querySelectorAll("article.card"))
    .map((card, index) => ({ card, ...ensurePanelIdentity(card, index) }))
    .filter(item => item.title !== "Panel");
}

function groupedIndex(index) {
  return index.reduce((groups, item) => {
    const key = item.department.id;
    if (!groups[key]) groups[key] = { ...item.department, items: [] };
    groups[key].items.push(item);
    return groups;
  }, {});
}

export function jumpToDashboardPanel(id) {
  const target = document.querySelector("#kairos-" + CSS.escape(id));
  if (!target) return false;

  expandPanel(id);
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("is-jump-target");
  setTimeout(() => target.classList.remove("is-jump-target"), 1200);
  pushNotification("Dashboard navigation", "Opened " + titleFor(target) + ".", "Info");
  return true;
}

function setActiveLink(id) {
  document.querySelectorAll("[data-dashboard-nav-target]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.dashboardNavTarget === id);
  });
}

function installScrollSpy(index) {
  if (!window.IntersectionObserver) return;
  const observer = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible?.target?.dataset?.panelId) setActiveLink(visible.target.dataset.panelId);
  }, { rootMargin: "-20% 0px -65% 0px", threshold: [0.08, 0.18, 0.3] });

  index.forEach(item => observer.observe(item.card));
}

function renderDashboardNavigation() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  const existing = sidebar.querySelector("[data-dashboard-navigation]");
  if (existing) existing.remove();

  const index = buildDashboardNavigationIndex();
  if (!index.length) return;

  const state = readState();
  const groups = groupedIndex(index);
  const nav = document.createElement("section");
  nav.className = "dashboard-navigation";
  nav.dataset.dashboardNavigation = "true";
  nav.innerHTML = `
    <div class="dashboard-navigation-header">
      <p class="eyebrow">Dashboard Index</p>
      <span class="badge">${index.length}</span>
    </div>
    ${Object.values(groups).map(group => {
      const collapsed = state.collapsedDepartments.includes(group.id);
      return `
        <div class="dashboard-navigation-group" data-dashboard-nav-group="${group.id}">
          <button class="dashboard-navigation-group-button" type="button" data-dashboard-nav-toggle="${group.id}">
            <span>${group.label}</span>
            <span>${collapsed ? "+" : "−"}</span>
          </button>
          <div class="dashboard-navigation-links" ${collapsed ? "hidden" : ""}>
            ${group.items.map(item => `<button type="button" class="dashboard-navigation-link" data-dashboard-nav-target="${item.id}">${item.title}</button>`).join("")}
          </div>
        </div>
      `;
    }).join("")}
  `;
  sidebar.appendChild(nav);

  nav.querySelectorAll("[data-dashboard-nav-target]").forEach(button => {
    button.addEventListener("click", () => jumpToDashboardPanel(button.dataset.dashboardNavTarget));
  });

  nav.querySelectorAll("[data-dashboard-nav-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const groupId = button.dataset.dashboardNavToggle;
      const current = readState();
      const collapsed = current.collapsedDepartments.includes(groupId);
      const next = collapsed
        ? current.collapsedDepartments.filter(item => item !== groupId)
        : [...current.collapsedDepartments, groupId];
      writeState({ ...current, collapsedDepartments: next });
      renderDashboardNavigation();
    });
  });

  installScrollSpy(index);
}

const observer = new MutationObserver(() => renderDashboardNavigation());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true, subtree: false });
  renderDashboardNavigation();
});
window.addEventListener("kairos:auth", renderDashboardNavigation);
window.addEventListener("kairos:panel-layout-updated", renderDashboardNavigation);
