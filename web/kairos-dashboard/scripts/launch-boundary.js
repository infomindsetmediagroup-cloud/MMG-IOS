const BUILD = "kairos-launch-boundary-20260712-1";

function applyLaunchBoundary() {
  document.querySelectorAll(".creation-engine-launch").forEach(button => button.remove());

  const overlay = document.querySelector("#manuscript-studio-overlay");
  if (!overlay || overlay.dataset.launchBoundaryApplied === BUILD) return;
  overlay.dataset.launchBoundaryApplied = BUILD;

  const intro = overlay.querySelector("header p:last-child");
  if (intro) {
    intro.textContent = "Upload and extract TXT, Markdown, RTF, DOCX, or text-based PDF manuscripts. Automated editing and KDP-readiness analysis are deferred for the current launch.";
  }

  const reviewButton = overlay.querySelector("[data-review]");
  if (reviewButton) {
    reviewButton.textContent = "Automated Review Deferred";
    reviewButton.disabled = true;
    reviewButton.setAttribute("aria-disabled", "true");
  }

  const note = overlay.querySelector(".manuscript-note");
  if (note) {
    note.textContent = "Manuscript intake and text extraction are operational. Automated editing, rewriting, and KDP-readiness analysis are intentionally deferred. No external model provider or fallback is used.";
  }

  const textArea = overlay.querySelector("#ms-body");
  if (textArea && !overlay.querySelector("[data-download-extracted]")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.dataset.downloadExtracted = "true";
    button.textContent = "Download Extracted Manuscript";
    button.addEventListener("click", () => {
      const text = textArea.value || "";
      if (!text.trim()) return;
      const title = overlay.querySelector("#ms-title")?.value || "manuscript";
      const filename = `${safeName(title)}-extracted.txt`;
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    reviewButton?.insertAdjacentElement("afterend", button);
  }
}

function safeName(value) {
  return String(value || "manuscript")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "manuscript";
}

const observer = new MutationObserver(applyLaunchBoundary);
observer.observe(document.documentElement, { childList: true, subtree: true });
applyLaunchBoundary();
