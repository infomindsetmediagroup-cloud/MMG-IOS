const BUILD = "kairos-prebreak-functionality-recovery-20260717-1";
const CHILD_BRIDGE_BUILD = "kairos-child-action-bridge-20260716-1";
const PRESERVE_DIRECTIVE = `KAIROS IMMUTABLE VISUAL-PRESERVATION CONTRACT:
- Preserve the current Shopify theme's visual design exactly unless a separate explicit visual-redesign approval is supplied.
- Do not change colors, color schemes, gradients, typography, border radii, pills, buttons, badges, card styling, shadows, spacing tokens, design tokens, CSS, or global theme settings.
- Do not install a replacement canonical design system.
- Structural and copy work must reuse the existing components, classes, settings, and verified rendered styling.
- Keep the current native Shopify header and footer visual settings unchanged.
- Any proposed visual mutation is unauthorized and must be excluded from the staging package.`;

installImmediateStyles();
installFetchGuard();
installDOMGuard();
installCurrentChildRuntime();

function installImmediateStyles() {
  if (document.querySelector("#kairos-prebreak-recovery-styles")) return;
  const style = document.createElement("style");
  style.id = "kairos-prebreak-recovery-styles";
  style.textContent = `
    .app-header-status{display:none!important}
    .app-header{position:relative!important}
    .website-native-options{display:none!important}
    .website-native-review .website-native-keep{display:flex!important}
  `;
  document.head.appendChild(style);
}

function installDOMGuard() {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      reconcileDOM();
    });
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", schedule, true);
  window.addEventListener("popstate", schedule);
  window.addEventListener("load", schedule, { once: true });
  schedule();
}

function reconcileDOM() {
  document.querySelectorAll(".app-header-status").forEach(node => node.remove());

  document.querySelectorAll(".parent-card[data-route-center]").forEach(card => {
    card.dataset.center = card.dataset.routeCenter || "";
  });

  document.querySelectorAll("[data-route-workspace]").forEach(control => {
    control.dataset.currentChildRuntime = CHILD_BRIDGE_BUILD;
  });

  const scope = document.querySelector("#website-request-type");
  if (scope) {
    const full = [...scope.options].find(option => option.value === "full-retool");
    if (full) full.textContent = "Structural WEB-003 retool — preserve current visual design";
    const content = [...scope.options].find(option => option.value === "content-only");
    if (content) content.textContent = "Content update — preserve structure and visual design";
  }

  const confirmation = document.querySelector("[data-website-full-retool-confirm]");
  const confirmationCopy = confirmation?.closest("label")?.querySelector("span");
  if (confirmationCopy) {
    confirmationCopy.textContent = "I authorize structural work on the non-live staging theme. Existing colors, typography, pills, buttons, cards, spacing, design tokens, and native theme styling must remain unchanged.";
  }

  const nativeKeep = document.querySelector("[data-website-native-keep]");
  if (nativeKeep && !nativeKeep.checked) {
    nativeKeep.checked = true;
    nativeKeep.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.querySelectorAll("[data-website-native-change]").forEach(input => {
    input.checked = false;
    input.disabled = true;
  });

  const nativeHeading = document.querySelector(".website-native-review h4");
  if (nativeHeading) nativeHeading.textContent = "Current native Shopify header locked";
  const nativeDescription = document.querySelector(".website-native-review h4 + p");
  if (nativeDescription) nativeDescription.textContent = "Kairos will preserve the current verified header, colors, schemes, spacing, and controls. Visual theme changes are excluded from this job.";
}

function installFetchGuard() {
  if (window.__kairosPreserveFetchInstalled) return;
  window.__kairosPreserveFetchInstalled = BUILD;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input?.url || String(input), location.href);
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    if (method !== "POST" || typeof init?.body !== "string") return nativeFetch(input, init);

    let payload;
    try { payload = JSON.parse(init.body); }
    catch { return nativeFetch(input, init); }

    if (target.pathname === "/api/shopify/staging/plan/jobs") {
      payload = protectPlanningPayload(payload);
    } else if (target.pathname === "/api/shopify/staging/execute/jobs") {
      payload = protectExecutionPayload(payload);
    }

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("Content-Type", "application/json");
    headers.set("X-Kairos-Visual-Preservation", BUILD);
    return nativeFetch(input, { ...init, headers, body: JSON.stringify(payload) });
  };
}

function protectPlanningPayload(payload) {
  const fullRetool = payload?.requestType === "full-retool";
  const objective = String(payload?.objective || "").trim();
  return {
    ...payload,
    objective: objective.includes("KAIROS IMMUTABLE VISUAL-PRESERVATION CONTRACT")
      ? objective
      : `${objective}\n\n${PRESERVE_DIRECTIVE}`,
    intent: fullRetool ? "structural-preserve-visual-design" : "content-preserve-visual-design",
    fullRetoolConfirmed: fullRetool,
    structuralMutationAuthorized: fullRetool,
    styleMutationAuthorized: false,
    visualMutationAuthorized: false,
    themeSchemeMutationAuthorized: false,
    designTokenMutationAuthorized: false,
    cssMutationAuthorized: false,
    preserveVisualDesign: true,
    preserveColors: true,
    preserveTypography: true,
    preservePillsAndButtons: true,
    preserveThemeSettings: true,
    keepNativeHeader: true,
    keepNativeFooter: true,
    visualPreservationBuild: BUILD,
  };
}

function protectExecutionPayload(payload) {
  return {
    ...payload,
    websiteRetool: {
      ...(payload?.websiteRetool || {}),
      nativeThemeDecision: "keep-current",
      selectedChanges: [],
      preserveVisualDesign: true,
      preserveColors: true,
      preserveTypography: true,
      preservePillsAndButtons: true,
      styleMutationAuthorized: false,
      visualPreservationBuild: BUILD,
    },
    approval: {
      ...(payload?.approval || {}),
      styleMutationAuthorized: false,
      visualMutationAuthorized: false,
      keepNativeThemeStyling: true,
      visualPreservationBuild: BUILD,
    },
  };
}

function installCurrentChildRuntime() {
  const load = () => import(`./child-action-bridge.js?v=${CHILD_BRIDGE_BUILD}`)
    .then(() => {
      window.dispatchEvent(new CustomEvent("kairos:child-runtime-reconciled", {
        detail: { build: BUILD, childBridge: CHILD_BRIDGE_BUILD },
      }));
    })
    .catch(error => console.error("Kairos child runtime could not load", error));

  if (document.readyState === "complete") queueMicrotask(load);
  else window.addEventListener("load", load, { once: true });
}

window.KairosPrebreakFunctionalityRecovery = {
  build: BUILD,
  childBridge: CHILD_BRIDGE_BUILD,
  visualPreservation: "enforced",
  loaderMutation: false,
};
