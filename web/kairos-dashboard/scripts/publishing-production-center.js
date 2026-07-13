const BUILD = "kairos-publishing-production-center-20260713-1";
const PARENT_ID = "kairos-publishing-production-parent";

function enhance() {
  hideLegacyLaunchers();

  const workspace = document.querySelector("#workspace");
  if (!workspace) return;
  const eyebrow = workspace.querySelector(".workspace-head .eyebrow")?.textContent || "";
  if (!/Content Center/i.test(eyebrow)) return;

  const children = workspace.querySelector(".children");
  if (!children || children.querySelector(`#${PARENT_ID}`)) return;

  for (const card of children.querySelectorAll(".child-card")) {
    const title = card.querySelector("h3")?.textContent?.trim() || "";
    if (["Publishing Studio", "Creative Studio"].includes(title)) card.remove();
  }

  const parent = document.createElement("article");
  parent.id = PARENT_ID;
  parent.className = "child-card publishing-production-parent";
  parent.dataset.build = BUILD;
  parent.innerHTML = `
    <p class="eyebrow">Content · Production</p>
    <h3>Publishing & Product Production</h3>
    <p>Start a complete product from an idea, cover, or manuscript—or open a manuscript directly for intake and editorial production.</p>
    <div class="publishing-production-children">
      <button type="button" class="publishing-production-child" data-open-complete-product>
        <strong>Build Complete Product</strong>
        <span>Idea, cover, or manuscript → finished publishing package and Shopify handoff.</span>
      </button>
      <button type="button" class="publishing-production-child" data-open-manuscript-studio>
        <strong>Open Manuscript Studio</strong>
        <span>Upload, extract, review, and advance an existing manuscript through production.</span>
      </button>
    </div>`;

  children.appendChild(parent);
  parent.querySelector("[data-open-complete-product]")?.addEventListener("click", () => openLegacy(".creation-engine-launch", "Complete Product"));
  parent.querySelector("[data-open-manuscript-studio]")?.addEventListener("click", () => openLegacy(".manuscript-launch", "Manuscript Studio"));
}

function openLegacy(selector, label) {
  const launcher = document.querySelector(selector);
  if (!launcher) {
    console.error(`${label} launcher is not available.`);
    return;
  }
  launcher.click();
}

function hideLegacyLaunchers() {
  document.querySelectorAll(".creation-engine-launch,.manuscript-launch").forEach(button => {
    button.hidden = true;
    button.setAttribute("aria-hidden", "true");
    button.tabIndex = -1;
  });
}

const observer = new MutationObserver(enhance);
observer.observe(document.documentElement, { childList: true, subtree: true });
enhance();
