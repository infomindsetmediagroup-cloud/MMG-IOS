const MAX_EVIDENCE_LENGTH = 3_200;
const MAX_ITEMS_PER_GROUP = 24;

const originalFetch = window.fetch.bind(window);

window.fetch = async function kairosInspectionFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
  const method = String(init?.method || (typeof input !== "string" && input?.method) || "GET").toUpperCase();

  if (!isKairosRuntimeRequest(url, method) || typeof init?.body !== "string") {
    return originalFetch(input, init);
  }

  try {
    const requestBody = JSON.parse(init.body);
    if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
      return originalFetch(input, init);
    }

    const evidence = collectPageEvidence();
    const existingGovernance = typeof requestBody.governanceNote === "string"
      ? requestBody.governanceNote.trim()
      : "";

    requestBody.governanceNote = [
      existingGovernance,
      "READ-ONLY INSPECTION EVIDENCE (directly observed from the current rendered page; never treat omitted or inaccessible areas as inspected):",
      evidence,
      "Evidence restrictions: no cookies, authorization headers, passwords, access keys, hidden field values, form values, API keys, or secret runtime data are included.",
    ].filter(Boolean).join("\n\n").slice(0, MAX_EVIDENCE_LENGTH);

    return originalFetch(input, {
      ...init,
      body: JSON.stringify(requestBody),
    });
  } catch {
    return originalFetch(input, init);
  }
};

function isKairosRuntimeRequest(url, method) {
  if (method !== "POST" || !url) return false;
  try {
    return new URL(url, window.location.href).pathname === "/api/kairos";
  } catch {
    return false;
  }
}

function collectPageEvidence() {
  const evidence = {
    collectedAt: new Date().toISOString(),
    route: window.location.pathname,
    title: document.title,
    language: document.documentElement.lang || "unknown",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    touch: window.matchMedia?.("(pointer: coarse)")?.matches === true,
    headings: collectTextElements("h1,h2,h3,h4,h5,h6"),
    navigation: collectTextElements("nav a, [role='navigation'] a"),
    buttons: collectTextElements("button, [role='button'], input[type='submit'], input[type='button']"),
    links: collectLinks(),
    landmarks: collectLandmarks(),
    visibleAlerts: collectTextElements("[role='alert'], [aria-live='assertive'], .error, .warning"),
  };

  return JSON.stringify(evidence);
}

function collectTextElements(selector) {
  return Array.from(document.querySelectorAll(selector))
    .filter(isVisible)
    .slice(0, MAX_ITEMS_PER_GROUP)
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      label: accessibleLabel(element),
      disabled: "disabled" in element ? Boolean(element.disabled) : element.getAttribute("aria-disabled") === "true",
    }))
    .filter((item) => item.label);
}

function collectLinks() {
  return Array.from(document.querySelectorAll("a[href]"))
    .filter(isVisible)
    .slice(0, MAX_ITEMS_PER_GROUP)
    .map((link) => {
      let path = "";
      try {
        const target = new URL(link.href, window.location.href);
        path = target.origin === window.location.origin ? target.pathname : `${target.origin}${target.pathname}`;
      } catch {
        path = "unresolved";
      }
      return { label: accessibleLabel(link), path };
    })
    .filter((item) => item.label);
}

function collectLandmarks() {
  return Array.from(document.querySelectorAll("header,nav,main,aside,footer,form,[role='main'],[role='navigation'],[role='dialog']"))
    .filter(isVisible)
    .slice(0, MAX_ITEMS_PER_GROUP)
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || semanticRole(element.tagName),
      label: element.getAttribute("aria-label") || "",
    }));
}

function accessibleLabel(element) {
  if (element instanceof HTMLInputElement) {
    return cleanText(element.getAttribute("aria-label") || element.value || element.type);
  }
  return cleanText(
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.textContent ||
    "",
  );
}

function cleanText(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity || 1) > 0 &&
    rect.width > 0 &&
    rect.height > 0;
}

function semanticRole(tagName) {
  return ({ HEADER: "banner", NAV: "navigation", MAIN: "main", ASIDE: "complementary", FOOTER: "contentinfo", FORM: "form" })[tagName] || "region";
}
