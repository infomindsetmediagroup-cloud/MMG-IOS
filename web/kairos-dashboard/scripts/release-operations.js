const BUILD = "kairos-release-dashboard-20260726-1";
const state = { loading: false, releases: [], selectedId: "", error: "" };

const observer = new MutationObserver(mount);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("load", mount, { once: true });

function mount() {
  const hub = document.querySelector("#kairos-hub");
  if (!hub || document.querySelector("#kairos-release-operations")) return;
  const section = document.createElement("section");
  section.id = "kairos-release-operations";
  section.className = "kairos-releases";
  section.setAttribute("aria-labelledby", "kairos-releases-title");
  hub.appendChild(section);
  bind(section);
  refresh();
}

function bind(section = document.querySelector("#kairos-release-operations")) {
  if (!section) return;
  section.innerHTML = shell();
  section.querySelector("[data-releases-refresh]")?.addEventListener("click", refresh);
  section.querySelector("[data-releases-export]")?.addEventListener("click", exportRecoveryPackage);
  section.querySelectorAll("[data-release-select]").forEach((button) => button.addEventListener("click", () => { state.selectedId = button.dataset.releaseSelect || ""; render(); }));
  section.querySelectorAll("[data-release-evaluate]").forEach((button) => button.addEventListener("click", () => evaluate(button.dataset.releaseId)));
}

async function refresh() {
  if (state.loading) return;
  state.loading = true; state.error = ""; render();
  try {
    const response = await fetch("/api/kairos/operations/releases", requestOptions("GET"));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Releases returned ${response.status}.`);
    state.releases = Array.isArray(payload.releases) ? payload.releases : [];
    if (!state.selectedId && state.releases[0]) state.selectedId = state.releases[0].releaseId;
  } catch (error) { state.error = error?.message || "Release operations are unavailable."; }
  finally { state.loading = false; render(); }
}

async function evaluate(releaseId) {
  const release = state.releases.find((item) => item.releaseId === releaseId);
  if (!release || state.loading) return;
  const verification = {};
  for (const gate of ["runtime", "health", "contracts", "experience"]) {
    const value = window.prompt(`${gate} verification: passed, failed, pending, or not_applicable`, release.verification?.[gate] || "pending");
    if (value === null) return;
    verification[gate] = value;
  }
  const reasonCode = window.prompt("Recovery reason code (optional):", release.recoveryPlan?.reasonCode || "") || "";
  state.loading = true; state.error = ""; render();
  try {
    const response = await fetch(`/api/kairos/operations/releases/${encodeURIComponent(releaseId)}`, requestOptions("PATCH", { verification, reasonCode }));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Release evaluation returned ${response.status}.`);
    state.releases = state.releases.map((item) => item.releaseId === releaseId ? payload.release : item);
  } catch (error) { state.error = error?.message || "Release evaluation failed."; }
  finally { state.loading = false; render(); }
}

async function exportRecoveryPackage() {
  if (state.loading) return;
  state.loading = true; state.error = ""; render();
  try {
    const response = await fetch("/api/kairos/operations/releases/export", requestOptions("GET"));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Recovery export returned ${response.status}.`);
    const packagePayload = { ...payload, runbook: recoveryRunbook() };
    const blob = new Blob([JSON.stringify(packagePayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `kairos-release-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  } catch (error) { state.error = error?.message || "Recovery export failed."; }
  finally { state.loading = false; render(); }
}

function render() { bind(); }
function shell() {
  const selected = state.releases.find((item) => item.releaseId === state.selectedId) || state.releases[0];
  return `<div class="kairos-releases__header"><div><p class="kairos-releases__eyebrow">Production operations</p><h2 id="kairos-releases-title">Release recovery</h2><p>Verification evidence, recovery recommendations, and operator-safe decision support.</p></div><div class="kairos-releases__actions"><button type="button" data-releases-refresh ${state.loading ? "disabled" : ""}>Refresh</button><button type="button" data-releases-export ${state.loading ? "disabled" : ""}>Export recovery package</button></div></div>
  ${state.error ? `<p class="kairos-releases__error" role="alert">${escapeHTML(state.error)}</p>` : ""}
  <div class="kairos-releases__layout"><div class="kairos-releases__list">${releaseList()}</div><div class="kairos-releases__detail">${selected ? releaseDetail(selected) : "<p>No release records.</p>"}</div></div>`;
}

function releaseList() {
  if (!state.releases.length) return "<p>No release records.</p>";
  return state.releases.slice(0, 100).map((item) => `<button type="button" class="kairos-releases__row${item.releaseId === state.selectedId ? " is-active" : ""}" data-release-select="${escapeHTML(item.releaseId)}"><span><strong>${escapeHTML(item.releaseId)}</strong><small>${escapeHTML(item.environment || "unknown")} · ${escapeHTML(item.commitSha || "no commit")}</small></span><em data-status="${escapeHTML(item.status)}">${escapeHTML(item.status)}</em></button>`).join("");
}

function releaseDetail(item) {
  return `<article><div class="kairos-releases__title"><div><p>${escapeHTML(item.environment)} · ${escapeHTML(item.status)}</p><h3>${escapeHTML(item.releaseId)}</h3></div><code>${escapeHTML(item.deploymentId || "No deployment ID")}</code></div>
  <dl><div><dt>Commit</dt><dd>${escapeHTML(item.commitSha || "None")}</dd></div><div><dt>Operator</dt><dd>${escapeHTML(item.operatorIdentityHash || "Unassigned")}</dd></div><div><dt>Incident</dt><dd>${escapeHTML(item.recoveryPlan?.incidentId || "None")}</dd></div><div><dt>Recovery</dt><dd>${escapeHTML(item.recoveryPlan?.action || "observe")}</dd></div><div><dt>Reason</dt><dd>${escapeHTML(item.recoveryPlan?.reasonCode || "None")}</dd></div><div><dt>Approval required</dt><dd>${item.recoveryPlan?.requiresNewApproval ? "Yes" : "No"}</dd></div></dl>
  <h4>Verification gates</h4><div class="kairos-releases__gates">${Object.entries(item.verification || {}).map(([name, value]) => `<p><span>${escapeHTML(label(name))}</span><strong data-result="${escapeHTML(value)}">${escapeHTML(value)}</strong></p>`).join("")}</div>
  <button type="button" data-release-evaluate data-release-id="${escapeHTML(item.releaseId)}" ${state.loading ? "disabled" : ""}>Record verification evidence</button>
  <h4>Recovery runbook</h4><ol class="kairos-releases__runbook">${recoveryRunbook().steps.map((step) => `<li><strong>${escapeHTML(step.title)}</strong><span>${escapeHTML(step.instruction)}</span></li>`).join("")}</ol>
  <p class="kairos-releases__guardrail">This dashboard cannot deploy, roll back, retry, unpublish, or execute commerce mutations.</p></article>`;
}

function recoveryRunbook() {
  return {
    version: "kairos-recovery-runbook-v1",
    executionAuthorityIncluded: false,
    steps: [
      { title: "Confirm scope", instruction: "Verify release, deployment, environment, commit, incident, and evidence identifiers." },
      { title: "Assess gates", instruction: "Review runtime, health, contract, and live-experience verification results." },
      { title: "Contain impact", instruction: "Hold further changes and open or correlate an incident when degradation is confirmed." },
      { title: "Prepare recovery", instruction: "Document the recommended recovery action and obtain a new governed approval before any rollback." },
      { title: "Verify outcome", instruction: "After an separately approved recovery action, rerun all verification gates and record evidence." },
      { title: "Close safely", instruction: "Close only after verification passes and linked incidents have an explicit resolution code." },
    ],
  };
}

function requestOptions(method, body) { return { method, cache: "no-store", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, ...(body ? { body: JSON.stringify(body) } : {}) }; }
function label(value) { return String(value || "").replace(/^./, (char) => char.toUpperCase()); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
