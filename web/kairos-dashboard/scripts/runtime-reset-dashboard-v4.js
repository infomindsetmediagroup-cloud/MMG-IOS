const BUILD = "kairos-kernel-20260712-1";
const root = document.querySelector("#reset-dashboard");
let currentPlan = null;
let currentApproval = null;

const centers = [
  { id:"executive", eyebrow:"Executive Operations", title:"Direction, approvals, and operating priorities", description:"The executive layer coordinates priorities, approvals, evidence, and controlled execution across the MMG ecosystem.", status:"Foundation Available", tone:"available", abilities:[
    {title:"Operating priorities",state:"Planned",detail:"Priority orchestration returns after the evidence model is rebuilt."},
    {title:"Executive approvals",state:"Foundation",detail:"Approval doctrine is preserved; execution remains locked until a staging adapter passes verification."},
    {title:"Decision record",state:"Planned",detail:"Approved decisions will be written into durable knowledge records."}
  ]},
  { id:"shopify", eyebrow:"Shopify & Website", title:"Storefront, theme, products, and publishing", description:"The standalone kernel is online. Public inspection is available for validation; Shopify Admin authentication and scope validation are the next execution vertical.", status:"Kernel Online", tone:"limited",
    workspace:[
      {title:"Open Shopify Admin",detail:"Primary administrative workspace for store operations.",href:"https://admin.shopify.com/"},
      {title:"Open Theme Editor",detail:"Administrative visual theme workspace.",href:"https://themindsetmediagroup.com/admin/themes/current/editor"}
    ],
    pipeline:true,
    abilities:[
      {title:"Inspect live storefront",state:"Validation Required",detail:"Read-only homepage and sitemap inspection returned inside Kairos.",action:"inspect-storefront",label:"Inspect Live Storefront"},
      {title:"Validate Shopify connection",state:"Next Build",detail:"Prove credentials, scopes, main-theme access, and non-live staging-theme discovery."},
      {title:"Generate governed theme plan",state:"Locked",detail:"Planning unlocks after Shopify connection validation passes."},
      {title:"Staging execution",state:"Locked",detail:"Requires explicit non-live target, hash checks, read-back verification, and rollback."},
      {title:"Production publishing",state:"Disabled",detail:"Remains locked until staging acceptance passes."}
    ],
    verification:[{title:"Open Live Storefront",detail:"Customer-facing view used only for post-change verification.",href:"https://themindsetmediagroup.com"}]
  },
  { id:"production", eyebrow:"Products & Production", title:"Asset production, delivery, and customer work", description:"The production center will route approved work through creation, review, delivery, and preservation without bypassing governance.", status:"Architecture Preserved", tone:"blocked", abilities:[
    {title:"Production pipeline",state:"Planned",detail:"Intake, production, verification, delivery, and preservation stages."},
    {title:"Design Studio",state:"Planned",detail:"Production-only creative workspace remains part of the approved blueprint."},
    {title:"Customer delivery",state:"Not Implemented",detail:"No tested delivery adapter exists in the kernel runtime."}
  ]},
  { id:"knowledge", eyebrow:"Knowledge", title:"Institutional memory and compounding value", description:"This center will preserve evidence, decisions, assets, project history, and reusable MMG knowledge as durable operating capital.", status:"Architecture Preserved", tone:"blocked", abilities:[
    {title:"Knowledge Library",state:"Planned",detail:"Canonical knowledge storage remains part of the approved ecosystem."},
    {title:"Execution evidence",state:"Foundation",detail:"New capabilities must produce structured evidence before promotion."},
    {title:"Doctrine retrieval",state:"Planned",detail:"Kairos will consult authoritative MMG doctrine before execution."}
  ]},
  { id:"system", eyebrow:"System & Release", title:"Runtime health, releases, and capability truth", description:"The system center reports what is actually deployed, what is tested, and what remains disabled.", status:"Operational", tone:"available", abilities:[
    {title:"Standalone kernel",state:"Operational",detail:"The active Worker has zero imports from the archived prototype runtime."},
    {title:"Runtime health",state:"Operational",detail:"Cloudflare health and capability status are available."},
    {title:"Capability registry",state:"Operational",detail:"The live shell reports truthful implementation states."}
  ]}
];

root.innerHTML = `
<section class="reset-hero"><p class="eyebrow">Kairos Command Center</p><h1>Standalone kernel. Controlled capability build.</h1><p class="lead">The canonical Kairos shell is frozen. The runtime is isolated from the archived prototype. Capabilities will now be promoted only after their complete evidence, approval, execution, verification, and rollback pipeline passes.</p><div class="reset-badge">${BUILD}</div></section>
<section class="reset-panel"><div class="section-heading"><div><p class="eyebrow">Parent Operating Centers</p><h2>MMG operational architecture</h2></div><span class="status-pill recovery">Controlled Rebuild</span></div><div class="parent-grid">${centers.map(renderCenter).join("")}</div></section>
<section id="execution-panel" class="reset-panel execution-panel" hidden><div class="section-heading"><div><p class="eyebrow">Kernel Evidence</p><h2 id="execution-title">Capability result</h2></div><span id="execution-status" class="status-pill limited">Working</span></div><div id="execution-result" class="execution-result" aria-live="polite"></div></section>
<section class="reset-panel doctrine-panel"><p class="eyebrow">Execution Standard</p><h2>No capability is operational without proof</h2><p>Every external action must preserve source evidence, bounded scope, explicit approval, read-back verification, and rollback data. The shell remains fixed while each standalone adapter is promoted individually.</p></section>`;

root.addEventListener("click", async event => {
  const action = event.target.closest("[data-action]");
  if (!action || action.disabled) return;
  if (action.dataset.action === "inspect-storefront") await inspectStorefront(action);
  if (action.dataset.action === "generate-plan") await generatePlan(action);
  if (action.dataset.action === "approve-plan") approvePlan();
  if (action.dataset.action === "reject-plan") rejectPlan();
  if (action.dataset.action === "execute-plan") showExecutionLock();
});

async function inspectStorefront(button) {
  showWorking("Inspect live storefront", "Reading the public homepage and sitemap through the standalone kernel. No Shopify mutation authority is used.");
  button.disabled = true; const original = button.textContent; button.textContent = "Inspecting…";
  try {
    const response = await fetch("/api/storefront/inspect", {method:"POST",headers:{Accept:"application/json","X-MMG-Client-Build":BUILD},credentials:"include"});
    const body = await readJSON(response);
    const homepage = body?.evidence?.homepage || {}, sitemap = body?.evidence?.sitemap || {}, errors = body?.evidence?.errors || [];
    setStatus(response.ok ? "Completed" : "Needs Attention", response.ok ? "available" : "blocked");
    setResult(`<div class="evidence-summary"><strong>${escapeHTML(body.summary || `Inspection returned HTTP ${response.status}.`)}</strong><span>Read-only · ${escapeHTML(body.completedAt || "")}</span></div><div class="evidence-grid">${renderEvidence("Homepage", homepage)}${renderEvidence("Sitemap", sitemap)}</div>${errors.length ? `<div class="execution-error">${errors.map(error => `<p><strong>${escapeHTML(error.path || "Request")}</strong>: ${escapeHTML(error.message || "Unknown failure")}</p>`).join("")}</div>` : ""}<details class="evidence-details" open><summary>View execution evidence</summary><pre>${escapeHTML(JSON.stringify(body,null,2))}</pre></details>`);
  } catch (error) { showError(error); }
  finally { button.disabled = false; button.textContent = original; }
}

async function generatePlan(button) {
  const objective = document.querySelector("#website-objective")?.value.trim() || "";
  if (!objective) { showWorking("Website change request", "Enter the website objective before generating a plan."); setStatus("Needs Input", "blocked"); return; }
  showWorking("Generate governed website plan", "The standalone kernel is checking whether Shopify connection validation has been completed.");
  button.disabled = true; const original = button.textContent; button.textContent = "Checking…";
  currentPlan = null; currentApproval = null;
  try {
    const response = await fetch("/api/shopify/theme/plan", {method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json","X-MMG-Client-Build":BUILD},credentials:"include",body:JSON.stringify({objective})});
    const body = await readJSON(response); if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Planning returned HTTP ${response.status}.`);
    currentPlan = body;
    sessionStorage.setItem("kairos.currentThemePlan", JSON.stringify(body));
    setStatus("Ready for Review", "limited");
    setResult(renderPlan(body));
  } catch (error) { showError(error); }
  finally { button.disabled = false; button.textContent = original; }
}

function approvePlan() {
  if (!currentPlan) return;
  currentApproval = {status:"approved", approvedAt:new Date().toISOString(), planActionID:currentPlan.actionID || ""};
  sessionStorage.setItem("kairos.currentThemeApproval", JSON.stringify(currentApproval));
  setStatus("Approved", "available");
  const approval = document.querySelector("#approval-state");
  if (approval) approval.innerHTML = `<strong>Plan approved.</strong><span>${escapeHTML(currentApproval.approvedAt)}</span>`;
  const execute = document.querySelector('[data-action="execute-plan"]');
  if (execute) { execute.disabled = false; execute.textContent = "Continue to Execution Check"; }
}

function rejectPlan() {
  currentApproval = null;
  sessionStorage.removeItem("kairos.currentThemeApproval");
  setStatus("Rejected", "blocked");
  const approval = document.querySelector("#approval-state");
  if (approval) approval.innerHTML = "<strong>Plan rejected.</strong><span>No execution authority was granted.</span>";
}

function showExecutionLock() {
  setStatus("Staging Adapter Required", "limited");
  const lock = document.querySelector("#execution-lock");
  if (lock) lock.hidden = false;
}

function renderPlan(plan) {
  const list = value => Array.isArray(value) && value.length ? `<ul>${value.map(item => `<li>${escapeHTML(typeof item === "string" ? item : JSON.stringify(item))}</li>`).join("")}</ul>` : "<p>None returned.</p>";
  return `<div class="plan-review"><div class="evidence-summary"><strong>${escapeHTML(plan.summary || "Shopify plan generated.")}</strong><span>Preview only · ${escapeHTML(plan.completedAt || "")}</span></div><div class="plan-grid"><section><h3>Recommended changes</h3>${list(plan.recommendedChanges)}</section><section><h3>Affected assets</h3>${list(plan.affectedAssets)}</section><section><h3>Expected benefits</h3>${list(plan.expectedBenefits)}</section><section><h3>Risks</h3>${list(plan.risks)}</section><section><h3>Rollback</h3>${list(plan.rollbackPlan)}</section><section><h3>Acceptance criteria</h3>${list(plan.acceptanceCriteria)}</section></div><div id="approval-state" class="approval-state"><strong>Awaiting executive decision.</strong><span>Review the plan before granting authority.</span></div><div class="approval-actions"><button class="secondary-action" data-action="reject-plan" type="button">Reject</button><button class="capability-action" data-action="approve-plan" type="button">Approve Plan</button><button class="capability-action" data-action="execute-plan" type="button" disabled>Execution Locked</button></div><div id="execution-lock" class="execution-lock" hidden><strong>Execution is intentionally blocked.</strong><p>Kairos has not yet verified an explicit non-live staging theme, source parity, read-back verification, or rollback package.</p></div><details class="evidence-details"><summary>View source and plan evidence</summary><pre>${escapeHTML(JSON.stringify(plan,null,2))}</pre></details></div>`;
}

function renderCenter(center) { return `<article class="parent-card ${center.tone}"><div class="parent-card-header"><div><p class="eyebrow">${escapeHTML(center.eyebrow)}</p><h3>${escapeHTML(center.title)}</h3></div><span class="status-pill ${center.tone}">${escapeHTML(center.status)}</span></div><p class="parent-description">${escapeHTML(center.description)}</p>${renderLinkGroup("Workspace",center.workspace)}${center.pipeline ? renderPipeline() : ""}<div class="ability-list">${center.abilities.map(renderAbility).join("")}</div>${renderLinkGroup("Verification",center.verification,"verification-group")}</article>`; }
function renderPipeline() { return `<section class="governed-request"><p class="subgroup-label">Governed Website Change</p><label for="website-objective">What should Kairos change?</label><textarea id="website-objective" rows="5" maxlength="8000" placeholder="Describe the website change, intended customer experience, and constraints."></textarea><p class="request-note">Planning remains locked until Shopify connection validation passes. This control performs no write.</p><button class="capability-action full-action" type="button" data-action="generate-plan">Check Planning Readiness</button></section>`; }
function renderAbility(a) { return `<section class="ability-row"><div><strong>${escapeHTML(a.title)}</strong><p>${escapeHTML(a.detail)}</p></div>${a.action ? `<button class="capability-action" type="button" data-action="${escapeHTML(a.action)}">${escapeHTML(a.label || a.title)}</button>` : `<span class="ability-state">${escapeHTML(a.state)}</span>`}</section>`; }
function renderLinkGroup(title,links,extra="") { if(!Array.isArray(links)||!links.length)return""; return `<section class="card-subgroup ${extra}"><p class="subgroup-label">${escapeHTML(title)}</p><div class="workspace-grid">${links.map(link=>`<a class="workspace-link" href="${escapeHTML(link.href)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHTML(link.title)}</strong><span>${escapeHTML(link.detail)}</span></a>`).join("")}</div></section>`; }
function renderEvidence(label,e) { return `<article class="evidence-card"><span>${escapeHTML(label)}</span><strong>HTTP ${escapeHTML(e.status ?? "—")}</strong><p>${escapeHTML(e.title || e.finalUrl || e.requestedUrl || "No response returned.")}</p><small>${escapeHTML(e.contentType || "Unknown content type")} · ${escapeHTML(e.bytes ?? 0)} bytes</small></article>`; }
function showWorking(title,message) { const panel=document.querySelector("#execution-panel"); panel.hidden=false; document.querySelector("#execution-title").textContent=title; setStatus("Working","limited"); setResult(`<p class="lead compact">${escapeHTML(message)}</p>`); panel.scrollIntoView({behavior:"smooth",block:"start"}); }
function setStatus(text,tone) { const status=document.querySelector("#execution-status"); status.textContent=text; status.className=`status-pill ${tone}`; }
function setResult(html) { document.querySelector("#execution-result").innerHTML=html; }
function showError(error) { setStatus("Needs Attention","blocked"); setResult(`<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "The pipeline failed.")}</p>`); }
async function readJSON(response) { const text=await response.text(); if(!text)return{}; try{return JSON.parse(text)}catch{return{summary:text}} }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]); }
