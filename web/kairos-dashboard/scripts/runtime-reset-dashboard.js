const BUILD = "kairos-runtime-reset-20260711-2";

const centers = [
  {
    id: "executive",
    eyebrow: "Executive Operations",
    title: "Direction, approvals, and operating priorities",
    description: "The executive layer will coordinate priorities, approvals, evidence, and controlled execution across the MMG ecosystem.",
    status: "Foundation Available",
    tone: "available",
    abilities: [
      { title: "Operating priorities", state: "Planned", detail: "Priority orchestration will return after the evidence model is rebuilt." },
      { title: "Executive approvals", state: "Foundation", detail: "Approval doctrine is preserved; external execution remains disabled." },
      { title: "Decision record", state: "Planned", detail: "Approved decisions will be written into durable knowledge records." },
    ],
  },
  {
    id: "shopify",
    eyebrow: "Shopify & Website",
    title: "Storefront, theme, products, and publishing",
    description: "This center is being rebuilt one verified vertical at a time. Public storefront inspection is the first operational capability.",
    status: "1 Capability Active",
    tone: "limited",
    abilities: [
      { title: "Inspect live storefront", state: "Operational", detail: "Read-only inspection of the public homepage and sitemap.", action: "inspect-storefront" },
      { title: "Staging-theme workflow", state: "Next Build", detail: "Create, mutate, verify, preview, and roll back a non-live theme." },
      { title: "Theme publishing", state: "Disabled", detail: "Production publishing remains locked until staging acceptance passes." },
      { title: "Product publishing", state: "Not Implemented", detail: "Product creation and publication will be a separate tested vertical." },
      { title: "Collections and navigation", state: "Not Implemented", detail: "No publication adapter is active yet." },
    ],
  },
  {
    id: "production",
    eyebrow: "Products & Production",
    title: "Asset production, delivery, and customer work",
    description: "The production center will route approved work through creation, review, delivery, and preservation without bypassing governance.",
    status: "Architecture Preserved",
    tone: "blocked",
    abilities: [
      { title: "Production pipeline", state: "Planned", detail: "Intake, production, verification, delivery, and preservation stages." },
      { title: "Design Studio", state: "Planned", detail: "Production-only creative workspace remains part of the approved blueprint." },
      { title: "Customer delivery", state: "Not Implemented", detail: "No tested delivery adapter exists in the reset runtime." },
    ],
  },
  {
    id: "knowledge",
    eyebrow: "Knowledge",
    title: "Institutional memory and compounding value",
    description: "This center will preserve evidence, decisions, assets, project history, and reusable MMG knowledge as durable operating capital.",
    status: "Architecture Preserved",
    tone: "blocked",
    abilities: [
      { title: "Knowledge Library", state: "Planned", detail: "Canonical knowledge storage remains part of the approved ecosystem." },
      { title: "Execution evidence", state: "Foundation", detail: "New capabilities must produce structured evidence before promotion." },
      { title: "Doctrine retrieval", state: "Planned", detail: "Kairos will consult authoritative MMG doctrine before execution." },
    ],
  },
  {
    id: "system",
    eyebrow: "System & Release",
    title: "Runtime health, releases, and capability truth",
    description: "The system center reports what is actually deployed, what is tested, and what remains disabled.",
    status: "Operational",
    tone: "available",
    abilities: [
      { title: "Runtime health", state: "Operational", detail: "Cloudflare health and capability status are available." },
      { title: "Capability registry", state: "Operational", detail: "The live shell reports truthful implementation states." },
      { title: "Release evidence", state: "Next Build", detail: "Deployment and acceptance evidence will be attached to each promoted capability." },
    ],
  },
];

const root = document.querySelector("#reset-dashboard");

root.innerHTML = `
  <section class="reset-hero">
    <p class="eyebrow">Kairos Command Center</p>
    <h1>Clean rebuild. One verified capability at a time.</h1>
    <p class="lead">The canonical Kairos shell is frozen. Parent operating centers are restored below, but only tested capabilities are interactive. Every new ability must complete the full evidence, approval, execution, verification, and recovery pipeline before it is marked operational.</p>
    <div class="reset-badge">${BUILD}</div>
  </section>

  <section class="reset-panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Parent Operating Centers</p>
        <h2>MMG operational architecture</h2>
      </div>
      <span class="status-pill recovery">Controlled Rebuild</span>
    </div>
    <div class="parent-grid">
      ${centers.map(renderCenter).join("")}
    </div>
  </section>

  <section id="execution-panel" class="reset-panel execution-panel" hidden>
    <div class="section-heading">
      <div>
        <p class="eyebrow">Live Capability Evidence</p>
        <h2 id="execution-title">Execution result</h2>
      </div>
      <span id="execution-status" class="status-pill limited">Working</span>
    </div>
    <div id="execution-result" class="execution-result" aria-live="polite"></div>
  </section>

  <section class="reset-panel doctrine-panel">
    <p class="eyebrow">Execution Standard</p>
    <h2>No capability is operational without proof</h2>
    <p>Each vertical must pass source validation, bounded execution, read-back verification, rollback preparation, explicit approval controls where required, and recorded evidence. The shell remains stable while capabilities are plugged into it individually.</p>
  </section>
`;

root.addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  if (button.dataset.action === "inspect-storefront") await inspectStorefront(button);
});

async function inspectStorefront(button) {
  const panel = document.querySelector("#execution-panel");
  const title = document.querySelector("#execution-title");
  const status = document.querySelector("#execution-status");
  const result = document.querySelector("#execution-result");

  panel.hidden = false;
  title.textContent = "Inspect live storefront";
  status.textContent = "Working";
  status.className = "status-pill limited";
  result.innerHTML = '<p class="lead compact">Reading the public homepage and sitemap. No Shopify mutation authority is used.</p>';
  button.disabled = true;
  button.textContent = "Inspecting…";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const response = await fetch("/api/storefront/inspect", {
      method: "POST",
      headers: { Accept: "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
    });
    const body = await readJSON(response);
    if (!response.ok) throw new Error(body?.error?.message || body?.summary || `Inspection returned HTTP ${response.status}.`);

    status.textContent = "Completed";
    status.className = "status-pill available";
    const homepage = body?.evidence?.homepage || {};
    const sitemap = body?.evidence?.sitemap || {};
    result.innerHTML = `
      <div class="evidence-summary">
        <strong>${escapeHTML(body.summary || "Storefront inspection completed.")}</strong>
        <span>Read-only · ${escapeHTML(body.completedAt || "")}</span>
      </div>
      <div class="evidence-grid">
        ${renderEvidence("Homepage", homepage)}
        ${renderEvidence("Sitemap", sitemap)}
      </div>
      <details class="evidence-details">
        <summary>View execution evidence</summary>
        <pre>${escapeHTML(JSON.stringify(body, null, 2))}</pre>
      </details>
    `;
  } catch (error) {
    status.textContent = "Needs Attention";
    status.className = "status-pill blocked";
    result.innerHTML = `<p class="execution-error">${escapeHTML(error instanceof Error ? error.message : "Storefront inspection failed.")}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = "Inspect Live Storefront";
  }
}

function renderCenter(center) {
  return `
    <article class="parent-card ${center.tone}">
      <div class="parent-card-header">
        <div>
          <p class="eyebrow">${escapeHTML(center.eyebrow)}</p>
          <h3>${escapeHTML(center.title)}</h3>
        </div>
        <span class="status-pill ${center.tone}">${escapeHTML(center.status)}</span>
      </div>
      <p class="parent-description">${escapeHTML(center.description)}</p>
      <div class="ability-list">
        ${center.abilities.map(ability => `
          <section class="ability-row">
            <div>
              <strong>${escapeHTML(ability.title)}</strong>
              <p>${escapeHTML(ability.detail)}</p>
            </div>
            ${ability.action
              ? `<button class="capability-action" type="button" data-action="${escapeHTML(ability.action)}">Inspect Live Storefront</button>`
              : `<span class="ability-state">${escapeHTML(ability.state)}</span>`}
          </section>
        `).join("")}
      </div>
    </article>
  `;
}

function renderEvidence(label, evidence) {
  return `
    <article class="evidence-card">
      <span>${escapeHTML(label)}</span>
      <strong>HTTP ${escapeHTML(evidence.status ?? "—")}</strong>
      <p>${escapeHTML(evidence.title || evidence.finalUrl || evidence.requestedUrl || "No title returned.")}</p>
      <small>${escapeHTML(evidence.contentType || "Unknown content type")} · ${escapeHTML(evidence.bytes ?? 0)} bytes</small>
    </article>
  `;
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { summary: text }; }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}
