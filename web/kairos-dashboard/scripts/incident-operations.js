const BUILD = "kairos-incident-dashboard-20260726-1";
const state = { loading: false, incidents: [], error: "", selectedId: "" };

const observer = new MutationObserver(mount);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("load", mount, { once: true });

function mount() {
  const hub = document.querySelector("#kairos-hub");
  if (!hub || document.querySelector("#kairos-incident-operations")) return;
  const section = document.createElement("section");
  section.id = "kairos-incident-operations";
  section.className = "kairos-incidents";
  section.setAttribute("aria-labelledby", "kairos-incidents-title");
  hub.appendChild(section);
  bind(section);
  refresh();
}

function bind(section = document.querySelector("#kairos-incident-operations")) {
  if (!section) return;
  section.innerHTML = shell();
  section.querySelector("[data-incidents-refresh]")?.addEventListener("click", refresh);
  section.querySelector("[data-incidents-export]")?.addEventListener("click", exportIncidents);
  section.querySelectorAll("[data-incident-select]").forEach((button) => button.addEventListener("click", () => { state.selectedId = button.dataset.incidentSelect || ""; render(); }));
  section.querySelectorAll("[data-incident-status]").forEach((button) => button.addEventListener("click", () => transition(button.dataset.incidentId, button.dataset.incidentStatus)));
}

async function refresh() {
  if (state.loading) return;
  state.loading = true; state.error = ""; render();
  try {
    const response = await fetch("/api/kairos/operations/incidents", requestOptions("GET"));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Incidents returned ${response.status}.`);
    state.incidents = Array.isArray(payload.incidents) ? payload.incidents : [];
    if (!state.selectedId && state.incidents[0]) state.selectedId = state.incidents[0].incidentId;
  } catch (error) { state.error = error?.message || "Incident operations are unavailable."; }
  finally { state.loading = false; render(); }
}

async function transition(incidentId, status) {
  const incident = state.incidents.find((item) => item.incidentId === incidentId);
  if (!incident || state.loading) return;
  const resolutionRequired = status === "resolved" || status === "closed";
  const resolutionCode = resolutionRequired ? window.prompt("Resolution code (required):", incident.resolutionCode || "") : "";
  if (resolutionRequired && !String(resolutionCode || "").trim()) return;
  const note = window.prompt("Operator note (optional):", "") || "";
  state.loading = true; state.error = ""; render();
  try {
    const response = await fetch(`/api/kairos/operations/incidents/${encodeURIComponent(incidentId)}`, requestOptions("PATCH", { status, resolutionCode, note }));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Incident transition returned ${response.status}.`);
    state.incidents = state.incidents.map((item) => item.incidentId === incidentId ? payload.incident : item);
  } catch (error) { state.error = error?.message || "Incident transition failed."; }
  finally { state.loading = false; render(); }
}

async function exportIncidents() {
  if (state.loading) return;
  state.loading = true; state.error = ""; render();
  try {
    const response = await fetch("/api/kairos/operations/incidents/export", requestOptions("GET"));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Incident export returned ${response.status}.`);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `kairos-incidents-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  } catch (error) { state.error = error?.message || "Incident export failed."; }
  finally { state.loading = false; render(); }
}

function render() { bind(); }
function shell() {
  const selected = state.incidents.find((item) => item.incidentId === state.selectedId) || state.incidents[0];
  return `<div class="kairos-incidents__header"><div><p class="kairos-incidents__eyebrow">Production operations</p><h2 id="kairos-incidents-title">Incident command</h2><p>Authenticated incident ownership, lifecycle, timeline, and bounded export.</p></div><div class="kairos-incidents__actions"><button type="button" data-incidents-refresh ${state.loading ? "disabled" : ""}>Refresh</button><button type="button" data-incidents-export ${state.loading ? "disabled" : ""}>Export JSON</button></div></div>
  ${state.error ? `<p class="kairos-incidents__error" role="alert">${escapeHTML(state.error)}</p>` : ""}
  <div class="kairos-incidents__layout"><div class="kairos-incidents__list">${incidentList()}</div><div class="kairos-incidents__detail">${selected ? incidentDetail(selected) : "<p>No incidents recorded.</p>"}</div></div>`;
}

function incidentList() {
  if (!state.incidents.length) return "<p>No incidents recorded.</p>";
  return state.incidents.slice(0, 100).map((item) => `<button type="button" class="kairos-incidents__row${item.incidentId === state.selectedId ? " is-active" : ""}" data-incident-select="${escapeHTML(item.incidentId)}"><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.incidentId)}</small></span><em data-severity="${escapeHTML(item.severity)}">${escapeHTML(item.status)}</em></button>`).join("");
}

function incidentDetail(item) {
  return `<article><div class="kairos-incidents__title"><div><p>${escapeHTML(item.severity)} · ${escapeHTML(item.status)}</p><h3>${escapeHTML(item.title)}</h3></div><code>${escapeHTML(item.incidentId)}</code></div>
  <p>${escapeHTML(item.summary || "No summary provided.")}</p>
  <dl><div><dt>Owner</dt><dd>${escapeHTML(item.ownerIdentityHash || "Unassigned")}</dd></div><div><dt>Alert</dt><dd>${escapeHTML(item.sourceAlertCode || "None")}</dd></div><div><dt>Request</dt><dd>${escapeHTML(item.requestId || "None")}</dd></div><div><dt>Approval</dt><dd>${escapeHTML(item.approvalId || "None")}</dd></div><div><dt>Updated</dt><dd>${escapeHTML(item.updatedAt || "Unknown")}</dd></div><div><dt>Resolution</dt><dd>${escapeHTML(item.resolutionCode || "Pending")}</dd></div></dl>
  <div class="kairos-incidents__transitions">${transitionButtons(item)}</div>
  <h4>Timeline</h4><ol class="kairos-incidents__timeline">${timeline(item)}</ol>
  <p class="kairos-incidents__guardrail">No incident control performs rollback, retry, unpublish, or commerce mutation.</p></article>`;
}

function transitionButtons(item) {
  const choices = { open: ["acknowledged", "mitigated", "resolved"], acknowledged: ["mitigated", "resolved"], mitigated: ["resolved"], resolved: ["closed", "open"], closed: ["open"] }[item.status] || [];
  return choices.map((status) => `<button type="button" data-incident-id="${escapeHTML(item.incidentId)}" data-incident-status="${status}" ${state.loading ? "disabled" : ""}>${escapeHTML(label(status))}</button>`).join("");
}

function timeline(item) {
  const events = [{ at: item.createdAt, text: "Incident opened" }, ...(item.notes || []).map((note) => ({ at: note.at, text: note.text, identity: note.identityHash }))];
  return events.map((event) => `<li><time>${escapeHTML(event.at || "Unknown")}</time><span>${escapeHTML(event.text || "Update")}${event.identity ? ` · ${escapeHTML(event.identity)}` : ""}</span></li>`).join("");
}

function requestOptions(method, body) { return { method, cache: "no-store", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json", "X-MMG-Client-Build": BUILD }, ...(body ? { body: JSON.stringify(body) } : {}) }; }
function label(value) { return String(value || "").replace(/^./, (char) => char.toUpperCase()); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
