const BUILD = "kairos-readiness-priority-ui-20260714-2";
let working = false;

start();

function start() {
  document.addEventListener("click", handleClick, true);
}

async function handleClick(event) {
  const centerButton = event.target.closest?.("[data-center]");
  if (centerButton) {
    setTimeout(enhanceReadinessPanel, 40);
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

function enhanceReadinessPanel() {
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
  const remaining = Math.max(0, 100 - next.score);
  const priority = document.createElement("section");
  priority.className = "readiness-priority";
  priority.innerHTML = `<div><p class="eyebrow">Next Build Priority</p><h4>${escapeHTML(next.title)}</h4><p>Lowest-readiness capability in this center · ${next.score}% operational · ${remaining} points remaining</p><p class="readiness-workflow-status" data-readiness-workflow-status></p></div><div class="readiness-priority-actions"><button type="button" data-build-next="${escapeHTML(next.childID)}">Open Capability →</button><button type="button" class="secondary-readiness-action" data-create-readiness-workflow="${escapeHTML(next.childID)}" data-capability-title="${escapeHTML(next.title)}" data-center-title="${escapeHTML(next.center)}" data-current-score="${next.score}">Create Build Workflow</button></div>`;
  panel.appendChild(priority);
}

async function createAdvancementWorkflow(button) {
  if (working) return;
  working = true;
  button.disabled = true;
  const status = document.querySelector("[data-readiness-workflow-status]");
  if (status) status.textContent = "Creating governed advancement workflow…";

  const capabilityTitle = button.dataset.capabilityTitle || "Capability";
  const centerTitle = button.dataset.centerTitle || "Operations";
  const currentScore = Number(button.dataset.currentScore || 0);
  const center = centerTitle.toLowerCase();

  try {
    const workflowResponse = await request("/api/workflows", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        title: `${capabilityTitle} Readiness Advancement`,
        objective: `Advance ${capabilityTitle} from ${currentScore}% operational readiness toward verified production completion without fabricating readiness evidence.`,
        center,
        priority: "high",
        approvalRequired: true,
        source: "command-center-readiness-priority",
      }),
    });
    if (!workflowResponse.response.ok || !workflowResponse.body?.workflow?.id) throw new Error(workflowResponse.body?.error?.message || "Kairos could not create the advancement workflow.");

    const workflow = workflowResponse.body.workflow;
    const tasks = [
      ["Confirm current readiness baseline", `Verify the recorded ${currentScore}% baseline and identify the exact remaining capability gaps.`],
      ["Close implementation gaps", "Complete the missing routes, interfaces, workflow connections, and production controls."],
      ["Verify governance and evidence", "Confirm approval, provenance, auditability, and evidence requirements without inventing completion."],
      ["Validate production readiness", "Run the applicable production validation and preserve the resulting evidence."],
      ["Recalculate operational readiness", "Update readiness only from verified implementation and deployment evidence."],
    ];

    for (const [title, description] of tasks) {
      const taskResponse = await request(`/api/workflows/${encodeURIComponent(workflow.id)}/tasks`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ title, description }),
      });
      if (!taskResponse.response.ok) throw new Error(taskResponse.body?.error?.message || `Kairos created the workflow but could not add: ${title}`);
    }

    if (status) status.textContent = `Workflow created · ${workflow.id}`;
    window.dispatchEvent(new CustomEvent("kairos:workflow-runtime:open", { detail: { workflowID: workflow.id } }));
    setTimeout(() => document.querySelector("#workflow-runtime")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  } catch (error) {
    if (status) status.textContent = error.message || "Kairos could not create the advancement workflow.";
    button.disabled = false;
  } finally {
    working = false;
  }
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

window.KairosReadinessPriority = { build: BUILD, refresh: enhanceReadinessPanel };