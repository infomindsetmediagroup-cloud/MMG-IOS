const BUILD = "kairos-publishing-production-center-20260713-3";
const PARENT_ID = "kairos-publishing-production-parent";

function enhance() {
  hideLegacyLaunchers();
  const workspace = document.querySelector("#workspace");
  if (!workspace) return;
  const eyebrow = workspace.querySelector(".workspace-head .eyebrow")?.textContent || "";
  if (!/Content Center/i.test(eyebrow)) return;
  const children = workspace.querySelector(".children");
  if (!children || children.querySelector(`#${PARENT_ID}`)) return;

  for (const card of children.querySelectorAll(".child-card")) {
    const title = card.querySelector("h3")?.textContent?.trim() || "";
    if (["Publishing Studio", "Creative Studio"].includes(title)) card.remove();
  }

  const summary = window.KairosProductionWorkspace?.summary?.() || {};
  const projects = Array.isArray(summary.durableProjects) ? summary.durableProjects.slice(0, 8) : [];
  const parent = document.createElement("article");
  parent.id = PARENT_ID;
  parent.className = "child-card publishing-production-parent";
  parent.dataset.build = BUILD;
  parent.innerHTML = `
    <p class="eyebrow">Content · Production</p>
    <h3>Publishing & Product Production</h3>
    <p>Start a complete product from an idea, cover, or manuscript—or move an existing manuscript through editorial and production.</p>
    ${summary.resumable ? `<div class="publishing-production-resume"><strong>Work available to resume</strong><span>${labelFor(summary)}</span></div>` : ""}
    <div class="publishing-production-children">
      <button type="button" class="publishing-production-child" data-open-complete-product><strong>Build Complete Product</strong><span>Idea, cover, or manuscript → finished publishing package and Shopify handoff.</span></button>
      <button type="button" class="publishing-production-child" data-open-manuscript-studio><strong>Open Manuscript Studio</strong><span>Upload, extract, review, and advance an existing manuscript through production.</span></button>
    </div>
    ${projects.length ? projectList(projects, summary.registryReady) : `<div class="publishing-production-empty"><strong>No saved production projects yet</strong><span>New work will appear here after intake begins.</span></div>`}`;

  children.appendChild(parent);
  parent.querySelector("[data-open-complete-product]")?.addEventListener("click", () => open("complete-product"));
  parent.querySelector("[data-open-manuscript-studio]")?.addEventListener("click", () => open("manuscript-studio"));
  parent.querySelectorAll("[data-resume-project]").forEach(button => button.addEventListener("click", () => {
    const project = projects.find(item => item.projectId === button.dataset.resumeProject);
    if (project) window.KairosProductionWorkspace?.resume?.(project);
  }));
  parent.querySelectorAll("[data-archive-project]").forEach(button => button.addEventListener("click", async event => {
    event.stopPropagation();
    button.disabled = true;
    await window.KairosProductionWorkspace?.archive?.(button.dataset.archiveProject);
  }));
  parent.querySelector("[data-refresh-projects]")?.addEventListener("click", () => window.KairosProductionWorkspace?.refresh?.());
}

function projectList(projects, ready) {
  return `<section class="publishing-project-registry"><header><div><p class="eyebrow">Production Registry</p><h4>Saved projects</h4></div><button type="button" class="secondary" data-refresh-projects>${ready ? "Refresh" : "Retry Sync"}</button></header><div class="publishing-project-list">${projects.map(project => `<article class="publishing-project-row"><button type="button" data-resume-project="${esc(project.projectId)}"><span class="publishing-project-type">${project.projectType === "manuscript-studio" ? "Manuscript" : "Complete Product"}</span><strong>${esc(project.title)}</strong><small>${esc(project.stage)} · ${Number(project.progress || 0)}% · ${formatDate(project.updatedAt)}</small><i style="--project-progress:${Number(project.progress || 0)}%"></i><em>${esc(project.nextAction || "Resume production work.")}</em></button><button type="button" class="publishing-project-archive" data-archive-project="${esc(project.projectId)}" aria-label="Archive ${esc(project.title)}">Archive</button></article>`).join("")}</div></section>`;
}

function open(workspace) {
  if (window.KairosProductionWorkspace?.open) return window.KairosProductionWorkspace.open(workspace);
  window.dispatchEvent(new CustomEvent("kairos:production:open", { detail: { workspace } }));
}
function labelFor(summary) { if (summary.activeWorkspace === "complete-product") return "Complete Product workspace"; if (summary.activeWorkspace === "manuscript-studio") return "Manuscript Studio"; if (summary.durableProjects?.length) return `${summary.durableProjects.length} saved production project${summary.durableProjects.length === 1 ? "" : "s"}`; if (summary.product) return "Complete Product project"; if (summary.manuscript) return "Manuscript review"; return "Production work"; }
function hideLegacyLaunchers() { document.querySelectorAll(".creation-engine-launch,.manuscript-launch").forEach(button => { button.hidden = true; button.setAttribute("aria-hidden", "true"); button.tabIndex = -1; }); }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "Recently updated" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]); }

window.addEventListener("kairos:production:state-changed", () => { document.querySelector(`#${PARENT_ID}`)?.remove(); enhance(); });
const observer = new MutationObserver(enhance);
observer.observe(document.documentElement, { childList: true, subtree: true });
enhance();
