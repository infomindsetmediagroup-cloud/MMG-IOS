const BUILD = "kairos-runtime-reset-20260711-4";
const root = document.querySelector("#reset-dashboard");
let currentPlan = null;
let currentApproval = null;

const centers = [
  { id:"executive", eyebrow:"Executive Operations", title:"Direction, approvals, and operating priorities", description:"The executive layer coordinates priorities, approvals, evidence, and controlled execution across the MMG ecosystem.", status:"Foundation Available", tone:"available", abilities:[
    {title:"Operating priorities",state:"Planned",detail:"Priority orchestration returns after the evidence model is rebuilt."},
    {title:"Executive approvals",state:"Active for plan review",detail:"Shopify plans can now be approved or rejected inside this shell."},
    {title:"Decision record",state:"Planned",detail:"Approved decisions will be written into durable knowledge records."}
  ]},
  { id:"shopify", eyebrow:"Shopify & Website", title:"Storefront, theme, products, and publishing", description:"Kairos now supports a governed website-change request, source inspection, plan preview, and executive approval. Staging execution remains locked until the non-live adapter is verified.", status:"Planning Pipeline Active", tone:"limited",
    workspace:[
      {title:"Open Shopify Admin",detail:"Primary administrative workspace for store operations.",href:"https://admin.shopify.com/"},
      {title:"Open Theme Editor",detail:"Administrative visual theme workspace.",href:"https://themindsetmediagroup.com/admin/themes/current/editor"}
    ],
    pipeline:true,
    abilities:[
      {title:"Inspect live storefront",state:"Operational",detail:"Read-only homepage and sitemap inspection returned inside Kairos.",action:"inspect-storefront",label:"Inspect Live Storefront"},
      {title:"Generate governed theme plan",state:"Validation Required",detail:"Reads Shopify source and generates a bounded preview for review."},
      {title:"Executive approval",state:"Active",detail:"Approve or reject the generated plan inside the Command Center."},
      {title:"Staging execution",state:"Locked",detail:"Next build: explicit non-live target, hash checks, read-back verification, and rollback."},
      {title:"Production publishing",state:"Disabled",detail:"Remains locked until staging acceptance passes."}
    ],
    verification:[{title:"Open Live Storefront",detail:"Customer-facing view used only for post-change verification.",href:"https://themindsetmediagroup.com"}]
  },
  { id:"production", eyebrow:"Products & Production", title:"Asset production, delivery, and customer work", description:"The production center will route approved work through creation, review, delivery, and preservation without bypassing governance.", status:"Architecture Preserved", tone:"blocked", abilities:[
    {title:"Production pipeline",state:"Planned",detail:"Intake, production, verification, delivery, and preservation stages."},
    {title:"Design Studio",state:"Planned",detail:"Production-only creative workspace remains part of the approved blueprint."},
    {title:"Customer delivery",state:"Not Implemented",detail:"No tested delivery adapter exists in the reset runtime."}
  ]},
  { id:"knowledge", eyebrow:"Knowledge", title:"Institutional memory and compounding value", description:"This center will preserve evidence, decisions, assets, project history, and reusable MMG knowledge as durable operating capital.", status:"Architecture Preserved", tone:"blocked", abilities:[
    {title:"Knowledge Library",state:"Planned",detail:"Canonical knowledge storage remains part of the approved ecosystem."},
    {title:"Execution evidence",state:"Foundation",detail:"New capabilities must produce structured evidence before promotion."},
    {title:"Doctrine retrieval",state:"Planned",detail:"Kairos will consult authoritative MMG doctrine before execution."}
  ]},
  { id:"system", eyebrow:"System & Release", title:"Runtime health, releases, and capability truth", description:"The system center reports what is actually deployed, what is tested, and what remains disabled.", status:"Operational", tone:"available", abilities:[
    {title:"Runtime health",state:"Operational",detail:"Cloudflare health and capability status are available."},
    {title:"Capability registry",state:"Operational",detail:"The live shell reports truthful implementation states."},
    {title:"Release evidence",state:"Next Build",detail:"Deployment and acceptance evidence will be attached to each promoted capability."}
  ]}
];

root.innerHTML = `
<section class="reset-hero"><p class="eyebrow">Kairos Command Center</p><h1>Clean rebuild. One verified capability at a time.</h1><p class="lead">The canonical Kairos shell is frozen. The Shopify website pipeline now supports request, inspection, preview, and approval inside this Command Center. Execution remains locked until the staging adapter is proven.</p><div class="reset-badge">${BUILD}</div></section>
<section class="reset-panel"><div class="section-heading"><div><p class="eyebrow">Parent Operating Centers</p><h2>MMG operational architecture</h2></div><span class="status-pill recovery">Controlled Rebuild</span></div><div class="parent-grid">${centers.map(renderCenter).join("")}</div></section>
<section id="execution-panel" class="reset-panel execution-panel" hidden><div class="section-heading"><div><p class="eyebrow">Governed Pipeline</p><h2 id="execution-title">Pipeline result</h2></div><span id="execution-status" class="status-pill limited">Working</span></div><div id="execution-result" class="execution-result" aria-live="polite"></div></section>
<section class="reset-panel doctrine-panel"><p class="eyebrow">Execution Standard</p><h2>No capability is operational without proof</h2><p>Every external action must preserve source evidence, bounded scope, explicit approval, read-back verification, and rollback data. The shell remains fixed while each adapter is promoted individually.</p></section>`;

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
  showWorking("Inspect live storefront", "Reading the public homepage and sitemap. No Shopify mutation authority is used.");
  button.disabled = true; const original = button.textContent; button.textContent = "Inspecting…";
  try {
    const response = await fetch("/api/storefront/inspect", {method:"POST",headers:{Accept:"application/json","X-MMG-Client-Build":BUILD},credentials:"include"});
    const body = await readJSON(response); if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Inspection returned HTTP ${response.status}.`);
    setStatus("Completed", "available");
    const homepage = body?.evidence?.homepage || {}, sitemap = body?.evidence?.sitemap || {};
    setResult(`<div class="evidence-summary"><strong>${escapeHTML(body.summary || "Storefront inspection completed.")}</strong><span>Read-only · ${escapeHTML(body.completedAt || "")}</span></div><div class="evidence-grid">${renderEvidence("Homepage", homepage)}${renderEvidence("Sitemap", sitemap)}</div><details class="evidence-details"><summary>View execution evidence</summary><pre>${escapeHTML(JSON.stringify(body,null,2))}</pre></details>`);
  } catch (error) { showError(error); }
  finally { button.disabled = false; button.textContent = original; }
}

async function generatePlan(button) {
  const objective = document.querySelector("#website-objective")?.value.trim() || "";
  if (!objective) { showWorking("Website change request", "Enter the website objective before generating a plan."); setStatus("Needs Input", "blocked"); return; }
  showWorking("Generate governed website plan", "Kairos is reading current Shopify theme source and compiling a bounded preview. No write is being performed.");
  button.disabled = true; const original = button.textContent; button.textContent = "Generating…";
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
  return `<div class="plan-review"><div class="evidence-summary"><strong>${escapeHTML(plan.summary || "Shopify plan generated.")}</strong><span>Preview only · ${escapeHTML(plan.completedAt || "")}</span></div><div class="plan-grid"><section><h3>Recommended changes</h3>${list(plan.recommendedChanges)}</section><section><h3>Affected assets</h3>${list(plan.affectedAssets)}</section><section><h3>Expected benefits</h3>${list(plan.expectedBenefits)}</section><section><h3>Risks</h3>${list(plan.risks)}</section><section><h3>Rollback</h3>${list(plan.rollbackPlan)}</section><section><h3>Acceptance criteria</h3>${list(plan.acceptanceCriteria)}</section></div><div id="approval-state" class="approval-state"><strong>Awaiting executive decision.</strong><span>Review the plan before granting authority.</span></div><div class="approval-actions"><button class="secondary-action" data-action="reject-plan" type="button">Reject</button><button class="capability-action" data-action="approve-plan" type="button">Approve Plan</button><button class="capability-action" data-action="execute-plan" type="button" disabled>Execution Locked</button></div><div id="execution-lock" class="execution-lock" hidden><strong>Execution is intentionally blocked.</strong><p>Kairos has not yet verified an explicit non-live staging theme, source parity, read-back verification, or rollback package. The next adapter will establish those controls before any write is allowed.</p></div><details class="evidence-details"><summary>View source and plan evidence</summary><pre>${escapeHTML(JSON.stringify(plan,null,2))}</pre></details></div>`;
}

function renderCenter(center) { return `<article class="parent-card ${center.tone}"><div class="parent-card-header"><div><p class="eyebrow">${escapeHTML(center.eyebrow)}</p><h3>${escapeHTML(center.title)}</h3></div><span class="status-pill ${center.tone}">${escapeHTML(center.status)}</span></div><p class="parent-description">${escapeHTML(center.description)}</p>${renderLinkGroup("Workspace",center.workspace)}${center.pipeline ? renderPipeline() : ""}<div class="ability-list">${center.abilities.map(renderAbility).join("")}</div>${renderLinkGroup("Verification",center.verification,"verification-group")}</article>`; }
function renderPipeline() { return `<section class="governed-request"><p class="subgroup-label">Governed Website Change</p><label for="website-objective">What should Kairos change?</label><textarea id="website-objective" rows="5" maxlength="8000" placeholder="Describe the website change, the intended customer experience, and any constraints."></textarea><p class="request-note">Kairos will inspect source, return a preview plan, and wait for approval. This step does not write to Shopify.</p><button class="capability-action full-action" type="button" data-action="generate-plan">Inspect & Generate Preview Plan</button></section>`; }
function renderAbility(a) { return `<section class="ability-row"><div><strong>${escapeHTML(a.title)}</strong><p>${escapeHTML(a.detail)}</p></div>${a.action ? `<button class="capability-action" type="button" data-action="${escapeHTML(a.action)}">${escapeHTML(a.label || a.title)}</button>` : `<span class="ability-state">${escapeHTML(a.state)}</span>`}</section>`; }
function renderLinkGroup(title,links,extra="") { if(!Array.isArray(links)||!links.length)return""; return `<section class="card-subgroup ${extra}"><p class="subgroup-label">${escapeHTML(title)}</p><div class="workspace-grid">${links.map(link=>`<a class="workspace-link" href="${escapeHTML(link.href)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHTML(link.title)}</strong><span>${escapeHTML(link.detail)}</span></a>`).join("")}</div></section>`; }
function renderEvidence(label,e) { return `<article class="evidence-card"><span>${escapeHTML(label)}</span><strong>HTTP ${escapeHTML(e.status ?? "—")}</strong><p>${escapeHTML(e.title || e.finalUrl || e.requestedUrl || "No title returned.")}</p><small>${escapeHTML(e.contentType || "Unknown content type")} · ${escapeHTML(e.bytes ?? 0)} bytes</small></article>`; }
function showWorking(title,message) { const panel=document.querySelector("#execution-panel"); panel.hidden=false; document.querySelector("#execution-title").textContent=title; setStatus("Working","limited"); setResult(`<p class="lead compact">${escapeHTML(message)}</p>`); panel.scrollIntoView({behavior:"smooth",block:"start"}); }
function setStatus(text,tone) { const status=document.querySelector("#execution-status"); status.textContent=text; status.className=`status-pill ${tone}`; }
function setResult(html) { document.querySelector("#execution-result").innerHTML=html; }
function showError(error) { setStatus("Needs Attention","blocked"); setResult(`<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "The pipeline failed.")}</p>`); }
async function readJSON(response) { const text=await response.text(); if(!text)return{}; try{return JSON.parse(text)}catch{return{summary:text}} }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]); }
