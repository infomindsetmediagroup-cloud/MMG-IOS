const BUILD = "kairos-readiness-operational-assurance-ui-20260714-1";
let working = false;

start();

function start() {
  document.addEventListener("click", handleClick, true);
  window.addEventListener("kairos:readiness-registry:updated", schedule, { passive: true });
  schedule();
}

function schedule() {
  [900, 1900, 3200].forEach(delay => setTimeout(enhanceAssurance, delay));
}

async function handleClick(event) {
  const openButton = event.target.closest?.("[data-open-operational-assurance]");
  if (openButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openWorkflow(openButton.dataset.openOperationalAssurance);
    return;
  }
  const createButton = event.target.closest?.("[data-create-operational-assurance]");
  if (!createButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await createAssuranceWorkflow(createButton);
}

async function enhanceAssurance() {
  const system = document.querySelector(".readiness-system-certification");
  if (!system || document.querySelector(".readiness-operational-assurance")) return;
  const section = document.createElement("section");
  section.className = "readiness-operational-assurance";
  section.innerHTML = `<header><div><p class="eyebrow">Operational Assurance</p><h3>Continuous confidence after certification</h3></div><span data-assurance-state>Checking</span></header><div class="assurance-signals" data-assurance-signals></div><div data-assurance-action><p class="readiness-register-empty">Reconciling runtime health, readiness integrity, certification age, and governed work…</p></div><p class="assurance-boundary">Certification is a historical receipt. Operational assurance verifies that the certified posture still holds as the system evolves.</p>`;
  system.insertAdjacentElement("afterend", section);
  await loadAssurance();
}

async function loadAssurance() {
  const stateRoot = document.querySelector("[data-assurance-state]");
  const signalsRoot = document.querySelector("[data-assurance-signals]");
  const actionRoot = document.querySelector("[data-assurance-action]");
  if (!stateRoot || !signalsRoot || !actionRoot) return;
  try {
    const [healthResult, registryResult, workflowResult] = await Promise.all([
      request("/api/health"),
      request("/api/readiness-registry"),
      request("/api/workflows"),
    ]);
    const workflows = workflowResult.body?.workflows || [];
    const healthReady = healthResult.response.ok && ["ready", "ok"].includes(String(healthResult.body?.status || "").toLowerCase());
    const scores = Object.values(registryResult.body?.scores || {}).flatMap(center => Object.values(center || {}).map(Number));
    const readinessIntegrity = scores.length === 25 && scores.every(score => Number.isFinite(score) && score >= 0 && score <= 100);
    const systemCertificate = workflows
      .filter(item => item?.source === "command-center-kairos-operational-certification" && item.state === "completed")
      .sort((a, b) => Date.parse(b.completedAt || b.updatedAt || 0) - Date.parse(a.completedAt || a.updatedAt || 0))[0];
    const certificateTime = Date.parse(systemCertificate?.completedAt || systemCertificate?.updatedAt || "");
    const certificateAgeDays = Number.isFinite(certificateTime) ? Math.floor((Date.now() - certificateTime) / 86400000) : null;
    const criticalOpen = workflows.filter(item => item.priority === "critical" && !["completed", "cancelled"].includes(item.state)).length;
    const blocked = workflows.filter(item => item.state === "blocked").length;
    const assuranceRecords = workflows
      .filter(item => item?.source === "command-center-operational-assurance")
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
    const openAssurance = assuranceRecords.find(item => !["completed", "cancelled"].includes(item.state));
    const completedAssurance = assuranceRecords.find(item => item.state === "completed");
    const stale = certificateAgeDays !== null && certificateAgeDays >= 30;
    const needsReview = !healthReady || !readinessIntegrity || blocked > 0 || criticalOpen > 0 || stale;

    const signals = [
      ["Runtime", healthReady ? "Healthy" : "Attention", healthReady ? "healthy" : "attention"],
      ["Registry", readinessIntegrity ? "Consistent" : "Drift", readinessIntegrity ? "healthy" : "attention"],
      ["Certificate", certificateAgeDays === null ? "Missing" : `${certificateAgeDays}d old`, certificateAgeDays === null || stale ? "attention" : "healthy"],
      ["Critical Work", String(criticalOpen), criticalOpen ? "attention" : "healthy"],
      ["Blocked Work", String(blocked), blocked ? "attention" : "healthy"],
    ];
    signalsRoot.innerHTML = signals.map(([label, value, state]) => `<article data-state="${state}"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></article>`).join("");

    if (!systemCertificate) {
      stateRoot.textContent = "Awaiting Certification";
      stateRoot.dataset.state = "blocked";
      actionRoot.innerHTML = `<p class="readiness-register-empty">Operational assurance activates after the Kairos system certification workflow is completed.</p>`;
      return;
    }
    if (openAssurance) {
      stateRoot.textContent = String(openAssurance.state || "open").replace("-", " ");
      stateRoot.dataset.state = needsReview ? "attention" : "open";
      actionRoot.innerHTML = `<article class="assurance-action"><div><strong>Kairos Operational Assurance Review</strong><small>${Number(openAssurance.completedTasks || 0)}/${Number(openAssurance.taskCount || 0)} tasks · approval ${escapeHTML(openAssurance.approvalStatus || "pending")}</small></div><button type="button" data-open-operational-assurance="${escapeHTML(openAssurance.id)}">Open Review</button></article>`;
      return;
    }
    if (!needsReview && completedAssurance) {
      stateRoot.textContent = "Assured";
      stateRoot.dataset.state = "healthy";
      actionRoot.innerHTML = `<article class="assurance-action"><div><strong>Certified posture remains reconciled</strong><small>Latest assurance review completed with no current drift signal.</small></div><button type="button" data-open-operational-assurance="${escapeHTML(completedAssurance.id)}">Open Receipt</button></article>`;
      return;
    }
    stateRoot.textContent = needsReview ? "Review Required" : "Review Available";
    stateRoot.dataset.state = needsReview ? "attention" : "eligible";
    actionRoot.innerHTML = `<article class="assurance-action"><div><strong>${needsReview ? "Operational posture requires reconciliation" : "Run a fresh operational assurance review"}</strong><small>${needsReview ? "One or more runtime, registry, certification-age, or governed-work signals require review." : "Preserve a current confidence receipt for the certified system posture."}</small></div><button type="button" class="assurance-create" data-create-operational-assurance data-certificate="${escapeHTML(systemCertificate.id)}">Create Assurance Review</button></article>`;
  } catch (error) {
    stateRoot.textContent = "Unavailable";
    stateRoot.dataset.state = "blocked";
    actionRoot.innerHTML = `<p class="readiness-register-empty">${escapeHTML(error.message || "Kairos could not load operational assurance.")}</p>`;
  }
}

async function createAssuranceWorkflow(button) {
  if (working || button.disabled) return;
  working = true;
  button.disabled = true;
  button.textContent = "Creating…";
  try {
    const queue = await request("/api/workflows");
    const workflows = queue.body?.workflows || [];
    const duplicate = workflows.find(item => item?.source === "command-center-operational-assurance" && !["completed", "cancelled"].includes(item.state));
    if (duplicate) { openWorkflow(duplicate.id); return; }
    const certificateID = button.dataset.certificate || "";
    const response = await request("/api/workflows", { method: "POST", headers: headers(), body: JSON.stringify({ title: "Kairos Operational Assurance Review", objective: `Reconcile the currently certified Kairos operating posture against system certificate ${certificateID}. Verify runtime health, readiness-registry integrity, critical and blocked work, certification freshness, and governance continuity without treating historical certification as permanent proof of current health.`, center: "operations", priority: "critical", approvalRequired: true, source: "command-center-operational-assurance" }) });
    if (!response.response.ok || !response.body?.workflow?.id) throw new Error(response.body?.error?.message || "Kairos could not create operational assurance.");
    const workflow = response.body.workflow;
    const tasks = [
      ["Verify current runtime health", "Confirm the production runtime, capabilities, and primary Command Center routes are presently available."],
      ["Reconcile readiness registry integrity", "Confirm all 25 canonical capability scores are valid, traceable, and consistent with visible parent and child meters."],
      ["Review critical and blocked work", "Inspect open critical workflows and blockers for any condition that weakens the certified operating posture."],
      ["Review certification freshness", `Confirm system certificate ${certificateID} remains applicable to the current governed blueprint and identify any approved expansion since certification.`],
      ["Preserve assurance disposition", "Record whether the certified posture remains assured, requires remediation, or requires recertification, with evidence and executive approval."],
    ];
    for (const [title, description] of tasks) {
      const task = await request(`/api/workflows/${encodeURIComponent(workflow.id)}/tasks`, { method: "POST", headers: headers(), body: JSON.stringify({ title, description }) });
      if (!task.response.ok) throw new Error(task.body?.error?.message || `Kairos could not add: ${title}`);
    }
    await loadAssurance();
    openWorkflow(workflow.id);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Create Assurance Review";
    alert(error.message || "Kairos could not create operational assurance.");
  } finally { working = false; }
}

function openWorkflow(workflowID) { if (!workflowID) return; window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { workflowID } })); setTimeout(() => document.querySelector("#workflow-runtime")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }
function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function request(url, init = {}) { const response = await fetch(url, { cache: "no-store", credentials: "include", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; } return { response, body }; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]); }
window.KairosReadinessOperationalAssurance = { build: BUILD, refresh: enhanceAssurance, reload: loadAssurance };