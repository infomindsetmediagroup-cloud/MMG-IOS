const BUILD = "kairos-visual-review-20260712-1";
const originalFetch = window.fetch.bind(window);
const state = { verification:null, loading:false, error:"", decision:null };

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  try {
    const url = String(typeof args[0] === "string" ? args[0] : args[0]?.url || "");
    if (/\/api\/shopify\/staging\/execute\/jobs\/[a-f0-9-]+/i.test(url)) {
      const body = await response.clone().json();
      if (body?.status === "completed" && body?.result?.execution && !state.verification && !state.loading) {
        queueMicrotask(() => createVerification(body.result));
      }
    }
  } catch {
    // The primary website workflow must never fail because the visual-review observer could not parse a response.
  }
  return response;
};

async function createVerification(result) {
  state.loading = true;
  state.error = "";
  render();
  try {
    const response = await originalFetch("/api/shopify/staging/visual-verification", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      body: JSON.stringify({ execution: result.execution, result, requestType: "homepage" })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not prepare the visual review.");
    state.verification = body;
    sessionStorage.setItem("kairos.website.visual-review", JSON.stringify(body));
  } catch (error) {
    state.error = error?.message || "Kairos could not prepare the visual review.";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  const host = document.querySelector("#website-production-overlay .website-production-panel");
  if (!host) return;
  host.querySelector("#kairos-visual-review")?.remove();
  const completion = host.querySelector(".wp-review-banner.success");
  if (!completion && !state.loading && !state.error && !state.verification) return;

  const section = document.createElement("section");
  section.id = "kairos-visual-review";
  section.className = "kairos-visual-review";

  if (state.loading) {
    section.innerHTML = `<p class="eyebrow">Visual Verification</p><h3>Preparing staging review…</h3><p>Kairos is probing the rendered staging page and assembling the executive mobile and desktop review gate.</p>`;
  } else if (state.error) {
    section.innerHTML = `<p class="eyebrow">Visual Verification</p><h3>Review package needs attention</h3><p class="wp-error">${esc(state.error)}</p><button class="secondary" data-vr-retry>Retry Visual Verification</button>`;
  } else if (state.verification) {
    section.innerHTML = reviewMarkup(state.verification);
  }

  const actions = host.querySelector(".wp-actions:last-of-type");
  if (actions) actions.insertAdjacentElement("beforebegin", section);
  else host.appendChild(section);
  bind(section);
}

function reviewMarkup(record) {
  const checks = Array.isArray(record.automatedChecks) ? record.automatedChecks : [];
  const manual = Array.isArray(record.requiredVisualChecks) ? record.requiredVisualChecks : [];
  const passed = checks.filter(item => item.passed).length;
  const evidence = record.pageEvidence || {};
  const decided = record.executiveDecision;

  return `<div class="vr-head"><div><p class="eyebrow">Visual Verification</p><h3>${decided ? "Executive decision recorded" : "Staging visual review required"}</h3></div><span>${passed}/${checks.length} automated checks passed</span></div>
    <div class="vr-preview-grid">
      <article><strong>Mobile review</strong><p>Open the real Shopify staging preview and inspect it at phone width.</p><a class="vr-open" href="${escAttr(record.preview?.mobileURL)}" target="_blank" rel="noopener">Open Mobile Preview ↗</a></article>
      <article><strong>Desktop review</strong><p>Open the same verified staging theme in a desktop browser.</p><a class="vr-open" href="${escAttr(record.preview?.desktopURL)}" target="_blank" rel="noopener">Open Desktop Preview ↗</a></article>
    </div>
    <div class="vr-evidence"><span>HTTP ${esc(evidence.httpStatus ?? "—")}</span><span>${esc(evidence.title || "Title unavailable")}</span><span>${esc(evidence.h1Count ?? "—")} H1</span><span>${esc(evidence.linkCount ?? "—")} links</span><span>${esc(evidence.latencyMs ?? "—")} ms</span></div>
    <div class="vr-checks"><h4>Automated rendered-page checks</h4>${checks.map(item=>`<div class="vr-check ${item.passed?"passed":"review"}"><b>${item.passed?"✓":"!"}</b><span><strong>${esc(label(item.id))}</strong><small>${esc(item.detail)}</small></span></div>`).join("")}</div>
    <div class="vr-manual"><h4>Executive visual checklist</h4>${manual.map((item,index)=>`<label><input type="checkbox" data-vr-check="${index}" ${decided?.decision==="approved"?"checked disabled":""}><span>${esc(item)}</span></label>`).join("")}</div>
    ${decided ? `<div class="vr-decision ${escAttr(decided.decision)}"><strong>${esc(decided.decision)}</strong><p>${esc(record.nextAction || "Decision recorded.")}</p></div>` : `<label class="vr-notes">Review notes<textarea data-vr-notes maxlength="2000" placeholder="Record any visual correction required before publication."></textarea></label><div class="vr-actions"><button class="primary" data-vr-approve>Approve Visual Review</button><button class="secondary" data-vr-revise>Request Revision</button><button class="secondary" data-vr-reject>Reject Staging Result</button></div>`}
    <p class="vr-boundary">Visual approval does not publish the theme. Staging-to-live publication remains a separate Release Control decision.</p>`;
}

function bind(section) {
  section.querySelector("[data-vr-retry]")?.addEventListener("click",()=>{
    const stored = sessionStorage.getItem("kairos.website.last-execution");
    if (stored) createVerification(JSON.parse(stored));
  });
  section.querySelector("[data-vr-approve]")?.addEventListener("click",()=>decide("approved"));
  section.querySelector("[data-vr-revise]")?.addEventListener("click",()=>decide("revision-requested"));
  section.querySelector("[data-vr-reject]")?.addEventListener("click",()=>decide("rejected"));
}

async function decide(decision) {
  if (!state.verification) return;
  if (decision === "approved") {
    const boxes = [...document.querySelectorAll("#kairos-visual-review [data-vr-check]")];
    if (!boxes.length || boxes.some(box => !box.checked)) {
      alert("Complete every executive visual check before approving publication readiness.");
      return;
    }
  }
  const notes = document.querySelector("#kairos-visual-review [data-vr-notes]")?.value || "";
  const response = await originalFetch("/api/shopify/staging/visual-approval", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
    body: JSON.stringify({ reviewID: state.verification.reviewID, decision, actor: "Executive", notes })
  });
  const body = await response.json();
  if (!response.ok) { state.error = body?.error?.message || "The visual decision could not be recorded."; render(); return; }
  state.verification = body;
  state.decision = decision;
  sessionStorage.setItem("kairos.website.visual-review", JSON.stringify(body));
  window.dispatchEvent(new CustomEvent("kairos:website-visual-decision", { detail: body }));
  render();
}

function label(value) { return String(value || "check").replace(/_/g," ").replace(/\b\w/g,letter=>letter.toUpperCase()); }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]); }
function escAttr(value) { return esc(value).replace(/`/g,"&#96;"); }

const observer = new MutationObserver(render);
observer.observe(document.documentElement, { childList:true, subtree:true });
render();
