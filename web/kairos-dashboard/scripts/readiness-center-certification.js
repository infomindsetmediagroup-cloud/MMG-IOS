const BUILD = "kairos-readiness-center-certification-ui-20260714-1";
const CAPABILITIES = {
  knowledge: ["knowledge-library", "research-brief", "decision-record", "doctrine-vault", "intelligence-synthesis"],
  content: ["website", "manuscript-studio", "social-production", "publishing-studio", "creative-studio"],
  business: ["product-launch", "revenue-intelligence", "growth-plan", "offer-builder", "campaign-operations"],
  customers: ["visitor-activity", "customer-portal", "deliverables", "customer-journey", "support-intelligence"],
  operations: ["health", "work-queue", "release-control", "executive-briefing", "system-registry"],
};
let working = false;

start();

function start() {
  document.addEventListener("click", handleClick, true);
}

async function handleClick(event) {
  const centerButton = event.target.closest?.("[data-center]");
  if (centerButton) {
    [1500, 2300].forEach(delay => setTimeout(enhanceCertification, delay));
    return;
  }

  const openButton = event.target.closest?.("[data-open-center-certification]");
  if (openButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openWorkflow(openButton.dataset.openCenterCertification);
    return;
  }

  const createButton = event.target.closest?.("[data-create-center-certification]");
  if (!createButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await createCertification(createButton);
}

async function enhanceCertification() {
  const panel = document.querySelector(".center-readiness");
  if (!panel || panel.querySelector(".readiness-center-certification")) return;

  const workspace = document.querySelector("#workspace");
  const center = workspace?.querySelector(".workspace-head .eyebrow")?.textContent?.split(" Center")[0]?.trim().toLowerCase();
  if (!center || !CAPABILITIES[center]) return;

  const section = document.createElement("section");
  section.className = "readiness-center-certification";
  section.innerHTML = `<header><div><p class="eyebrow">Center Certification</p><h4>Operational completion for the current blueprint</h4></div><span data-center-certification-state>Checking</span></header><div data-center-certification-body><p class="readiness-register-empty">Reconciling the five capability scores and verification records…</p></div><p class="readiness-center-certification-boundary">Certification confirms completion at the current blueprint level. Future approved capabilities may reopen the center for additional advancement.</p>`;
  panel.appendChild(section);
  await loadCertification(center);
}

async function loadCertification(center) {
  const bodyRoot = document.querySelector("[data-center-certification-body]");
  const stateRoot = document.querySelector("[data-center-certification-state]");
  if (!bodyRoot || !stateRoot) return;

  try {
    const [registryResult, workflowResult] = await Promise.all([
      request("/api/readiness-registry"),
      request("/api/workflows"),
    ]);
    if (!registryResult.response.ok || !registryResult.body?.scores?.[center]) throw new Error("Kairos could not read center readiness.");
    if (!workflowResult.response.ok) throw new Error("Kairos could not read certification workflows.");

    const scores = CAPABILITIES[center].map(capability => ({ capability, score: Number(registryResult.body.scores[center][capability] || 0) }));
    const incomplete = scores.filter(item => item.score < 100);
    const title = `${label(center)} Center Operational Certification`;
    const certifications = (workflowResult.body?.workflows || [])
      .filter(item => item?.source === "command-center-readiness-center-certification" || item?.title === title)
      .filter(item => String(item?.center || "").toLowerCase() === center)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
    const open = certifications.find(item => !["completed", "cancelled"].includes(item.state));
    const completed = certifications.find(item => item.state === "completed");

    if (completed) {
      stateRoot.textContent = "Certified";
      stateRoot.dataset.state = "certified";
      bodyRoot.innerHTML = `<article class="center-certification-summary"><div><strong>${escapeHTML(title)}</strong><small>Current blueprint certified · all five capabilities recorded at 100%</small></div><button type="button" data-open-center-certification="${escapeHTML(completed.id)}">Open Certificate</button></article>`;
      return;
    }

    if (open) {
      stateRoot.textContent = String(open.state || "open").replace("-", " ");
      stateRoot.dataset.state = open.state || "ready";
      bodyRoot.innerHTML = `<article class="center-certification-summary"><div><strong>${escapeHTML(title)}</strong><small>${Number(open.completedTasks || 0)}/${Number(open.taskCount || 0)} certification tasks · executive approval ${escapeHTML(open.approvalStatus || "pending")}</small></div><button type="button" data-open-center-certification="${escapeHTML(open.id)}">Open Certification</button></article>`;
      return;
    }

    if (incomplete.length) {
      stateRoot.textContent = `${incomplete.length} remaining`;
      stateRoot.dataset.state = "blocked";
      bodyRoot.innerHTML = `<div class="center-certification-gaps"><p>Certification unlocks when all five capability meters reach verified 100% readiness.</p>${incomplete.map(item => `<span><b>${escapeHTML(label(item.capability))}</b><em>${item.score}%</em></span>`).join("")}</div>`;
      return;
    }

    stateRoot.textContent = "Eligible";
    stateRoot.dataset.state = "eligible";
    bodyRoot.innerHTML = `<article class="center-certification-summary"><div><strong>All five capabilities are at 100%</strong><small>Create the final governed workflow to reconcile evidence, certify the center, and preserve the completion receipt.</small></div><button type="button" class="center-certification-action" data-create-center-certification="${escapeHTML(center)}">Create Certification</button></article>`;
  } catch (error) {
    stateRoot.textContent = "Unavailable";
    stateRoot.dataset.state = "blocked";
    bodyRoot.innerHTML = `<p class="readiness-register-empty">${escapeHTML(error.message || "Kairos could not load center certification.")}</p>`;
  }
}

async function createCertification(button) {
  if (working || button.disabled) return;
  working = true;
  button.disabled = true;
  button.textContent = "Creating…";
  const center = button.dataset.createCenterCertification;
  const centerTitle = label(center);
  try {
    const [registryResult, queueResult] = await Promise.all([request("/api/readiness-registry"), request("/api/workflows")]);
    const scores = CAPABILITIES[center]?.map(capability => Number(registryResult.body?.scores?.[center]?.[capability] || 0)) || [];
    if (scores.length !== 5 || scores.some(score => score !== 100)) throw new Error("Every capability must be verified at 100% before center certification.");
    const duplicate = (queueResult.body?.workflows || []).find(item => item?.source === "command-center-readiness-center-certification" && String(item?.center || "").toLowerCase() === center && !["completed", "cancelled"].includes(item.state));
    if (duplicate) { openWorkflow(duplicate.id); return; }

    const response = await request("/api/workflows", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        title: `${centerTitle} Center Operational Certification`,
        objective: `Certify that the ${centerTitle} Center has reached verified operational completion for the current blueprint. Reconcile all five 100% capability scores, post-application verification evidence, governance controls, and the final center meter without fabricating completion.`,
        center,
        priority: "critical",
        approvalRequired: true,
        source: "command-center-readiness-center-certification",
      }),
    });
    if (!response.response.ok || !response.body?.workflow?.id) throw new Error(response.body?.error?.message || "Kairos could not create center certification.");
    const workflow = response.body.workflow;
    const tasks = [
      ["Reconcile five capability scores", "Confirm all five canonical capability records are exactly 100% in the readiness registry."],
      ["Verify capability closure evidence", "Confirm each promoted capability has complete authorization, application, and post-application verification evidence."],
      ["Verify center meter calculation", "Recalculate the center average and confirm the parent-card blue meter is exactly 100%."],
      ["Approve current-blueprint certification", "Record executive approval that the center is complete at the currently governed blueprint level."],
      ["Preserve certification receipt", "Close the certification with evidence, provenance, review date, and a statement that future blueprint expansion may reopen readiness work."],
    ];
    for (const [title, description] of tasks) {
      const task = await request(`/api/workflows/${encodeURIComponent(workflow.id)}/tasks`, { method: "POST", headers: headers(), body: JSON.stringify({ title, description }) });
      if (!task.response.ok) throw new Error(task.body?.error?.message || `Kairos could not add: ${title}`);
    }
    await loadCertification(center);
    openWorkflow(workflow.id);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Create Certification";
    alert(error.message || "Kairos could not create center certification.");
  } finally {
    working = false;
  }
}

function openWorkflow(workflowID) {
  if (!workflowID) return;
  window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { workflowID } }));
  setTimeout(() => document.querySelector("#workflow-runtime")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}
function headers() { return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }; }
async function request(url, init = {}) { const response = await fetch(url, { cache: "no-store", credentials: "include", ...init }); const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; } return { response, body }; }
function label(value) { return String(value || "center").split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]); }
window.KairosReadinessCenterCertification = { build: BUILD, refresh: enhanceCertification, reload: loadCertification };