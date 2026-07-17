const BUILD = "kairos-readiness-operational-remediation-ui-20260714-1";
let working = false;

start();

function start() {
  document.addEventListener("click", handleClick, true);
  window.addEventListener("kairos:readiness-registry:updated", schedule, { passive: true });
  schedule();
}

function schedule() {
  [1300, 2400, 3600].forEach(delay => setTimeout(enhanceRemediation, delay));
}

async function handleClick(event) {
  const openButton = event.target.closest?.("[data-open-operational-remediation]");
  if (openButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openWorkflow(openButton.dataset.openOperationalRemediation);
    return;
  }
  const createButton = event.target.closest?.("[data-create-operational-remediation]");
  if (!createButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await createRemediation(createButton);
}

async function enhanceRemediation() {
  const assurance = document.querySelector(".readiness-operational-assurance");
  if (!assurance || document.querySelector(".readiness-operational-remediation")) return;
  const section = document.createElement("section");
  section.className = "readiness-operational-remediation";
  section.innerHTML = `<header><div><p class="eyebrow">Operational Remediation</p><h3>Convert assurance drift into governed corrective work</h3></div><span data-remediation-state>Checking</span></header><div class="remediation-signals" data-remediation-signals></div><div data-remediation-action><p class="readiness-register-empty">Reconciling current assurance signals and remediation history…</p></div><p class="remediation-boundary">Remediation corrects current drift. It does not rewrite historical certification or lower readiness scores without a separately governed blueprint decision.</p>`;
  assurance.insertAdjacentElement("afterend", section);
  await loadRemediation();
}

async function loadRemediation() {
  const stateRoot = document.querySelector("[data-remediation-state]");
  const signalsRoot = document.querySelector("[data-remediation-signals]");
  const actionRoot = document.querySelector("[data-remediation-action]");
  if (!stateRoot || !signalsRoot || !actionRoot) return;
  try {
    const [healthResult, registryResult, workflowResult] = await Promise.all([
      request("/api/health"), request("/api/readiness-registry"), request("/api/workflows"),
    ]);
    const workflows = workflowResult.body?.workflows || [];
    const healthReady = healthResult.response.ok && ["ready", "ok"].includes(String(healthResult.body?.status || "").toLowerCase());
    const scores = Object.values(registryResult.body?.scores || {}).flatMap(center => Object.values(center || {}).map(Number));
    const registryValid = scores.length === 25 && scores.every(score => Number.isFinite(score) && score >= 0 && score <= 100);
    const blocked = workflows.filter(item => item.state === "blocked").length;
    const criticalOpen = workflows.filter(item => item.priority === "critical" && !["completed", "cancelled"].includes(item.state) && item.source !== "command-center-operational-remediation").length;
    const assurance = workflows.filter(item => item?.source === "command-center-operational-assurance").sort((a,b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0))[0];
    const remediationRecords = workflows.filter(item => item?.source === "command-center-operational-remediation").sort((a,b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
    const open = remediationRecords.find(item => !["completed", "cancelled"].includes(item.state));
    const latestCompleted = remediationRecords.find(item => item.state === "completed");
    const issues = [
      !healthReady ? "Runtime health" : null,
      !registryValid ? "Registry integrity" : null,
      criticalOpen ? `${criticalOpen} critical workflow${criticalOpen === 1 ? "" : "s"}` : null,
      blocked ? `${blocked} blocked workflow${blocked === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    signalsRoot.innerHTML = [
      ["Runtime", healthReady ? "Healthy" : "Drift", healthReady ? "healthy" : "attention"],
      ["Registry", registryValid ? "Consistent" : "Drift", registryValid ? "healthy" : "attention"],
      ["Critical", String(criticalOpen), criticalOpen ? "attention" : "healthy"],
      ["Blocked", String(blocked), blocked ? "attention" : "healthy"],
    ].map(([label,value,state]) => `<article data-state="${state}"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></article>`).join("");

    if (!assurance) {
      stateRoot.textContent = "Awaiting Assurance";
      stateRoot.dataset.state = "blocked";
      actionRoot.innerHTML = `<p class="readiness-register-empty">Complete an operational assurance review before opening remediation.</p>`;
      return;
    }
    if (open) {
      stateRoot.textContent = String(open.state || "open").replace("-", " ");
      stateRoot.dataset.state = issues.length ? "attention" : "open";
      actionRoot.innerHTML = `<article class="remediation-action"><div><strong>Kairos Operational Remediation</strong><small>${Number(open.completedTasks || 0)}/${Number(open.taskCount || 0)} tasks · approval ${escapeHTML(open.approvalStatus || "pending")}</small></div><button type="button" data-open-operational-remediation="${escapeHTML(open.id)}">Open Remediation</button></article>`;
      return;
    }
    if (!issues.length) {
      stateRoot.textContent = "No Drift";
      stateRoot.dataset.state = "healthy";
      actionRoot.innerHTML = latestCompleted ? `<article class="remediation-action"><div><strong>No active corrective work required</strong><small>Latest remediation is complete and current assurance signals are reconciled.</small></div><button type="button" data-open-operational-remediation="${escapeHTML(latestCompleted.id)}">Open Receipt</button></article>` : `<p class="readiness-register-empty">Current assurance signals do not require remediation.</p>`;
      return;
    }
    stateRoot.textContent = "Action Required";
    stateRoot.dataset.state = "attention";
    actionRoot.innerHTML = `<article class="remediation-action"><div><strong>${escapeHTML(issues.join(" · "))}</strong><small>Create a governed corrective workflow tied to assurance review ${escapeHTML(assurance.id)}.</small></div><button type="button" class="remediation-create" data-create-operational-remediation data-assurance="${escapeHTML(assurance.id)}" data-issues="${escapeHTML(issues.join(" | "))}">Create Remediation</button></article>`;
  } catch (error) {
    stateRoot.textContent = "Unavailable";
    stateRoot.dataset.state = "blocked";
    actionRoot.innerHTML = `<p class="readiness-register-empty">${escapeHTML(error.message || "Kairos could not load operational remediation.")}</p>`;
  }
}

async function createRemediation(button) {
  if (working || button.disabled) return;
  working = true;
  button.disabled = true;
  button.textContent = "Creating…";
  try {
    const queue = await request("/api/workflows");
    const workflows = queue.body?.workflows || [];
    const duplicate = workflows.find(item => item?.source === "command-center-operational-remediation" && !["completed", "cancelled"].includes(item.state));
    if (duplicate) { openWorkflow(duplicate.id); return; }
    const assuranceID = button.dataset.assurance || "";
    const issues = button.dataset.issues || "Current assurance drift";
    const response = await request("/api/workflows", { method:"POST", headers:headers(), body:JSON.stringify({ title:"Kairos Operational Remediation", objective:`Resolve the current operational-assurance drift identified from assurance review ${assuranceID}: ${issues}. Restore verified operating confidence without rewriting historical certification, fabricating evidence, or silently changing readiness scores.`, center:"operations", priority:"critical", approvalRequired:true, source:"command-center-operational-remediation" }) });
    if (!response.response.ok || !response.body?.workflow?.id) throw new Error(response.body?.error?.message || "Kairos could not create operational remediation.");
    const workflow = response.body.workflow;
    const tasks = [
      ["Confirm assurance drift", `Validate the current signal set and assurance review ${assuranceID}; remove false positives before corrective work begins.`],
      ["Assign corrective owners", "Route each verified issue to the responsible operating center, capability, and accountable owner."],
      ["Execute bounded remediation", "Correct runtime, registry, workflow, blocker, or governance defects without widening scope beyond the verified drift."],
      ["Verify restored operating posture", "Re-run runtime, registry, critical-work, and blocked-work checks and preserve authoritative evidence."],
      ["Close remediation receipt", "Record executive disposition, residual risk, rollback references, and whether a new assurance review or recertification is required."],
    ];
    for (const [title, description] of tasks) {
      const task = await request(`/api/workflows/${encodeURIComponent(workflow.id)}/tasks`, { method:"POST", headers:headers(), body:JSON.stringify({ title, description }) });
      if (!task.response.ok) throw new Error(task.body?.error?.message || `Kairos could not add: ${title}`);
    }
    await loadRemediation();
    openWorkflow(workflow.id);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Create Remediation";
    alert(error.message || "Kairos could not create operational remediation.");
  } finally { working = false; }
}

function openWorkflow(workflowID) { if (!workflowID) return; window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail:{ workflowID } })); setTimeout(() => document.querySelector("#workflow-runtime")?.scrollIntoView({ behavior:"smooth", block:"start" }), 80); }
function headers() { return { "Content-Type":"application/json", "X-MMG-Client-Build":BUILD }; }
async function request(url, init={}) { const response = await fetch(url, { cache:"no-store", credentials:"include", ...init }); const text = await response.text(); let body={}; try { body = text ? JSON.parse(text) : {}; } catch { body={ message:text }; } return { response, body }; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]); }
window.KairosReadinessOperationalRemediation = { build:BUILD, refresh:enhanceRemediation, reload:loadRemediation };
