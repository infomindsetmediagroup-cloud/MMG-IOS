const BUILD = "kairos-website-production-20260712-1";
const PLAN_URL = "/api/shopify/staging/plan/jobs";
const EXECUTE_URL = "/api/shopify/staging/execute/jobs";

const ACTIONS = {
  homepage: {
    label: "Retool Homepage",
    description: "Rebuild the homepage around the approved MMG Experience-First Journey.",
    placeholder: "Example: Rebuild the homepage around Your Knowledge Has Value and connect the Free Creator Toolkit, Knowledge Library, publishing pathway, Customer Portal, and Road to 1 Million.",
    pageType: "homepage"
  },
  buildPage: {
    label: "Build Page",
    description: "Create a new landing, service, campaign, or information page.",
    placeholder: "Example: Build a landing page for the Free Creator Toolkit that guides visitors into creator education and CapCut templates.",
    pageType: "landing-page"
  },
  retoolPage: {
    label: "Retool Existing Page",
    description: "Redesign and reconnect an existing Shopify page.",
    placeholder: "Example: Retool the publishing services page into a guided pathway from service selection to manuscript intake and customer approval.",
    pageType: "existing-page"
  },
  productPage: {
    label: "Build Product Page",
    description: "Create or upgrade a product page using verified product data and approved MMG assets.",
    placeholder: "Example: Retool AI Prompting for Beginners into a premium product page with clear benefits, learning outcomes, related resources, and next-step pathways.",
    pageType: "product-page"
  },
  journey: {
    label: "Connect Customer Journey",
    description: "Interconnect pages, products, resources, and customer next steps.",
    placeholder: "Example: Connect the Free Creator Toolkit to the Knowledge Library, relevant products, publishing services, and Customer Portal without creating dead ends.",
    pageType: "journey-graph"
  },
  guidance: {
    label: "Add Kairos Guidance",
    description: "Add restrained page-specific guidance blips and approved audio guidance points.",
    placeholder: "Example: Add nonintrusive Kairos guidance prompts to the homepage, publishing page, and product pages, with mute, dismiss, caption, and frequency controls.",
    pageType: "guidance-layer"
  },
  inspect: {
    label: "Inspect Website",
    description: "Inspect structure, links, mobile behavior, claims, SEO, and customer pathways before proposing changes.",
    placeholder: "Example: Inspect the entire staging storefront and identify broken journeys, duplicate sections, weak CTAs, mobile problems, unsupported claims, and missing cross-links.",
    pageType: "inspection"
  }
};

const DOCTRINE = {
  brand: [
    "Your Knowledge Has Value.",
    "Helping you discover it, build it, and share it with the world.",
    "We're not gatekeepers. We're door openers.",
    "Knowledge grows when it's shared. Opportunity grows when doors are opened."
  ],
  journey: ["Discover", "Learn", "Create", "Publish", "Grow", "Leave a Legacy"],
  destinations: [
    "Free Creator Toolkit",
    "Knowledge Library",
    "Books and digital resources",
    "Publishing services",
    "Customer Portal",
    "Road to 1 Million"
  ],
  design: [
    "premium black-and-MMG-blue visual identity",
    "mobile-first",
    "Apple-level clarity and spacing",
    "restrained motion",
    "native Shopify maintainability",
    "exact approved MMG assets only",
    "no invented products, URLs, claims, testimonials, statistics, or interfaces"
  ],
  execution: [
    "inspect actual staging source before proposing changes",
    "use verified Shopify theme IDs, files, links, products, collections, pages, menus, and assets only",
    "create backups before mutation",
    "bind execution to current source hashes",
    "execute only after explicit approval",
    "verify written files and preserve rollback evidence",
    "do not change the live published theme during staging preparation"
  ],
  guidance: [
    "guidance must be contextual, restrained, dismissible, mutable, captioned, and frequency-limited",
    "static approved scripts or prerecorded audio may be used; no generative audio is required",
    "guidance must move the user toward a real verified next step"
  ]
};

const COMPONENTS = [
  "MMG Hero",
  "Guided Journey",
  "Choose Your Next Step",
  "Knowledge Cards",
  "Publishing Pathway",
  "Customer Progress Panel",
  "Founder Philosophy",
  "Trust and Standards",
  "FAQ",
  "Final Ecosystem CTA",
  "Kairos Guidance Blip",
  "Cross-Navigation Cards",
  "Product Purchase Card",
  "Project Intake CTA"
];

const state = { open:false, action:"homepage", objective:"", phase:"input", plan:null, result:null, error:"", message:"" };

function mount() {
  document.addEventListener("click", interceptWebsiteCard, true);
  const observer = new MutationObserver(relabelWebsiteCard);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  relabelWebsiteCard();
}

function relabelWebsiteCard() {
  const button = document.querySelector('[data-child="website"]');
  if (!button || button.dataset.websiteProductionBound === BUILD) return;
  button.dataset.websiteProductionBound = BUILD;
  button.textContent = "Open Website Production";
  const card = button.closest(".child-card");
  if (card) {
    const title = card.querySelector("h3");
    const text = card.querySelector("h3 + p");
    if (title) title.textContent = "Website Production";
    if (text) text.textContent = "Build, retool, connect, inspect, approve, execute, and verify Shopify pages.";
  }
}

function interceptWebsiteCard(event) {
  const button = event.target.closest?.('[data-child="website"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.open = true;
  state.phase = "input";
  state.error = "";
  state.plan = null;
  state.result = null;
  render();
}

function render() {
  document.querySelector("#website-production-overlay")?.remove();
  if (!state.open) return;
  const overlay = document.createElement("div");
  overlay.id = "website-production-overlay";
  overlay.className = "website-production-overlay";
  overlay.innerHTML = `<section class="website-production-panel">
    <header><div><p class="eyebrow">Shopify & Website · Governed Staging</p><h2>Website Production</h2><p>Describe the outcome. Kairos will inspect the staging storefront, apply approved MMG doctrine, present the exact proposal, and execute only after your approval.</p></div><button data-wp-close aria-label="Close">×</button></header>
    ${bodyView()}
  </section>`;
  document.body.appendChild(overlay);
  bind(overlay);
}

function bodyView() {
  if (state.phase === "working" || state.phase === "executing") return progressView();
  if (state.phase === "review") return reviewView();
  if (state.phase === "complete") return completionView();
  return inputView();
}

function inputView() {
  const action = ACTIONS[state.action];
  return `<div class="wp-action-grid">${Object.entries(ACTIONS).map(([id,item])=>`<button class="wp-action-card ${id===state.action?"active":""}" data-wp-action="${id}"><strong>${escapeHTML(item.label)}</strong><span>${escapeHTML(item.description)}</span></button>`).join("")}</div>
  <label class="wp-objective-label">What should Kairos do?<textarea id="wp-objective" maxlength="12000" placeholder="${escapeHTML(action.placeholder)}">${escapeHTML(state.objective)}</textarea></label>
  <div class="wp-doctrine-summary"><strong>Automatically applied</strong><span>MMG website doctrine · actual Shopify staging inspection · verified assets and links · approval gate · source-hash binding · backup · verification · rollback</span></div>
  ${state.error?`<p class="wp-error">${escapeHTML(state.error)}</p>`:""}
  <div class="wp-actions"><button class="primary" data-wp-plan>Inspect & Prepare Proposal</button><button class="secondary" data-wp-close>Cancel</button></div>`;
}

function progressView() {
  const executing = state.phase === "executing";
  return `<div class="wp-stages"><span class="done">1 · Objective</span><span class="${executing?"done":"active"}">2 · Inspect & Compile</span><span class="${executing?"active":""}">3 · Execute</span><span>4 · Verify</span></div><p class="wp-progress"><i></i>${escapeHTML(state.message || "Kairos is working…")}</p>`;
}

function reviewView() {
  const payload = state.plan || {};
  const plan = payload.plan || {};
  const changes = Array.isArray(plan.changes) ? plan.changes.filter(item=>item?.changeType !== "no-change") : [];
  const files = changes.map(item=>item.filename).filter(Boolean);
  return `<div class="wp-review-banner"><span>Proposal ready</span><strong>${escapeHTML(ACTIONS[state.action].label)}</strong></div>
  <section class="wp-summary"><h3>${escapeHTML(payload.summary || "Website production proposal prepared")}</h3><p>${escapeHTML(plan.strategy || "Kairos inspected Shopify staging and compiled a bounded, reversible execution package.")}</p></section>
  <section class="wp-review-grid">
    <article><h4>Objective</h4><p>${escapeHTML(state.objective)}</p></article>
    <article><h4>Doctrine applied</h4><p>${escapeHTML(DOCTRINE.brand[0])} · Experience-First Journey · Native Shopify maintainability · verified claims only.</p></article>
    <article><h4>Proposed changes</h4>${changes.length?`<ul>${changes.slice(0,8).map(item=>`<li><strong>${escapeHTML(item.filename || "Shopify asset")}</strong> — ${escapeHTML(item.purpose || item.expectedOutcome || "Approved change")}</li>`).join("")}</ul>`:"<p>No executable source changes were returned. Request a revision before approval.</p>"}</article>
    <article><h4>Affected files</h4><p>${escapeHTML(files.slice(0,12).join(", ") || "Awaiting executable mutation details")}</p></article>
    <article><h4>Safeguards</h4><p>Staging only · source hashes · pre-write backup · bounded files · post-write verification · rollback evidence.</p></article>
    <article><h4>Customer benefit</h4><p>Clearer next steps, stronger ecosystem connections, fewer dead ends, better mobile usability, and visible progress.</p></article>
  </section>
  <div class="wp-actions"><button class="primary" data-wp-execute ${changes.length?"":"disabled"}>Approve & Execute on Staging</button><button class="secondary" data-wp-revise>Revise Request</button><button class="secondary" data-wp-close>Reject</button></div>`;
}

function completionView() {
  if (state.error) return `<p class="wp-error">${escapeHTML(state.error)}</p><div class="wp-actions"><button class="primary" data-wp-retry>Retry</button><button class="secondary" data-wp-close>Close</button></div>`;
  const result = state.result || {};
  const execution = result.execution || {};
  const files = Array.isArray(execution.filesWritten) ? execution.filesWritten : [];
  return `<div class="wp-review-banner success"><span>Execution verified</span><strong>Staging updated</strong></div>
  <section class="wp-summary"><h3>${escapeHTML(result.summary || "Website production completed and verified.")}</h3><p>${files.length} staging file${files.length===1?"":"s"} verified. The live published theme was not intentionally promoted by this workflow.</p></section>
  <section class="wp-review-grid"><article><h4>Files written</h4><p>${escapeHTML(files.map(item=>typeof item==="string"?item:item?.key||item?.filename).filter(Boolean).join(", ") || "Verification evidence returned by the runtime")}</p></article><article><h4>Next gate</h4><p>Open the staging preview, visually inspect mobile and desktop, then approve publication through Release Control.</p></article></section>
  <div class="wp-actions"><button class="primary" data-wp-new>Start Another Website Job</button><button class="secondary" data-wp-close>Close</button></div>`;
}

function bind(overlay) {
  overlay.querySelectorAll("[data-wp-close]").forEach(button=>button.onclick=()=>{state.open=false;render();});
  overlay.querySelectorAll("[data-wp-action]").forEach(button=>button.onclick=()=>{state.action=button.dataset.wpAction;state.error="";render();});
  overlay.querySelector("[data-wp-plan]")?.addEventListener("click", preparePlan);
  overlay.querySelector("[data-wp-execute]")?.addEventListener("click", executePlan);
  overlay.querySelector("[data-wp-revise]")?.addEventListener("click",()=>{state.phase="input";state.plan=null;render();});
  overlay.querySelector("[data-wp-retry]")?.addEventListener("click",preparePlan);
  overlay.querySelector("[data-wp-new]")?.addEventListener("click",()=>{state.phase="input";state.objective="";state.plan=null;state.result=null;state.error="";render();});
}

async function preparePlan() {
  state.objective = document.querySelector("#wp-objective")?.value.trim() || state.objective;
  if (state.objective.length < 5) { state.error = "Describe the website outcome before Kairos begins."; render(); return; }
  state.phase = "working";
  state.message = "Inspecting Shopify staging, retrieving MMG doctrine, mapping the customer journey, and compiling an approval-ready execution package.";
  state.error = "";
  render();
  try {
    const compiledObjective = compileObjective();
    const submitted = await submitJob(PLAN_URL, { objective: compiledObjective, requestType: ACTIONS[state.action].pageType, clientBuild: BUILD });
    state.plan = await pollJob(submitted, "planning");
    state.phase = "review";
  } catch (error) {
    state.error = error?.message || "Kairos could not prepare the website proposal.";
    state.phase = "complete";
  }
  render();
}

function compileObjective() {
  return [
    `WEBSITE PRODUCTION ACTION: ${ACTIONS[state.action].label}`,
    `PAGE TYPE: ${ACTIONS[state.action].pageType}`,
    `EXECUTIVE OBJECTIVE: ${state.objective}`,
    "",
    "AUTOMATIC MMG DOCTRINE:",
    ...DOCTRINE.brand.map(item=>`- ${item}`),
    `- Experience-First Journey: ${DOCTRINE.journey.join(" → ")}`,
    `- Interconnect verified destinations: ${DOCTRINE.destinations.join("; ")}`,
    ...DOCTRINE.design.map(item=>`- ${item}`),
    "",
    `APPROVED COMPONENT LIBRARY: ${COMPONENTS.join("; ")}`,
    "",
    "EXECUTION REQUIREMENTS:",
    ...DOCTRINE.execution.map(item=>`- ${item}`),
    "- inspect current mobile and desktop structure, navigation, CTAs, links, SEO, and unsupported capability claims",
    "- return an executive proposal with exact files, changes, benefits, risks, verification criteria, and rollback plan",
    "- compile executable full-file replacements only when grounded in current Shopify source",
    "",
    "KAIROS GUIDANCE REQUIREMENTS:",
    ...DOCTRINE.guidance.map(item=>`- ${item}`),
    "",
    "Do not stop at a conceptual plan. Produce the bounded source-grounded staging mutation package required by the existing approval and execution engine."
  ].join("\n");
}

async function executePlan() {
  if (!state.plan) return;
  const plan = state.plan;
  const approval = {
    status: "approved",
    approvedAt: new Date().toISOString(),
    actor: "Executive",
    clientBuild: BUILD,
    planID: plan.planID,
    actionID: plan.actionID,
    targetThemeID: plan?.plan?.targetTheme?.gid || "",
    sourceHashes: plan?.plan?.sourceHashes || {},
    objective: plan.objective || state.objective,
    requestType: ACTIONS[state.action].pageType
  };
  state.phase = "executing";
  state.message = "Applying the approved staging mutation, verifying every written file, and preserving rollback evidence.";
  render();
  try {
    const submitted = await submitJob(EXECUTE_URL, { plan, approval });
    state.result = await pollJob(submitted, "execution");
    state.phase = "complete";
  } catch (error) {
    state.error = error?.message || "The approved website job did not complete.";
    state.phase = "complete";
  }
  render();
}

async function submitJob(url,payload) {
  const {response,body} = await fetchJSON(url,{method:"POST",headers:{"Content-Type":"application/json","X-MMG-Client-Build":BUILD},credentials:"include",body:JSON.stringify(payload)});
  if (!response.ok || !body?.jobID) throw new Error(body?.error?.message || body?.summary || `Kairos returned ${response.status}.`);
  return body;
}

async function pollJob(submitted,type) {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve=>setTimeout(resolve,1000));
    const {response,body} = await fetchJSON(submitted.pollURL || `/api/shopify/staging/${type}/jobs/${submitted.jobID}`,{credentials:"include"});
    if (body?.status === "completed" && body?.result) return body.result;
    if (["needs-attention","failed","cancelled"].includes(body?.status) || (!response.ok && response.status !== 202)) throw new Error(body?.error?.message || body?.summary || `${type} did not complete.`);
    state.message = body?.summary || state.message;
    render();
  }
  throw new Error("Kairos is still working, but this browser session reached its monitoring limit.");
}

async function fetchJSON(url,init={}) {
  const response = await fetch(url,{cache:"no-store",...init});
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {summary:text}; }
  return {response,body};
}

function escapeHTML(value) { return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]); }

mount();
