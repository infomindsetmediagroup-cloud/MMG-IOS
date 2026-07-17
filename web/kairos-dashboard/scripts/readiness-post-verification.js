const BUILD = "kairos-readiness-post-verification-ui-20260714-1";
let working = false;

start();

function start() {
  document.addEventListener("click", handleClick, true);
}

async function handleClick(event) {
  const centerButton = event.target.closest?.("[data-center]");
  if (centerButton) {
    [1100, 1800].forEach(delay => setTimeout(enhanceRegister, delay));
    return;
  }

  const openButton = event.target.closest?.("[data-open-post-verification]");
  if (openButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openWorkflow(openButton.dataset.openPostVerification);
    return;
  }

  const createButton = event.target.closest?.("[data-create-post-verification]");
  if (!createButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await createVerification(createButton);
}

async function enhanceRegister() {
  const panel = document.querySelector(".center-readiness");
  if (!panel || panel.querySelector(".readiness-post-verification")) return;

  const section = document.createElement("section");
  section.className = "readiness-post-verification";
  section.innerHTML = `<header><div><p class="eyebrow">Post-Application Verification</p><h4>Confirm applied meter changes</h4></div><span data-post-verification-count>0</span></header><div data-post-verification-list><p class="readiness-register-empty">Loading applied readiness changes…</p></div><p class="readiness-post-verification-boundary">An applied score remains subject to independent verification. This workflow confirms the registry, child meter, parent meter, and preserved evidence all agree.</p>`;
  panel.appendChild(section);
  await loadRegister();
}

async function loadRegister() {
  const listRoot = document.querySelector("[data-post-verification-list]");
  const countRoot = document.querySelector("[data-post-verification-count]");
  if (!listRoot) return;

  try {
    const [registryResult, workflowResult] = await Promise.all([
      request("/api/readiness-registry"),
      request("/api/workflows"),
    ]);
    if (!registryResult.response.ok) throw new Error("Kairos could not read the readiness registry.");
    if (!workflowResult.response.ok) throw new Error("Kairos could not read verification workflows.");

    const workspace = document.querySelector("#workspace");
    const center = workspace?.querySelector(".workspace-head .eyebrow")?.textContent?.split(" Center")[0]?.trim().toLowerCase();
    const changes = (registryResult.body?.history || []).filter(change => change.center === center);
    const workflows = workflowResult.body?.workflows || [];
    if (countRoot) countRoot.textContent = String(changes.length);

    if (!changes.length) {
      listRoot.innerHTML = `<p class="readiness-register-empty">No applied readiness change exists for this center yet.</p>`;
      return;
    }

    listRoot.innerHTML = changes.slice(0, 8).map(change => {
      const title = `${label(change.capability)} Post-Application Verification`;
      const verification = workflows.find(item => item?.source === "command-center-readiness-post-verification" && String(item?.objective || "").includes(change.id));
      const action = verification
        ? `<button type="button" data-open-post-verification="${escapeHTML(verification.id)}">Open Verification</button>`
        : `<button type="button" class="readiness-post-verify-action" data-create-post-verification="${escapeHTML(change.id)}" data-center="${escapeHTML(change.center)}" data-capability="${escapeHTML(change.capability)}" data-prior-score="${Number(change.priorScore || 0)}" data-target-score="${Number(change.targetScore || 0)}" data-authorization="${escapeHTML(change.authorizationWorkflowID || "")}">Verify Applied Change</button>`;
      return `<article class="readiness-post-verification-row"><div><strong>${escapeHTML(title)}</strong><small>${Number(change.priorScore || 0)}% → ${Number(change.targetScore || 0)}% · applied ${formatDate(change.appliedAt)}</small></div><div class="readiness-row-actions">${action}</div></article>`;
    }).join("");
  } catch (error) {
    listRoot.innerHTML = `<p class="readiness-register-empty">${escapeHTML(error.message || "Kairos could not load post-application verification.")}</p>`;
  }
}

async function createVerification(button) {
  if (working || button.disabled) return;
  working = true;
  button.disabled = true;
  button.textContent = "Creating…";

  const changeID = button.dataset.createPostVerification;
  const center = button.dataset.center || "operations";
  const capability = button.dataset.capability || "capability";
  const priorScore = Number(button.dataset.priorScore || 0);
  const targetScore = Number(button.dataset.targetScore || 0);
  const authorizationID = button.dataset.authorization || "";
  const capabilityTitle = label(capability);

  try {
    const queue = await request("/api/workflows");
    const duplicate = (queue.body?.workflows || []).find(item => item?.source === "command-center-readiness-post-verification" && String(item?.objective || "").includes(changeID) && !["completed", "cancelled"].includes(item.state));
    if (duplicate) {
      openWorkflow(duplicate.id);
      return;
    }

    const workflowResponse = await request("/api/workflows", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        title: `${capabilityTitle} Post-Application Verification`,
        objective: `Verify applied readiness change ${changeID} for ${capabilityTitle}: ${priorScore}% to ${targetScore}%, authorized by workflow ${authorizationID}. Confirm the registry, child meter, parent meter, and preserved evidence agree before final closure.`,
        center,
        priority: "critical",
        approvalRequired: true,
        source: "command-center-readiness-post-verification",
      }),
    });
    if (!workflowResponse.response.ok || !workflowResponse.body?.workflow?.id) throw new Error(workflowResponse.body?.error?.message || "Kairos could not create post-application verification.");
    const workflow = workflowResponse.body.workflow;
    const tasks = [
      ["Verify registry record", `Confirm readiness change ${changeID} exists with the approved ${targetScore}% score, actor, evidence, and authorization reference.`],
      ["Verify child capability meter", `Confirm ${capabilityTitle} visibly reports ${targetScore}% and matches the registry source of truth.`],
      ["Verify parent center meter", "Recalculate the five child scores and confirm the parent center percentage and blue meter are accurate."],
      ["Verify governance evidence", `Confirm authorization workflow ${authorizationID}, application evidence, and rollback reference are preserved.`],
      ["Close verification receipt", "Record the final evidence-backed disposition. Block closure if any meter, registry value, or evidence reference disagrees."],
    ];
    for (const [title, description] of tasks) {
      const task = await request(`/api/workflows/${encodeURIComponent(workflow.id)}/tasks`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ title, description }),
      });
      if (!task.response.ok) throw new Error(task.body?.error?.message || `Kairos could not add: ${title}`);
    }
    await loadRegister();
    openWorkflow(workflow.id);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Verify Applied Change";
    alert(error.message || "Kairos could not create post-application verification.");
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
async function request(url, init = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...init });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  return { response, body };
}
function label(value) { return String(value || "capability").split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
function formatDate(value) { const date = Date.parse(value || ""); return Number.isFinite(date) ? new Date(date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "unknown time"; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]); }

window.KairosReadinessPostVerification = { build: BUILD, refresh: enhanceRegister, reload: loadRegister };