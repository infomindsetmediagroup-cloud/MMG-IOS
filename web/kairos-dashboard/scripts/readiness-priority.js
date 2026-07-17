const BUILD = "kairos-readiness-priority-ui-20260714-4";
let working = false;
let activeContext = null;

start();

function start() {
  document.addEventListener("click", handleClick, true);
}

async function handleClick(event) {
  const centerButton = event.target.closest?.("[data-center]");
  if (centerButton) {
    setTimeout(() => enhanceReadinessPanel(), 40);
    return;
  }

  const openWorkflowButton = event.target.closest?.("[data-open-readiness-workflow]");
  if (openWorkflowButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openWorkflow(openWorkflowButton.dataset.openReadinessWorkflow);
    return;
  }

  const reviewButton = event.target.closest?.("[data-request-readiness-review]");
  if (reviewButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await createVerificationWorkflow(reviewButton);
    return;
  }

  const workflowButton = event.target.closest?.("[data-create-readiness-workflow]");
  if (workflowButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await createAdvancementWorkflow(workflowButton);
    return;
  }

  const nextButton = event.target.closest?.("[data-build-next]");
  if (!nextButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const childID = nextButton.dataset.buildNext;
  const childButton = document.querySelector(`.child-action[data-child="${CSS.escape(childID)}"]`);
  childButton?.click();
  setTimeout(() => document.querySelector(".job, #workflow-runtime, .workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
}

async function enhanceReadinessPanel() {
  const panel = document.querySelector(".center-readiness");
  if (!panel || panel.querySelector(".readiness-priority")) return;

  const childCards = [...document.querySelectorAll(".child-card[data-readiness]")]
    .map(card => ({
      card,
      score: Number(card.dataset.readiness || 0),
      title: card.querySelector("h3")?.textContent?.trim() || "Capability",
      childID: card.querySelector("[data-child]")?.dataset.child || "",
      center: card.querySelector(".eyebrow")?.textContent?.trim() || "Operations",
    }))
    .filter(item => item.childID)
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));

  if (!childCards.length) return;
  const next = childCards[0];
  activeContext = next;
  const remaining = Math.max(0, 100 - next.score);
  const priority = document.createElement("section");
  priority.className = "readiness-priority";
  priority.innerHTML = `<div><p class="eyebrow">Next Build Priority</p><h4>${escapeHTML(next.title)}</h4><p>Lowest-readiness capability in this center · ${next.score}% operational · ${remaining} points remaining</p><p class="readiness-workflow-status" data-readiness-workflow-status>Checking advancement register…</p></div><div class="readiness-priority-actions"><button type="button" data-build-next="${escapeHTML(next.childID)}">Open Capability →</button><button type="button" class="secondary-readiness-action" data-create-readiness-workflow="${escapeHTML(next.childID)}" data-capability-title="${escapeHTML(next.title)}" data-center-title="${escapeHTML(next.center)}" data-current-score="${next.score}">Create Build Workflow</button></div>`;
  panel.appendChild(priority);

  const register = document.createElement("section");
  register.className = "readiness-advancement-register";
  register.innerHTML = `<header><div><p class="eyebrow">Advancement Register</p><h4>Readiness work tied to this capability</h4></div><span data-advancement-count>0</span></header><div data-advancement-list><p class="readiness-register-empty">Loading governed workflows…</p></div>`;
  panel.appendChild(register);
  await loadAdvancementRegister(next);
}

async function loadAdvancementRegister(context = activeContext) {
  if (!context) return;
  const status = document.querySelector("[data-readiness-workflow-status]");
  const listRoot = document.querySelector("[data-advancement-list]");
  const countRoot = document.querySelector("[data-advancement-count]");
  const createButton = document.querySelector("[data-create-readiness-workflow]");
  if (!listRoot) return;

  try {
    const result = await request("/api/workflows");
    if (!result.response.ok) throw new Error(result.body?.error?.message || "Kairos could not read readiness workflows.");
    const expectedTitle = `${context.title} Readiness Advancement`;
    const verificationTitle = `${context.title} Readiness Verification`;
    const all = result.body?.workflows || [];
    const workflows = all
      .filter(item => item?.title === expectedTitle || item?.source === "command-center-readiness-priority")
      .filter(item => String(item?.center || "").toLowerCase() === String(context.center || "").toLowerCase())
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
    const verificationWorkflows = all
      .filter(item => item?.title === verificationTitle || item?.source === "command-center-readiness-verification")
      .filter(item => String(item?.center || "").toLowerCase() === String(context.center || "").toLowerCase());

    if (countRoot) countRoot.textContent = String(workflows.length);
    const openWorkflow = workflows.find(item => !["completed", "cancelled"].includes(item.state));
    if (createButton) {
      createButton.disabled = Boolean(openWorkflow);
      createButton.textContent = openWorkflow ? "Workflow Already Open" : "Create Build Workflow";
    }
    if (status) status.textContent = openWorkflow ? `Active advancement workflow · ${openWorkflow.state}` : workflows.length ? "Previous advancement work is preserved below." : "No advancement workflow exists yet.";

    if (!workflows.length) {
      listRoot.innerHTML = `<p class="readiness-register-empty">No governed readiness workflow has been created for this capability.</p>`;
      return;
    }

    listRoot.innerHTML = workflows.slice(0, 5).map(workflow => {
      const progress = Number(workflow.progress || 0);
      const taskLabel = `${Number(workflow.completedTasks || 0)}/${Number(workflow.taskCount || 0)} tasks`;
      const review = verificationWorkflows.find(item => item?.metadata?.sourceWorkflowID === workflow.id || String(item?.objective || "").includes(workflow.id));
      const canRequestReview = workflow.state === "completed" && !review;
      const reviewAction = review
        ? `<button type="button" data-open-readiness-workflow="${escapeHTML(review.id)}">Open Review</button>`
        : canRequestReview
          ? `<button type="button" class="readiness-review-action" data-request-readiness-review="${escapeHTML(workflow.id)}" data-capability-title="${escapeHTML(context.title)}" data-center-title="${escapeHTML(context.center)}" data-current-score="${Number(context.score || 0)}">Request Review</button>`
          : "";
      return `<article class="readiness-advancement-row" data-state="${escapeHTML(workflow.state || "ready")}"><div><strong>${escapeHTML(workflow.title || expectedTitle)}</strong><small>${escapeHTML(workflow.state || "ready")} · ${taskLabel}</small><div class="readiness-advancement-meter"><span style="--meter:${Math.max(0, Math.min(100, progress))}%"></span></div></div><b>${progress}%</b><div class="readiness-row-actions"><button type="button" data-open-readiness-workflow="${escapeHTML(workflow.id)}">Open</button>${reviewAction}</div></article>`;
    }).join("");
  } catch (error) {
    if (status) status.textContent = error.message || "Kairos could not load advancement history.";
    listRoot.innerHTML = `<p class="readiness-register-empty">${escapeHTML(error.message || "Kairos could not load advancement history.")}</p>`;
  }
}

async function createAdvancementWorkflow(button) {
  if (working || button.disabled) return;
  working = true;
  button.disabled = true;
  const status = document.querySelector("[data-readiness-workflow-status]");
  if (status) status.textContent = "Checking for an existing advancement workflow…";

  const capabilityTitle = button.dataset.capabilityTitle || "Capability";
  const centerTitle = button.dataset.centerTitle || "Operations";
  const currentScore = Number(button.dataset.currentScore || 0);
  const center = centerTitle.toLowerCase();

  try {
    const queue = await request("/api/workflows");
    if (!queue.response.ok) throw new Error(queue.body?.error?.message || "Kairos could not verify the advancement register.");
    const duplicate = (queue.body?.workflows || []).find(item => item?.title === `${capabilityTitle} Readiness Advancement` && String(item?.center || "").toLowerCase() === center && !["completed", "cancelled"].includes(item.state));
    if (duplicate) {
      if (status) status.textContent = `Existing workflow found · ${duplicate.state}`;
      openWorkflow(duplicate.id);
      return;
    }

    if (status) status.textContent = "Creating governed advancement workflow…";
    const workflow = await createWorkflowRecord({
      title: `${capabilityTitle} Readiness Advancement`,
      objective: `Advance ${capabilityTitle} from ${currentScore}% operational readiness toward verified production completion without fabricating readiness evidence.`,
      center,
      source: "command-center-readiness-priority",
      tasks: [
        ["Confirm current readiness baseline", `Verify the recorded ${currentScore}% baseline and identify the exact remaining capability gaps.`],
        ["Close implementation gaps", "Complete the missing routes, interfaces, workflow connections, and production controls."],
        ["Verify governance and evidence", "Confirm approval, provenance, auditability, and evidence requirements without inventing completion."],
        ["Validate production readiness", "Run the applicable production validation and preserve the resulting evidence."],
        ["Recalculate operational readiness", "Update readiness only from verified implementation and deployment evidence."],
      ],
    });

    if (status) status.textContent = `Workflow created · ${workflow.id}`;
    await loadAdvancementRegister({ title: capabilityTitle, center: centerTitle, score: currentScore });
    openWorkflow(workflow.id);
  } catch (error) {
    if (status) status.textContent = error.message || "Kairos could not create the advancement workflow.";
    button.disabled = false;
  } finally {
    working = false;
  }
}

async function createVerificationWorkflow(button) {
  if (working || button.disabled) return;
  working = true;
  button.disabled = true;
  const status = document.querySelector("[data-readiness-workflow-status]");
  const sourceWorkflowID = button.dataset.requestReadinessReview;
  const capabilityTitle = button.dataset.capabilityTitle || "Capability";
  const centerTitle = button.dataset.centerTitle || "Operations";
  const currentScore = Number(button.dataset.currentScore || 0);
  const center = centerTitle.toLowerCase();
  if (status) status.textContent = "Creating governed readiness verification…";

  try {
    const queue = await request("/api/workflows");
    if (!queue.response.ok) throw new Error(queue.body?.error?.message || "Kairos could not inspect verification workflows.");
    const duplicate = (queue.body?.workflows || []).find(item => item?.title === `${capabilityTitle} Readiness Verification` && !["completed", "cancelled"].includes(item.state));
    if (duplicate) {
      openWorkflow(duplicate.id);
      return;
    }

    const workflow = await createWorkflowRecord({
      title: `${capabilityTitle} Readiness Verification`,
      objective: `Independently verify whether completed advancement workflow ${sourceWorkflowID} justifies increasing ${capabilityTitle} above its recorded ${currentScore}% readiness baseline. No readiness increase is authorized without implementation, validation, and production evidence.`,
      center,
      source: "command-center-readiness-verification",
      tasks: [
        ["Inspect completed advancement workflow", `Review workflow ${sourceWorkflowID}, its completed tasks, and preserved evidence.`],
        ["Verify implementation evidence", "Confirm the claimed routes, interfaces, workflows, controls, and governance are actually implemented."],
        ["Verify production evidence", "Confirm the exact production deployment receipt and applicable validation evidence."],
        ["Calculate justified readiness change", `Determine the evidence-supported score change from the current ${currentScore}% baseline.`],
        ["Approve or reject readiness promotion", "Record the final evidence-backed disposition. Do not modify readiness when evidence is incomplete."],
      ],
    });
    if (status) status.textContent = `Readiness review created · ${workflow.id}`;
    await loadAdvancementRegister({ title: capabilityTitle, center: centerTitle, score: currentScore });
    openWorkflow(workflow.id);
  } catch (error) {
    if (status) status.textContent = error.message || "Kairos could not create the readiness review.";
    button.disabled = false;
  } finally {
    working = false;
  }
}

async function createWorkflowRecord({ title, objective, center, source, tasks }) {
  const workflowResponse = await request("/api/workflows", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title, objective, center, priority: "high", approvalRequired: true, source }),
  });
  if (!workflowResponse.response.ok || !workflowResponse.body?.workflow?.id) throw new Error(workflowResponse.body?.error?.message || "Kairos could not create the governed workflow.");
  const workflow = workflowResponse.body.workflow;
  for (const [taskTitle, description] of tasks) {
    const taskResponse = await request(`/api/workflows/${encodeURIComponent(workflow.id)}/tasks`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title: taskTitle, description }),
    });
    if (!taskResponse.response.ok) throw new Error(taskResponse.body?.error?.message || `Kairos created the workflow but could not add: ${taskTitle}`);
  }
  return workflow;
}

function openWorkflow(workflowID) {
  if (!workflowID) return;
  window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { workflowID } }));
  setTimeout(() => document.querySelector("#workflow-runtime")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

function headers() {
  return { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD };
}

async function request(url, init = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...init });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  return { response, body };
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

window.KairosReadinessPriority = { build: BUILD, refresh: enhanceReadinessPanel, reload: loadAdvancementRegister };