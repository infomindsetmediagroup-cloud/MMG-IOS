const BUILD = "kairos-launch-boundary-20260712-3";

function applyLaunchBoundary() {
  const overlay = document.querySelector("#manuscript-studio-overlay");
  if (!overlay || overlay.dataset.launchBoundaryApplied === BUILD) return;
  overlay.dataset.launchBoundaryApplied = BUILD;

  const intro = overlay.querySelector("header p:last-child");
  if (intro) {
    intro.textContent = "Upload and extract TXT, Markdown, RTF, DOCX, or text-based PDF manuscripts, then advance the validated manuscript directly into MMG production intake.";
  }

  const reviewButton = overlay.querySelector("[data-review]");
  if (reviewButton) {
    reviewButton.textContent = "Continue to Production Intake";
    reviewButton.disabled = false;
    reviewButton.removeAttribute("aria-disabled");
    reviewButton.dataset.advanceProduction = "true";
    reviewButton.replaceWith(reviewButton.cloneNode(true));
  }

  const advanceButton = overlay.querySelector("[data-advance-production]");
  if (advanceButton) advanceButton.addEventListener("click", advanceToProduction);

  const note = overlay.querySelector(".manuscript-note");
  if (note) {
    note.textContent = "After extraction, Kairos validates the manuscript and creates the MMG production-intake record. Automated rewriting is deferred, but the publishing project continues through project setup, cover intake, editorial assignment, customer review, and production.";
  }

  overlay.querySelectorAll("[data-download-extracted]").forEach(button => button.remove());
  restoreIntakeResult(overlay);
}

async function advanceToProduction() {
  const overlay = document.querySelector("#manuscript-studio-overlay");
  if (!overlay) return;
  const button = overlay.querySelector("[data-advance-production]");
  const title = overlay.querySelector("#ms-title")?.value.trim() || "Untitled manuscript";
  const manuscript = overlay.querySelector("#ms-body")?.value || "";

  if (manuscript.trim().length < 50) {
    showError(overlay, "Upload or paste a valid manuscript before continuing.");
    return;
  }

  button.disabled = true;
  button.textContent = "Creating Production Record…";
  clearMessages(overlay);

  try {
    const source = readSourceMetadata(overlay);
    const response = await fetch("/api/manuscript/intake/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MMG-Client-Build": BUILD },
      credentials: "include",
      body: JSON.stringify({ title, manuscript, source }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Kairos could not advance this manuscript.");

    sessionStorage.setItem("mmg.manuscript.production-intake", JSON.stringify(body));
    renderProductionIntake(overlay, body);
    window.dispatchEvent(new CustomEvent("kairos:manuscript-production-intake", { detail: body }));
  } catch (error) {
    showError(overlay, error?.message || "Kairos could not advance this manuscript.");
    button.disabled = false;
    button.textContent = "Continue to Production Intake";
  }
}

function renderProductionIntake(overlay, result) {
  const panel = overlay.querySelector(".manuscript-panel");
  if (!panel) return;
  const actions = Array.isArray(result?.workflow?.requiredNextActions) ? result.workflow.requiredNextActions : [];
  const source = result?.manuscript || {};
  panel.innerHTML = `<header><div><p class="eyebrow">Customer Portal · Publishing</p><h2>Production Intake Created</h2><p>${esc(result?.customerMessage || "The manuscript is now in MMG production intake.")}</p></div><button data-close aria-label="Close">×</button></header><div class="manuscript-result"><div class="manuscript-status"><span>Current stage</span><strong>Production Intake</strong></div><h3>${esc(result?.title || "Untitled manuscript")}</h3><p><strong>Project:</strong> ${esc(result?.projectID || "—")}</p><p><strong>Intake:</strong> ${esc(result?.intakeID || "—")}</p><p><strong>Validated manuscript:</strong> ${Number(source.wordCount || 0).toLocaleString()} words · ${Number(source.characterCount || 0).toLocaleString()} characters</p><div class="issue-list">${actions.map((action,index)=>`<article><b>Next ${index+1}</b><p>${esc(action)}</p></article>`).join("")}</div><p class="manuscript-note">The project has advanced. No manuscript download is required. The next operational stage is project setup and production assignment.</p><div class="manuscript-actions"><button class="primary" data-close-intake>Return to Command Center</button></div></div>`;
  panel.querySelector("[data-close]").onclick=()=>{overlay.remove();};
  panel.querySelector("[data-close-intake]").onclick=()=>{overlay.remove();};
}

function restoreIntakeResult(overlay) {
  try {
    const saved = JSON.parse(sessionStorage.getItem("mmg.manuscript.production-intake") || "null");
    if (saved?.status === "production_intake" && overlay.querySelector("#ms-body")?.value) {
      // Preserve the active upload screen until the user explicitly advances again.
    }
  } catch {}
}

function readSourceMetadata(overlay) {
  const loaded = overlay.querySelector(".manuscript-source")?.textContent || "";
  const filename = loaded.match(/Loaded:\s*([^·]+)/i)?.[1]?.trim() || "manuscript";
  const format = loaded.match(/·\s*([A-Z0-9]+)\s*·/)?.[1]?.toLowerCase() || "text";
  return { name: filename, format };
}

function clearMessages(overlay) {
  overlay.querySelectorAll(".manuscript-error,.manuscript-progress").forEach(node => node.remove());
}

function showError(overlay, message) {
  clearMessages(overlay);
  const error = document.createElement("p");
  error.className = "manuscript-error";
  error.textContent = message;
  overlay.querySelector(".manuscript-note")?.insertAdjacentElement("afterend", error);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
}

const observer = new MutationObserver(applyLaunchBoundary);
observer.observe(document.documentElement, { childList: true, subtree: true });
applyLaunchBoundary();
