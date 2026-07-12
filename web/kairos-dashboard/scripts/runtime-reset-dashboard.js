const BUILD = "kairos-runtime-reset-20260711-1";

const capabilities = [
  {
    name: "Command Center shell",
    status: "Available",
    tone: "available",
    evidence: "Static production shell served by Cloudflare Workers.",
  },
  {
    name: "Operator session",
    status: "Available",
    tone: "available",
    evidence: "Existing secure session route preserved; no external mutation authority is implied.",
  },
  {
    name: "Kairos advisory intelligence",
    status: "Available",
    tone: "available",
    evidence: "Internal advisory and planning responses may be used, but they are not execution evidence.",
  },
  {
    name: "Storefront inspection",
    status: "Validation Required",
    tone: "limited",
    evidence: "Read-only capability must be retested against the live storefront before being marked operational.",
  },
  {
    name: "Shopify theme planning",
    status: "Not Operational",
    tone: "blocked",
    evidence: "Disabled after repeated source, parser, credential, proposal-persistence, and execution-path failures.",
  },
  {
    name: "Shopify theme mutation",
    status: "Not Operational",
    tone: "blocked",
    evidence: "Production writes are disabled until the staging-theme workflow passes full acceptance testing.",
  },
  {
    name: "Product publishing",
    status: "Not Implemented",
    tone: "blocked",
    evidence: "No tested end-to-end product creation and publication adapter exists yet.",
  },
  {
    name: "Collections and navigation",
    status: "Not Implemented",
    tone: "blocked",
    evidence: "No tested publication adapter exists yet.",
  },
];

const acceptance = [
  "Authenticate to Shopify with a single documented credential path.",
  "Create or select a non-live staging theme.",
  "Read the target file and record its exact source hash.",
  "Apply one bounded change to the staging theme only.",
  "Read the file back and verify the resulting hash.",
  "Produce a human-readable preview and exact rollback package.",
  "Require explicit executive approval before publishing.",
  "Publish only after staging verification succeeds.",
  "Verify the live storefront after publishing.",
  "Automatically roll back when live verification fails.",
];

const root = document.querySelector("#reset-dashboard");

root.innerHTML = `
  <section class="reset-hero">
    <p class="eyebrow">Formal Runtime Reset</p>
    <h1>Kairos is in recovery mode.</h1>
    <p class="lead">The prototype execution path has been archived. The live runtime now reports only capabilities that are actually available, tested, or explicitly disabled.</p>
    <div class="reset-badge">${BUILD}</div>
  </section>

  <section class="reset-panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Capability Registry</p>
        <h2>Current operational truth</h2>
      </div>
      <span class="status-pill recovery">Recovery Mode</span>
    </div>
    <div class="capability-grid">
      ${capabilities.map(capability => `
        <article class="capability-card ${capability.tone}">
          <div class="capability-header">
            <h3>${escapeHTML(capability.name)}</h3>
            <span class="status-pill ${capability.tone}">${escapeHTML(capability.status)}</span>
          </div>
          <p>${escapeHTML(capability.evidence)}</p>
        </article>
      `).join("")}
    </div>
  </section>

  <section class="reset-panel">
    <p class="eyebrow">First Real Execution Vertical</p>
    <h2>Shopify staging-theme workflow</h2>
    <p class="lead compact">This is the only external execution capability authorized for implementation next. Production theme mutation remains disabled until every acceptance criterion below passes with recorded evidence.</p>
    <ol class="acceptance-list">
      ${acceptance.map(item => `<li>${escapeHTML(item)}</li>`).join("")}
    </ol>
  </section>

  <section class="reset-panel doctrine-panel">
    <p class="eyebrow">Preserved</p>
    <h2>MMG/Kairos doctrine and architecture</h2>
    <p>The reset removes false operational claims, not the approved MMG/Kairos vision, governance, product doctrine, knowledge stewardship principles, experience-first architecture, or long-term execution roadmap.</p>
  </section>
`;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}
