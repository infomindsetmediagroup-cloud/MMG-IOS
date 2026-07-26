const API = "/api/kairos/operations";
const state = { certifications: [], selected: null, evidence: null };

function h(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function request(path, options = {}) {
  return fetch(`${API}${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `Request failed (${response.status})`);
    return body;
  });
}

function statusLabel(value) {
  return String(value || "pending").replaceAll("_", " ");
}

function gateCard(name, value) {
  return `<article class="readiness-gate readiness-gate--${h(value)}"><span>${h(name)}</span><strong>${h(statusLabel(value))}</strong></article>`;
}

function render() {
  let root = document.querySelector("#kairos-readiness-certification");
  if (!root) {
    root = document.createElement("section");
    root.id = "kairos-readiness-certification";
    root.className = "readiness-shell";
    root.setAttribute("aria-labelledby", "readiness-title");
    document.querySelector("#kairos-hub")?.appendChild(root);
  }
  const selected = state.selected;
  root.innerHTML = `
    <header class="readiness-header">
      <div><p class="readiness-kicker">Production governance</p><h2 id="readiness-title">Readiness Certification</h2><p>Evidence-backed go/no-go decision support. Certification never grants launch or deployment authority.</p></div>
      <div class="readiness-actions"><button data-action="refresh">Refresh</button><button data-action="aggregate" ${selected ? "" : "disabled"}>Aggregate evidence</button><button data-action="export">Export</button></div>
    </header>
    <div class="readiness-grid">
      <aside class="readiness-list" aria-label="Certifications">
        ${state.certifications.length ? state.certifications.map((item) => `<button class="readiness-list-item ${selected?.certificationId === item.certificationId ? "is-active" : ""}" data-certification="${h(item.certificationId)}"><strong>${h(item.certificationId)}</strong><span>${h(item.environment)} · ${h(statusLabel(item.recommendation))}</span></button>`).join("") : `<p class="readiness-empty">No readiness certifications have been created.</p>`}
      </aside>
      <main class="readiness-detail">
        ${selected ? detail(selected) : `<div class="readiness-empty">Select a certification to review its evidence, gates, blockers, and sign-off.</div>`}
      </main>
    </div>`;
  bind(root);
}

function detail(item) {
  const gates = item.gates || {};
  const blockers = item.blockers || [];
  const evidence = state.evidence;
  return `
    <section class="readiness-summary readiness-summary--${h(item.recommendation)}">
      <div><span>Recommendation</span><strong>${h(statusLabel(item.recommendation))}</strong></div>
      <div><span>Sign-off</span><strong>${h(statusLabel(item.signoff?.status))}</strong></div>
      <div><span>Release</span><strong>${h(item.releaseId || "Not linked")}</strong></div>
      <div><span>Commit</span><strong>${h(item.commitSha || "Not linked")}</strong></div>
    </section>
    <section class="readiness-gates">
      ${gateCard("Runtime", gates.runtime)}${gateCard("Health", gates.health)}${gateCard("Contracts", gates.contracts)}${gateCard("Experience", gates.experience)}${gateCard("Incident response", gates.incidentResponse)}${gateCard("Release recovery", gates.releaseRecovery)}
    </section>
    <section class="readiness-panel"><h3>Evidence aggregation</h3>${evidence ? `<p>Health: <strong>${h(evidence.healthStatus)}</strong> · Failures: <strong>${h(evidence.failureCount)}</strong> · Verification failures: <strong>${h(evidence.verificationFailureCount)}</strong> · Open incidents: <strong>${h(evidence.openIncidentCount)}</strong></p><p>Derived evidence is proposed only. Save requires an explicit operator action.</p>` : `<p>Run bounded aggregation to read the current health, metrics, incident, and release surfaces.</p>`}<button data-action="save-evidence" ${evidence ? "" : "disabled"}>Save proposed gates and blockers</button></section>
    <section class="readiness-panel"><h3>Blockers</h3>${blockers.length ? `<ul>${blockers.map((blocker) => `<li><strong>${h(blocker.code)}</strong> — ${h(blocker.summary)} <span>${h(blocker.severity)} / ${h(blocker.status)}</span></li>`).join("")}</ul>` : `<p>No blockers recorded.</p>`}</section>
    <section class="readiness-panel"><h3>Operator sign-off</h3><label>Status<select id="readiness-signoff-status"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label><label>Note<textarea id="readiness-signoff-note" maxlength="1000" placeholder="Record the rationale for this decision."></textarea></label><button data-action="signoff">Record sign-off</button><p class="readiness-warning">Sign-off records a decision only. Launch, deployment, rollback, retry, unpublish, commerce mutation, and tool continuation are unavailable here.</p></section>`;
}

async function refresh() {
  const body = await request("/readiness-certifications");
  state.certifications = body.certifications || [];
  if (state.selected) state.selected = state.certifications.find((item) => item.certificationId === state.selected.certificationId) || null;
  if (!state.selected && state.certifications.length) state.selected = state.certifications[0];
  state.evidence = null;
  render();
}

async function aggregate() {
  if (!state.selected) return;
  const [health, metrics, incidents, releases] = await Promise.all([
    request("/health"), request("/metrics"), request("/incidents"), request("/releases"),
  ]);
  const healthStatus = health?.status || health?.overallStatus || "unknown";
  const failureCount = Number(metrics?.failures ?? metrics?.failureCount ?? 0);
  const verificationFailureCount = Number(metrics?.verificationFailures ?? metrics?.verificationFailureCount ?? 0);
  const incidentRows = incidents?.incidents || [];
  const openIncidents = incidentRows.filter((item) => !["resolved", "closed"].includes(item.status));
  const linkedRelease = (releases?.releases || []).find((item) => item.releaseId === state.selected.releaseId);
  const releaseReady = linkedRelease && ["ready", "released", "closed"].includes(linkedRelease.status);
  const healthy = ["healthy", "ok", "ready", "operational"].includes(String(healthStatus).toLowerCase());
  const blockers = [];
  if (!healthy) blockers.push({ code: "DEPENDENCY_HEALTH_NOT_READY", summary: "Operational dependency health is not fully ready.", severity: "critical", status: "open" });
  if (verificationFailureCount > 0) blockers.push({ code: "VERIFICATION_FAILURES_PRESENT", summary: `${verificationFailureCount} verification failure(s) are present in retained telemetry.`, severity: "critical", status: "open" });
  if (openIncidents.length) blockers.push({ code: "OPEN_INCIDENTS_PRESENT", summary: `${openIncidents.length} incident(s) remain open or unresolved.`, severity: "warning", status: "open" });
  state.evidence = {
    healthStatus, failureCount, verificationFailureCount, openIncidentCount: openIncidents.length,
    gates: { runtime: healthy ? "passed" : "failed", health: healthy ? "passed" : "failed", contracts: verificationFailureCount === 0 ? "passed" : "failed", experience: verificationFailureCount === 0 ? "passed" : "failed", incidentResponse: openIncidents.length === 0 ? "passed" : "pending", releaseRecovery: releaseReady ? "passed" : "pending" },
    blockers,
    evidenceIds: [`health:${healthStatus}`, `metrics:failures:${failureCount}`, `metrics:verification:${verificationFailureCount}`, ...(linkedRelease ? [`release:${linkedRelease.releaseId}:${linkedRelease.status}`] : [])].slice(0, 100),
    incidentIds: openIncidents.map((item) => item.incidentId).filter(Boolean).slice(0, 50),
  };
  render();
}

async function saveEvidence() {
  if (!state.selected || !state.evidence) return;
  const body = await request(`/readiness-certifications/${encodeURIComponent(state.selected.certificationId)}`, { method: "PATCH", body: JSON.stringify({ gates: state.evidence.gates, blockers: state.evidence.blockers, evidenceIds: state.evidence.evidenceIds, incidentIds: state.evidence.incidentIds }) });
  state.selected = body.certification;
  await refresh();
}

async function signoff() {
  if (!state.selected) return;
  const status = document.querySelector("#readiness-signoff-status")?.value || "pending";
  const note = document.querySelector("#readiness-signoff-note")?.value || "";
  const body = await request(`/readiness-certifications/${encodeURIComponent(state.selected.certificationId)}`, { method: "PATCH", body: JSON.stringify({ signoff: { status, note, signedAt: new Date().toISOString() } }) });
  state.selected = body.certification;
  await refresh();
}

async function exportCertifications() {
  const body = await request("/readiness-certifications/export");
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kairos-readiness-certifications-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function bind(root) {
  root.querySelectorAll("[data-certification]").forEach((button) => button.addEventListener("click", () => { state.selected = state.certifications.find((item) => item.certificationId === button.dataset.certification) || null; state.evidence = null; render(); }));
  root.querySelector('[data-action="refresh"]')?.addEventListener("click", () => refresh().catch(showError));
  root.querySelector('[data-action="aggregate"]')?.addEventListener("click", () => aggregate().catch(showError));
  root.querySelector('[data-action="save-evidence"]')?.addEventListener("click", () => saveEvidence().catch(showError));
  root.querySelector('[data-action="signoff"]')?.addEventListener("click", () => signoff().catch(showError));
  root.querySelector('[data-action="export"]')?.addEventListener("click", () => exportCertifications().catch(showError));
}

function showError(error) {
  const root = document.querySelector("#kairos-readiness-certification");
  if (root) root.insertAdjacentHTML("afterbegin", `<p class="readiness-error" role="alert">${h(error.message)}</p>`);
}

window.addEventListener("DOMContentLoaded", () => refresh().catch(showError));
