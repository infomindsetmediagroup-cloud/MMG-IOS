const BUILD = "kairos-readiness-system-certification-ui-20260714-1";
const CENTERS = ["knowledge", "content", "business", "customers", "operations"];
let working = false;

start();

function start() {
  document.addEventListener("click", handleClick, true);
  window.addEventListener("kairos:readiness-registry:updated", schedule, { passive: true });
  schedule();
  setInterval(enhanceSystemCertification, 15100);
}

function schedule() {
  [500, 1500, 2600].forEach(delay => setTimeout(enhanceSystemCertification, delay));
}

async function handleClick(event) {
  const openButton = event.target.closest?.("[data-open-system-certification]");
  if (openButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openWorkflow(openButton.dataset.openSystemCertification);
    return;
  }
  const createButton = event.target.closest?.("[data-create-system-certification]");
  if (!createButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await createCertification(createButton);
}

async function enhanceSystemCertification() {
  const grid = document.querySelector(".parent-grid");
  if (!grid || document.querySelector(".readiness-system-certification")) return;
  const section = document.createElement("section");
  section.className = "readiness-system-certification";
  section.innerHTML = `<header><div><p class="eyebrow">Kairos Operational Certification</p><h2>Enterprise readiness across all five operating centers</h2></div><span data-system-certification-state>Checking</span></header><div class="system-certification-centers" data-system-certification-centers></div><div data-system-certification-action><p class="readiness-register-empty">Reconciling center certificates and current-blueprint completion evidence…</p></div><p class="system-certification-boundary">System certification confirms Kairos is operational across the current governed blueprint. It does not freeze future expansion or replace production monitoring.</p>`;
  grid.insertAdjacentElement("afterend", section);
  await loadCertification();
}

async function loadCertification() {
  const stateRoot = document.querySelector("[data-system-certification-state]");
  const centersRoot = document.querySelector("[data-system-certification-centers]");
  const actionRoot = document.querySelector("[data-system-certification-action]");
  if (!stateRoot || !centersRoot || !actionRoot) return;
  try {
    const result = await request("/api/workflows");
    if (!result.response.ok) throw new Error("Kairos could not read operational certification records.");
    const workflows = result.body?.workflows || [];
    const centerStatus = CENTERS.map(center => {
      const title = `${label(center)} Center Operational Certification`;
      const records = workflows.filter(item => (item?.source === "command-center-readiness-center-certification" || item?.title === title) && String(item?.center || "").toLowerCase() === center);
      const completed = records.find(item => item.state === "completed");
      const open = records.find(item => !["completed", "cancelled"].includes(item.state));
      return { center, completed, open };
    });
    centersRoot.innerHTML = centerStatus.map(item => `<article data-state="${item.completed ? "certified" : item.open ? "open" : "pending"}"><strong>${escapeHTML(label(item.center))}</strong><span>${item.completed ? "Certified" : item.open ? escapeHTML(item.open.state || "Open") : "Pending"}</span></article>`).join("");

    const title = "Kairos Current-Blueprint Operational Certification";
    const systemRecords = workflows.filter(item => item?.source === "command-center-kairos-operational-certification" || item?.title === title).sort((a,b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
    const completedSystem = systemRecords.find(item => item.state === "completed");
    const openSystem = systemRecords.find(item => !["completed", "cancelled"].includes(item.state));
    const missing = centerStatus.filter(item => !item.completed);

    if (completedSystem) {
      stateRoot.textContent = "Operationally Certified";
      stateRoot.dataset.state = "certified";
      actionRoot.innerHTML = `<article class="system-certification-action"><div><strong>${escapeHTML(title)}</strong><small>All five centers certified for the current governed blueprint.</small></div><button type="button" data-open-system-certification="${escapeHTML(completedSystem.id)}">Open System Certificate</button></article>`;
      return;
    }
    if (openSystem) {
      stateRoot.textContent = String(openSystem.state || "open").replace("-", " ");
      stateRoot.dataset.state = openSystem.state || "ready";
      actionRoot.innerHTML = `<article class="system-certification-action"><div><strong>${escapeHTML(title)}</strong><small>${Number(openSystem.completedTasks || 0)}/${Number(openSystem.taskCount || 0)} certification tasks · approval ${escapeHTML(openSystem.approvalStatus || "pending")}</small></div><button type="button" data-open-system-certification="${escapeHTML(openSystem.id)}">Open Certification</button></article>`;
      return;
    }
    if (missing.length) {
      stateRoot.textContent = `${missing.length} center${missing.length === 1 ? "" : "s"} remaining`;
      stateRoot.dataset.state = "blocked";
      actionRoot.innerHTML = `<p class="readiness-register-empty">System certification unlocks after Knowledge, Content, Business, Customers, and Operations each hold a completed center certificate.</p>`;
      return;
    }
    stateRoot.textContent = "Eligible";
    stateRoot.dataset.state = "eligible";
    actionRoot.innerHTML = `<article class="system-certification-action"><div><strong>All five operating centers are certified</strong><small>Create the final governed workflow to certify Kairos at the current blueprint level.</small></div><button type="button" class="system-certification-create" data-create-system-certification>Create System Certification</button></article>`;
  } catch (error) {
    stateRoot.textContent = "Unavailable";
    stateRoot.dataset.state = "blocked";
    actionRoot.innerHTML = `<p class="readiness-register-empty">${escapeHTML(error.message || "Kairos could not load system certification.")}</p>`;
  }
}

async function createCertification(button) {
  if (working || button.disabled) return;
  working = true;
  button.disabled = true;
  button.textContent = "Creating…";
  try {
    const queue = await request("/api/workflows");
    const workflows = queue.body?.workflows || [];
    const certified = CENTERS.every(center => workflows.some(item => item?.source === "command-center-readiness-center-certification" && String(item?.center || "").toLowerCase() === center && item.state === "completed"));
    if (!certified) throw new Error("All five operating centers must be certified first.");
    const duplicate = workflows.find(item => item?.source === "command-center-kairos-operational-certification" && !["completed", "cancelled"].includes(item.state));
    if (duplicate) { openWorkflow(duplicate.id); return; }
    const response = await request("/api/workflows", { method: "POST", headers: headers(), body: JSON.stringify({ title: "Kairos Current-Blueprint Operational Certification", objective: "Certify that Kairos is operational across all five MMG operating centers for the current governed blueprint. Reconcile center certificates, runtime health, governance, production evidence, and executive acceptance without overstating future completeness.", center: "operations", priority: "critical", approvalRequired: true, source: "command-center-kairos-operational-certification" }) });
    if (!response.response.ok || !response.body?.workflow?.id) throw new Error(response.body?.error?.message || "Kairos could not create system certification.");
    const workflow = response.body.workflow;
    const tasks = [
      ["Reconcile five center certificates", "Confirm completed current-blueprint certification receipts for Knowledge, Content, Business, Customers, and Operations."],
      ["Verify production operating posture", "Confirm runtime health, governed queues, release controls, auditability, and current production evidence."],
      ["Verify enterprise workflow continuity", "Confirm objectives can move through the five-center architecture without orphaned entry points or hidden execution paths."],
      ["Approve current-blueprint operational status", "Record executive acceptance that Kairos is operational at the currently governed blueprint level."],
      ["Preserve system certification receipt", "Close with provenance, evidence references, certification date, review cadence, and the boundary that future expansion remains permitted."],
    ];
    for (const [title, description] of tasks) {
      const task = await request(`/api/workflows/${encodeURIComponent(workflow.id)}/tasks`, { method: "POST", headers: headers(), body: JSON.stringify({ title, description }) });
      if (!task.response.ok) throw new Error(task.body?.error?.message || `Kairos could not add: ${title}`);
    }
    await loadCertification();
    openWorkflow(workflow.id);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Create System Certification";
    alert(error.message || "Kairos could not create system certification.");
  } finally { working = false; }
}

function openWorkflow(workflowID) { if (!workflowID) return; window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { workflowID } })); setTimeout(() => document.querySelector("#workflow-runtime")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }
function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function request(url, init = {}) { const response = await fetch(url, { cache: "no-store", credentials: "include", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; } return { response, body }; }
function label(value) { return String(value || "center").split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]); }
window.KairosReadinessSystemCertification = { build: BUILD, refresh: enhanceSystemCertification, reload: loadCertification };