const BUILD = "kairos-readiness-registry-ui-20260714-1";
const capabilityMap = {
  knowledge: ["knowledge-library","research-brief","decision-record","doctrine-vault","intelligence-synthesis"],
  content: ["website","manuscript-studio","social-production","publishing-studio","creative-studio"],
  business: ["product-launch","revenue-intelligence","growth-plan","offer-builder","campaign-operations"],
  customers: ["visitor-activity","customer-portal","deliverables","customer-journey","support-intelligence"],
  operations: ["health","work-queue","release-control","executive-briefing","system-registry"],
};
let registry = null;
let working = false;

start();

function start() {
  document.addEventListener("click", handleClick, true);
  loadRegistry();
  setInterval(applyRegistryToVisibleCards, 15100);
}

async function handleClick(event) {
  const center = event.target.closest?.("[data-center]");
  if (center) {
    setTimeout(applyRegistryToVisibleCards, 20);
    setTimeout(enhanceApplicationRegister, 900);
    return;
  }
  const applyButton = event.target.closest?.("[data-apply-readiness-promotion]");
  if (!applyButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await applyPromotion(applyButton);
}

async function loadRegistry() {
  try {
    const result = await request("/api/readiness-registry");
    if (!result.response.ok || !result.body?.scores) return;
    registry = result.body;
    applyRegistryToVisibleCards();
  } catch {}
}

function applyRegistryToVisibleCards() {
  if (!registry?.scores) return;
  document.querySelectorAll(".parent-card[data-center]").forEach(card => {
    const center = card.dataset.center;
    const scores = capabilityMap[center]?.map(id => Number(registry.scores?.[center]?.[id] ?? 0)) || [];
    if (!scores.length) return;
    const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
    card.dataset.readiness = String(average);
    const meter = card.querySelector(".mini-meter");
    meter?.setAttribute("aria-valuenow", String(average));
    meter?.querySelector("span")?.style.setProperty("--meter", `${average}%`);
    const label = card.querySelector(".card-foot b");
    if (label) label.textContent = `${average}% operational`;
  });

  const workspace = document.querySelector("#workspace");
  if (!workspace) return;
  const centerTitle = workspace.querySelector(".workspace-head .eyebrow")?.textContent?.split(" Center")[0]?.trim().toLowerCase();
  if (!centerTitle || !registry.scores[centerTitle]) return;
  const childCards = [...workspace.querySelectorAll(".child-card")];
  childCards.forEach(card => {
    const id = card.querySelector("[data-child]")?.dataset.child;
    if (!id || registry.scores[centerTitle][id] === undefined) return;
    const score = Number(registry.scores[centerTitle][id]);
    card.dataset.readiness = String(score);
    const label = card.querySelector(".child-readiness span");
    if (label) label.textContent = `${score}%`;
  });
  const scores = capabilityMap[centerTitle].map(id => Number(registry.scores[centerTitle][id] || 0));
  const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  const panel = workspace.querySelector(".center-readiness");
  const heading = panel?.querySelector("header h3");
  if (heading) heading.textContent = `${average}% operational`;
  const overall = panel?.querySelector(".readiness-overall");
  overall?.setAttribute("aria-valuenow", String(average));
  overall?.querySelector("span")?.style.setProperty("--meter", `${average}%`);
  [...panel?.querySelectorAll(".readiness-breakdown article") || []].forEach((row, index) => {
    const id = capabilityMap[centerTitle][index];
    const score = Number(registry.scores[centerTitle][id] || 0);
    const value = row.querySelector("b");
    if (value) value.textContent = `${score}%`;
    const meter = row.querySelector(".readiness-child-meter");
    meter?.setAttribute("aria-valuenow", String(score));
    meter?.querySelector("span")?.style.setProperty("--meter", `${score}%`);
  });
}

async function enhanceApplicationRegister() {
  const panel = document.querySelector(".center-readiness");
  if (!panel || panel.querySelector(".readiness-application-register")) return;
  const childCards = [...document.querySelectorAll(".child-card[data-readiness]")]
    .map(card => ({
      title: card.querySelector("h3")?.textContent?.trim() || "Capability",
      capability: card.querySelector("[data-child]")?.dataset.child || "",
      score: Number(card.dataset.readiness || 0),
      center: card.querySelector(".eyebrow")?.textContent?.trim().toLowerCase() || "operations",
    }))
    .filter(item => item.capability)
    .sort((a,b) => a.score - b.score || a.title.localeCompare(b.title));
  if (!childCards.length) return;
  const context = childCards[0];
  const section = document.createElement("section");
  section.className = "readiness-application-register";
  section.innerHTML = `<header><div><p class="eyebrow">Promotion Application</p><h4>Authorized meter changes</h4></div><span data-application-count>0</span></header><div data-application-list><p class="readiness-register-empty">Loading completed authorizations…</p></div><p class="readiness-application-boundary">Only completed and approved promotion authorizations can update the readiness registry.</p>`;
  panel.appendChild(section);
  try {
    const result = await request("/api/workflows");
    if (!result.response.ok) throw new Error("Kairos could not read promotion authorizations.");
    const promotions = (result.body?.workflows || [])
      .filter(item => item?.source === "command-center-readiness-promotion" || item?.title === `${context.title} Readiness Promotion Authorization`)
      .filter(item => String(item?.center || "").toLowerCase() === context.center)
      .sort((a,b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
    section.querySelector("[data-application-count]").textContent = String(promotions.length);
    const list = section.querySelector("[data-application-list]");
    if (!promotions.length) {
      list.innerHTML = `<p class="readiness-register-empty">No promotion authorization exists for this capability.</p>`;
      return;
    }
    list.innerHTML = promotions.slice(0,5).map(item => {
      const applied = registry?.history?.some(change => change.authorizationWorkflowID === item.id);
      const eligible = item.state === "completed" && item.approvalStatus === "approved" && !applied;
      const action = applied ? `<button type="button" disabled>Applied</button>` : eligible ? `<button type="button" class="readiness-apply-action" data-apply-readiness-promotion="${escapeHTML(item.id)}" data-center="${escapeHTML(context.center)}" data-capability="${escapeHTML(context.capability)}" data-current-score="${context.score}">Apply Promotion</button>` : `<button type="button" disabled>${escapeHTML(item.state || "ready")}</button>`;
      return `<article class="readiness-application-row"><div><strong>${escapeHTML(item.title || "Readiness Promotion Authorization")}</strong><small>${escapeHTML(item.state || "ready")} · approval ${escapeHTML(item.approvalStatus || "pending")}</small></div>${action}</article>`;
    }).join("");
  } catch (error) {
    section.querySelector("[data-application-list]").innerHTML = `<p class="readiness-register-empty">${escapeHTML(error.message)}</p>`;
  }
}

async function applyPromotion(button) {
  if (working || button.disabled) return;
  const currentScore = Number(button.dataset.currentScore || 0);
  const targetScore = Number(prompt(`Approved target readiness score (${currentScore + 1}-100):`, String(Math.min(100, currentScore + 10))));
  if (!Number.isFinite(targetScore)) return;
  const actor = prompt("Authorized actor:", "Executive")?.trim();
  if (!actor) return;
  const evidence = prompt("Enter the evidence and approval rationale supporting this score change:")?.trim();
  if (!evidence) return;
  working = true;
  button.disabled = true;
  button.textContent = "Applying…";
  try {
    const result = await request("/api/readiness-registry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify({ center: button.dataset.center, capability: button.dataset.capability, targetScore, actor, evidence, authorizationWorkflowID: button.dataset.applyReadinessPromotion }),
    });
    if (!result.response.ok) throw new Error(result.body?.error?.message || "Readiness promotion could not be applied.");
    registry = result.body.registry;
    applyRegistryToVisibleCards();
    button.textContent = "Applied";
    window.dispatchEvent(new CustomEvent("kairos:readiness-registry:updated", { detail: result.body.change }));
  } catch (error) {
    button.disabled = false;
    button.textContent = "Apply Promotion";
    alert(error.message || "Readiness promotion could not be applied.");
  } finally {
    working = false;
  }
}

async function request(url, init = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...init });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  return { response, body };
}
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]); }
window.KairosReadinessRegistry = { build: BUILD, reload: loadRegistry, apply: applyRegistryToVisibleCards };
