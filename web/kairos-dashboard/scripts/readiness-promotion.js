const BUILD = "kairos-readiness-promotion-ui-20260714-1";
let working = false;
let activeContext = null;

start();

function start() {
  document.addEventListener("click", handleClick, true);
}

async function handleClick(event) {
  const centerButton = event.target.closest?.("[data-center]");
  if (centerButton) {
    scheduleEnhancement();
    return;
  }

  const openButton = event.target.closest?.("[data-open-promotion-workflow]");
  if (openButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openWorkflow(openButton.dataset.openPromotionWorkflow);
    return;
  }

  const createButton = event.target.closest?.("[data-create-promotion-workflow]");
  if (!createButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await createPromotionWorkflow(createButton);
}

function scheduleEnhancement() {
  [220, 700, 1400].forEach(delay => setTimeout(enhancePromotionRegister, delay));
}

async function enhancePromotionRegister() {
  const panel = document.querySelector(".center-readiness");
  if (!panel || panel.querySelector(".readiness-promotion-register")) return;

  const childCards = [...document.querySelectorAll(".child-card[data-readiness]")]
    .map(card => ({
      score: Number(card.dataset.readiness || 0),
      title: card.querySelector("h3")?.textContent?.trim() || "Capability",
      childID: card.querySelector("[data-child]")?.dataset.child || "",
      center: card.querySelector(".eyebrow")?.textContent?.trim() || "Operations",
    }))
    .filter(item => item.childID)
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));

  if (!childCards.length) return;
  activeContext = childCards[0];

  const register = document.createElement("section");
  register.className = "readiness-promotion-register";
  register.innerHTML = `<header><div><p class="eyebrow">Promotion Authorization</p><h4>Verified readiness changes awaiting governed disposition</h4></div><span data-promotion-count>0</span></header><div data-promotion-list><p class="readiness-register-empty">Loading verification outcomes…</p></div><p class="readiness-promotion-boundary">Authorization does not change the meter by itself. The readiness registry must be updated from approved evidence and then verified.</p>`;
  panel.appendChild(register);
  await loadPromotionRegister(activeContext);
}

async function loadPromotionRegister(context = activeContext) {
  if (!context) return;
  const listRoot = document.querySelector("[data-promotion-list]");
  const countRoot = document.querySelector("[data-promotion-count]");
  if (!listRoot) return;

  try {
    const result = await request("/api/workflows");
    if (!result.response.ok) throw new Error(result.body?.error?.message || "Kairos could not read readiness verification outcomes.");

    const center = String(context.center || "").toLowerCase();
    const verificationTitle = `${context.title} Readiness Verification`;
    const promotionTitle = `${context.title} Readiness Promotion Authorization`;
    const all = result.body?.workflows || [];
    const verifications = all
      .filter(item => item?.title === verificationTitle || item?.source === "command-center-readiness-verification")
      .filter(item => String(item?.center || "").toLowerCase() === center)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
    const promotions = all
      .filter(item => item?.title === promotionTitle || item?.source === "command-center-readiness-promotion")
      .filter(item => String(item?.center || "").toLowerCase() === center);

    if (countRoot) countRoot.textContent = String(verifications.length);
    if (!verifications.length) {
      listRoot.innerHTML = `<p class="readiness-register-empty">No readiness verification workflow exists for this capability yet.</p>`;
      return;
    }

    listRoot.innerHTML = verifications.slice(0, 5).map(verification => {
      const promotion = promotions.find(item => String(item?.objective || "").includes(verification.id));
      const completed = verification.state === "completed";
      const action = promotion
        ? `<button type="button" data-open-promotion-workflow="${escapeHTML(promotion.id)}">Open Authorization</button>`
        : completed
          ? `<button type="button" class="readiness-promotion-action" data-create-promotion-workflow="${escapeHTML(verification.id)}" data-capability-title="${escapeHTML(context.title)}" data-center-title="${escapeHTML(context.center)}" data-current-score="${Number(context.score || 0)}">Authorize Promotion</button>`
          : `<button type="button" disabled>Verification ${escapeHTML(verification.state || "ready")}</button>`;
      return `<article class="readiness-promotion-row" data-state="${escapeHTML(verification.state || "ready")}"><div><strong>${escapeHTML(verification.title || verificationTitle)}</strong><small>${escapeHTML(verification.state || "ready")} · ${Number(verification.completedTasks || 0)}/${Number(verification.taskCount || 0)} tasks</small></div><div class="readiness-row-actions"><button type="button" data-open-promotion-workflow="${escapeHTML(verification.id)}">Open Review</button>${action}</div></article>`;
    }).join("");
  } catch (error) {
    listRoot.innerHTML = `<p class="readiness-register-empty">${escapeHTML(error.message || "Kairos could not load promotion authorization.")}</p>`;
  }
}

async function createPromotionWorkflow(button) {
  if (working || button.disabled) return;
  working = true;
  button.disabled = true;
  const verificationID = button.dataset.createPromotionWorkflow;
  const capabilityTitle = button.dataset.capabilityTitle || "Capability";
  const centerTitle = button.dataset.centerTitle || "Operations";
  const currentScore = Number(button.dataset.currentScore || 0);
  const center = centerTitle.toLowerCase();

  try {
    const queue = await request("/api/workflows");
    if (!queue.response.ok) throw new Error(queue.body?.error?.message || "Kairos could not inspect promotion workflows.");
    const duplicate = (queue.body?.workflows || []).find(item => item?.title === `${capabilityTitle} Readiness Promotion Authorization` && !["completed", "cancelled"].includes(item.state));
    if (duplicate) {
      openWorkflow(duplicate.id);
      return;
    }

    const workflow = await createWorkflowRecord({
      title: `${capabilityTitle} Readiness Promotion Authorization`,
      objective: `Authorize or reject the readiness change proposed by completed verification workflow ${verificationID} for ${capabilityTitle}, currently recorded at ${currentScore}%. The meter must not change until the approved score, evidence, registry update, and post-update verification are preserved.`,
      center,
      tasks: [
        ["Validate completed verification disposition", `Inspect verification workflow ${verificationID} and confirm it reached an evidence-backed completed state.`],
        ["Record approved target score", `Document the justified score above the current ${currentScore}% baseline, or reject the promotion when evidence is insufficient.`],
        ["Confirm promotion exclusivity", "Verify there is no conflicting open promotion authorization for this capability."],
        ["Authorize readiness registry update", "Approve the exact registry change with actor, rationale, source evidence, and rollback reference."],
        ["Verify updated meter and audit receipt", "After the registry update, verify the parent and child meters reflect the approved score and preserve the resulting evidence."],
      ],
    });
    await loadPromotionRegister({ title: capabilityTitle, center: centerTitle, score: currentScore });
    openWorkflow(workflow.id);
  } catch (error) {
    button.disabled = false;
    const listRoot = document.querySelector("[data-promotion-list]");
    if (listRoot) listRoot.insertAdjacentHTML("afterbegin", `<p class="readiness-register-empty">${escapeHTML(error.message || "Kairos could not create promotion authorization.")}</p>`);
  } finally {
    working = false;
  }
}

async function createWorkflowRecord({ title, objective, center, tasks }) {
  const response = await request("/api/workflows", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title, objective, center, priority: "critical", approvalRequired: true, source: "command-center-readiness-promotion" }),
  });
  if (!response.response.ok || !response.body?.workflow?.id) throw new Error(response.body?.error?.message || "Kairos could not create promotion authorization.");
  const workflow = response.body.workflow;
  for (const [taskTitle, description] of tasks) {
    const task = await request(`/api/workflows/${encodeURIComponent(workflow.id)}/tasks`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title: taskTitle, description }),
    });
    if (!task.response.ok) throw new Error(task.body?.error?.message || `Kairos created the authorization but could not add: ${taskTitle}`);
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

window.KairosReadinessPromotion = { build: BUILD, refresh: enhancePromotionRegister, reload: loadPromotionRegister };