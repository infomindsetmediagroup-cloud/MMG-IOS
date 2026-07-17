import {
  handleCanonicalHomepageBuild,
  KAIROS_CANONICAL_HOMEPAGE_BUILD,
} from "./kairos-canonical-homepage-builder-v1.js";
import {
  hashText,
  httpError,
  inspectStagingSource,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD = "kairos-canonical-homepage-compatibility-20260717-1";

const BUILD_PATH = "/api/shopify/staging/canonical-homepage/build";
const JS_FILE = "assets/mmg-canonical-homepage.js";
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 450;

const COMPATIBLE_JS_SOURCE = String.raw`(() => {
  const root = document.querySelector('[data-mmg-canonical-homepage]');
  if (!root || root.dataset.enhanced === 'true') return;
  root.dataset.enhanced = 'true';

  const themeHeading = document.querySelector('header h1.header__heading, header .header__heading h1');
  if (themeHeading && !root.contains(themeHeading)) {
    const replacement = document.createElement('div');
    for (const attribute of themeHeading.attributes) replacement.setAttribute(attribute.name, attribute.value);
    while (themeHeading.firstChild) replacement.appendChild(themeHeading.firstChild);
    themeHeading.replaceWith(replacement);
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveal = [...root.querySelectorAll('.mmg-reveal')];
  if (reducedMotion || !('IntersectionObserver' in window)) {
    reveal.forEach((element) => element.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveal.forEach((element) => observer.observe(element));
  }

  root.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = root.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  });
})();`;

export async function handleCanonicalHomepageBuildWithCompatibility(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== BUILD_PATH) return null;

  const response = await handleCanonicalHomepageBuild(request, env, ctx);
  if (!response || !response.ok) return response;

  const body = await response.clone().json();
  const themeGid = String(body?.preview?.theme?.gid || "");
  if (!themeGid) throw httpError(502, "canonical_homepage_theme_missing", "The canonical homepage build returned no verified staging theme ID.");

  const beforeInspection = await inspectStagingSource(null, request, env, KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD, [JS_FILE]);
  const beforeFile = (beforeInspection?.evidence?.files || []).find((file) => file.filename === JS_FILE);
  if (!beforeFile?.content) throw httpError(502, "canonical_homepage_script_missing", "The canonical homepage interaction script was not readable after installation.");

  const expectedSourceHash = await hashText(COMPATIBLE_JS_SOURCE);
  let verifiedHash = expectedSourceHash;
  let verifiedBytes = new TextEncoder().encode(COMPATIBLE_JS_SOURCE).length;
  let normalizedByShopify = false;
  let readBackAttempts = 0;

  try {
    await writeThemeFiles(env, themeGid, [{ filename: JS_FILE, content: COMPATIBLE_JS_SOURCE }]);
    const actual = await waitForCompatibleScript(request, env);
    readBackAttempts = actual.attempt;
    verifiedHash = actual.file.sha256;
    verifiedBytes = actual.file.bytes;
    normalizedByShopify = actual.file.content !== COMPATIBLE_JS_SOURCE || actual.file.sha256 !== expectedSourceHash;
  } catch (error) {
    await writeThemeFiles(env, themeGid, [{ filename: JS_FILE, content: beforeFile.content }]);
    throw error;
  }

  body.build = KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD;
  body.builderBuild = KAIROS_CANONICAL_HOMEPAGE_BUILD;
  body.summary = `${body.summary} Kairos also normalized the Rise homepage logo heading so the rendered document retains one primary H1.`;
  body.files = (Array.isArray(body.files) ? body.files : []).map((file) => file.filename === JS_FILE
    ? {
        ...file,
        afterSha256: verifiedHash,
        afterBytes: verifiedBytes,
        changed: file.beforeSha256 !== verifiedHash,
        compatibilityIntermediateSha256: beforeFile.sha256,
        expectedSourceSha256: expectedSourceHash,
        readBackVerification: "canonical-text-with-retry",
        normalizedByShopify,
        readBackAttempts,
      }
    : file);
  body.verification = {
    ...(body.verification || {}),
    themeHeaderHeadingNormalized: true,
    compatibilityExactReadBack: !normalizedByShopify,
    compatibilityCanonicalTextReadBack: true,
    compatibilityNormalizedByShopify: normalizedByShopify,
    compatibilityReadBackAttempts: readBackAttempts,
  };

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Kairos-Canonical-Homepage-Compatibility", KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD);
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

async function waitForCompatibleScript(request, env) {
  let lastFile = null;
  let lastError = null;
  for (let attempt = 1; attempt <= READ_BACK_ATTEMPTS; attempt += 1) {
    try {
      const readBack = await inspectStagingSource(null, request, env, KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD, [JS_FILE]);
      const actual = (readBack?.evidence?.files || []).find((file) => file.filename === JS_FILE);
      if (actual) {
        lastFile = actual;
        if (normalizeThemeText(actual.content) === normalizeThemeText(COMPATIBLE_JS_SOURCE)) {
          return { file: actual, attempt };
        }
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < READ_BACK_ATTEMPTS) await delay(READ_BACK_DELAY_MS);
  }

  const expectedHash = await hashText(normalizeThemeText(COMPATIBLE_JS_SOURCE));
  const actualHash = lastFile ? await hashText(normalizeThemeText(lastFile.content)) : "unavailable";
  const detail = lastError instanceof Error ? ` Last read error: ${lastError.message}` : "";
  throw httpError(
    502,
    "canonical_homepage_compatibility_readback_mismatch",
    `Shopify did not expose the current theme-heading compatibility script after ${READ_BACK_ATTEMPTS} read-back attempts. Expected canonical hash ${expectedHash}; observed ${actualHash}.${detail}`,
  );
}

function normalizeThemeText(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+$/gm, "")
    .replace(/\n+$/, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
