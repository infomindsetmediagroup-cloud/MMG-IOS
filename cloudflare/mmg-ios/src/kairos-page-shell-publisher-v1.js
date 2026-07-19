import {
  deleteThemeFiles,
  hashText,
  httpError,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_PAGE_SHELL_BUILD = "kairos-page-shell-publisher-20260719-1";
export const PAGE_SHELL_PATH = "/api/shopify/page-shell/publish";
export const PAGE_SHELL_CONFIRMATION = "PUBLISH_MMG_PAGE_SHELL_RECONCILIATION";

const SHOPIFY_TIMEOUT_MS = 25_000;
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 500;
const LAYOUT_FILE = "layout/theme.liquid";
const CSS_FILE = "assets/mmg-page-shell.css";
const JS_FILE = "assets/mmg-page-shell.js";
const MARKER_START = "<!-- MMG_PAGE_SHELL_START -->";
const MARKER_END = "<!-- MMG_PAGE_SHELL_END -->";
const tokenCache = new Map();

const PAGE_RULES = {
  "/pages/free-creator-toolkit": {
    title: "Free Creator Toolkit",
    hideNativeTitle: true,
    normalizeFooter: "toolkit-mini-navigation",
  },
  "/pages/publishing-services": {
    title: "MMG Publishing Services™",
    hideNativeTitle: true,
    normalizeFooter: "publishing-directory",
    repairProjectGuideLinks: true,
  },
};

const CSS_SOURCE = String.raw`/* MMG page shell · kairos-page-shell-publisher-20260719-1 */
.mmg-native-page-title-hidden,.mmg-page-directory-hidden,.mmg-page-mini-navigation-hidden{display:none!important}
html[data-mmg-page-shell-page="free-creator-toolkit"] main,html[data-mmg-page-shell-page="publishing-services"] main{overflow-x:clip}
html[data-mmg-page-shell-page] [data-mmg-link-repaired="true"]{scroll-margin-top:10rem}
`;

export async function handlePageShellPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== PAGE_SHELL_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  if (payload?.confirmation !== PAGE_SHELL_CONFIRMATION) {
    throw httpError(403, "page_shell_confirmation_required", `Provide the exact confirmation phrase: ${PAGE_SHELL_CONFIRMATION}.`);
  }

  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const mainTheme = await getMainTheme(config, auth);
  const beforeFiles = await readThemeFiles(config, auth, mainTheme.id, [LAYOUT_FILE, CSS_FILE, JS_FILE]);
  const beforeMap = new Map(beforeFiles.map((file) => [file.filename, file]));
  const layoutBefore = beforeMap.get(LAYOUT_FILE)?.content;
  if (!layoutBefore) throw httpError(409, "page_shell_layout_unavailable", `${LAYOUT_FILE} was not readable from the published Shopify MAIN theme.`);

  const updates = [
    { filename: LAYOUT_FILE, content: injectPageShellAssets(stripManagedBlock(layoutBefore)) },
    { filename: CSS_FILE, content: CSS_SOURCE },
    { filename: JS_FILE, content: buildPageShellRuntime() },
  ];

  await writeThemeFiles(env, mainTheme.id, updates);
  try {
    await verifyReadBack(config, auth, mainTheme.id, updates);
  } catch (failure) {
    await restoreFiles(env, mainTheme.id, updates, beforeMap);
    throw failure;
  }

  return json({
    status: "completed",
    build: KAIROS_PAGE_SHELL_BUILD,
    completedAt: new Date().toISOString(),
    summary: "Published the shared MMG page-shell reconciler for canonical titles, publishing-process links, and page-specific footer normalization.",
    pages: Object.entries(PAGE_RULES).map(([path, rule]) => ({ path, ...rule })),
    theme: summarizeTheme(mainTheme),
    files: await Promise.all(updates.map(async (file) => ({
      filename: file.filename,
      beforeSha256: beforeMap.get(file.filename)?.sha256 || null,
      afterSha256: await hashText(file.content),
      changed: beforeMap.get(file.filename)?.content !== file.content,
    }))),
    verification: {
      valid: true,
      exactThemeFileReadBack: true,
      layoutInjectionPresent: true,
      targetPages: Object.keys(PAGE_RULES),
      duplicateTitleRepairEnabled: true,
      projectGuideRepairEnabled: true,
      footerNormalizationEnabled: true,
    },
    safeguards: {
      mainThemeRoleVerified: String(mainTheme.role).toUpperCase() === "MAIN",
      rollbackOnReadBackFailure: true,
      pageScopedRulesOnly: true,
      nativeFooterPreserved: true,
      nativeHeaderPreserved: true,
      workersAIUsed: false,
    },
  });
}

function buildPageShellRuntime() {
  return String.raw`(() => {
  "use strict";
  const BUILD = "${KAIROS_PAGE_SHELL_BUILD}";
  const RULES = ${JSON.stringify(PAGE_RULES)};

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function pathKey() {
    const path = window.location.pathname.replace(/\/+$/, "");
    return path || "/";
  }

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function hideDuplicateNativeTitle(main, rule) {
    if (!rule.hideNativeTitle) return false;
    const headings = Array.from(main.querySelectorAll("h1")).filter(isVisible);
    if (headings.length < 2) return false;
    const candidate = headings.find(function(heading, index) {
      if (index !== 0) return false;
      const text = normalize(heading.textContent).toLowerCase();
      const expected = normalize(rule.title).toLowerCase();
      return heading.matches(".main-page-title,.page-title,[class*='page-title']") || text === expected;
    });
    if (!candidate || candidate.classList.contains("mmg-native-page-title-hidden")) return false;
    candidate.classList.add("mmg-native-page-title-hidden");
    candidate.setAttribute("aria-hidden", "true");
    candidate.dataset.mmgPageShell = BUILD;
    return true;
  }

  function ensurePublishingProcessTarget(main) {
    let target = document.getElementById("publishing-process");
    if (target) return target;
    const headings = Array.from(main.querySelectorAll("h2,h3,[role='heading']"));
    const heading = headings.find(function(element) {
      const text = normalize(element.textContent).toLowerCase();
      return text === "the publishing workflow is designed to be clear." || text === "our process";
    });
    if (!heading) return null;
    target = heading.closest("section") || heading;
    target.id = "publishing-process";
    target.dataset.mmgPageShell = BUILD;
    return target;
  }

  function repairProjectGuideLinks(main) {
    const target = ensurePublishingProcessTarget(main);
    if (!target) return 0;
    let repaired = 0;
    Array.from(main.querySelectorAll("a[href]")).forEach(function(anchor) {
      let parsed;
      try { parsed = new URL(anchor.href, window.location.origin); } catch { return; }
      if (parsed.origin !== window.location.origin || parsed.pathname.replace(/\/+$/, "") !== "/pages/project-guide") return;
      anchor.setAttribute("href", "/pages/publishing-services#publishing-process");
      anchor.dataset.mmgLinkRepaired = "true";
      const text = normalize(anchor.textContent);
      if (text === "View the Project Guide") anchor.textContent = "View the Publishing Process";
      else if (text === "Read the Project Guide") anchor.textContent = "Read the Publishing Process";
      else if (text === "Project Guide") anchor.textContent = "Publishing Process";
      repaired += 1;
    });
    return repaired;
  }

  function hidePublishingDirectory(main) {
    const heading = Array.from(main.querySelectorAll("h2,h3,[role='heading']")).find(function(element) {
      return normalize(element.textContent).toLowerCase() === "explore mindset media group™";
    });
    if (!heading) return false;
    const candidate = heading.closest("section") || heading.parentElement;
    if (!candidate || candidate === main || candidate.classList.contains("mmg-page-directory-hidden")) return false;
    candidate.classList.add("mmg-page-directory-hidden");
    candidate.setAttribute("aria-hidden", "true");
    candidate.dataset.mmgPageShell = BUILD;
    return true;
  }

  function hideToolkitMiniNavigation(main) {
    const anchors = Array.from(main.querySelectorAll("a"));
    const home = anchors.find(function(anchor) { return normalize(anchor.textContent) === "MMG Home"; });
    if (!home) return false;
    let candidate = home.parentElement;
    for (let depth = 0; candidate && candidate !== main && depth < 5; depth += 1, candidate = candidate.parentElement) {
      const labels = Array.from(candidate.querySelectorAll("a")).map(function(anchor) { return normalize(anchor.textContent); });
      const required = ["MMG Home", "Knowledge Library", "Creator’s Bible", "AI Guide", "CapCut Templates"];
      const complete = required.every(function(label) { return labels.includes(label); });
      if (complete && labels.length <= 8 && normalize(candidate.textContent).length < 500) {
        if (candidate.classList.contains("mmg-page-mini-navigation-hidden")) return false;
        candidate.classList.add("mmg-page-mini-navigation-hidden");
        candidate.setAttribute("aria-hidden", "true");
        candidate.dataset.mmgPageShell = BUILD;
        return true;
      }
    }
    return false;
  }

  function install() {
    const key = pathKey();
    const rule = RULES[key];
    if (!rule) return false;
    const main = document.querySelector("main");
    if (!main) return false;

    document.documentElement.dataset.mmgPageShell = BUILD;
    document.documentElement.dataset.mmgPageShellPage = key.split("/").filter(Boolean).pop() || "page";
    hideDuplicateNativeTitle(main, rule);
    if (rule.repairProjectGuideLinks) repairProjectGuideLinks(main);
    if (rule.normalizeFooter === "publishing-directory") hidePublishingDirectory(main);
    if (rule.normalizeFooter === "toolkit-mini-navigation") hideToolkitMiniNavigation(main);
    return true;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  let attempts = 0;
  const timer = window.setInterval(function() {
    attempts += 1;
    install();
    if (attempts >= 40) window.clearInterval(timer);
  }, 250);

  const observer = new MutationObserver(function() { install(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(function() { observer.disconnect(); }, 12000);
})();`;
}

function injectPageShellAssets(source) {
  const block = `${MARKER_START}\n{{ 'mmg-page-shell.css' | asset_url | stylesheet_tag }}\n<script src="{{ 'mmg-page-shell.js' | asset_url }}" defer="defer"></script>\n${MARKER_END}`;
  const cleaned = String(source || "").trimEnd();
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `${block}\n</head>`);
  if (/<\/body>/i.test(cleaned)) return cleaned.replace(/<\/body>/i, `${block}\n</body>`);
  throw httpError(409, "page_shell_layout_invalid", `${LAYOUT_FILE} contains neither </head> nor </body>.`);
}

function stripManagedBlock(source) {
  const pattern = new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`, "g");
  return String(source || "").replace(pattern, "");
}

async function getMainTheme(config, auth) {
  const data = await shopifyGraphQL(config, auth, `query KairosPageShellMainTheme { themes(first: 20) { nodes { id name role processing processingFailed } } }`, {});
  const main = (data?.themes?.nodes || []).find((theme) => String(theme?.role || "").toUpperCase() === "MAIN");
  if (!main?.id) throw httpError(409, "page_shell_main_theme_not_found", "The published Shopify MAIN theme could not be identified.");
  if (main.processing || main.processingFailed) throw httpError(409, "page_shell_main_theme_not_ready", "The published Shopify MAIN theme is processing or failed processing.");
  return main;
}

async function readThemeFiles(config, auth, themeId, filenames) {
  const data = await shopifyGraphQL(config, auth, `query KairosPageShellFiles($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } userErrors { code filename } } } }`, { themeId, filenames, first: filenames.length });
  const connection = data?.theme?.files;
  const errors = (connection?.userErrors || []).filter((item) => item?.code && item.code !== "NOT_FOUND");
  if (errors.length) throw httpError(502, "page_shell_file_read_failed", errors.map((item) => item.code).join("; "));
  const output = [];
  for (const filename of filenames) {
    const node = (connection?.nodes || []).find((item) => item?.filename === filename);
    const content = bodyToText(node?.body);
    if (content) output.push({ filename, content, sha256: await hashText(content) });
  }
  return output;
}

async function verifyReadBack(config, auth, themeId, candidates) {
  for (let attempt = 1; attempt <= READ_BACK_ATTEMPTS; attempt += 1) {
    const actualFiles = await readThemeFiles(config, auth, themeId, candidates.map((file) => file.filename));
    const actualMap = new Map(actualFiles.map((file) => [file.filename, file]));
    let valid = true;
    for (const candidate of candidates) {
      const actual = actualMap.get(candidate.filename);
      const expectedHash = await hashText(candidate.content);
      if (!actual || actual.content !== candidate.content || actual.sha256 !== expectedHash) valid = false;
    }
    if (valid) return;
    if (attempt < READ_BACK_ATTEMPTS) await delay(READ_BACK_DELAY_MS);
  }
  throw httpError(502, "page_shell_theme_readback_failed", "Shopify did not preserve the exact MMG page-shell files.");
}

async function restoreFiles(env, themeId, candidates, beforeMap) {
  const restore = candidates.filter((file) => beforeMap.has(file.filename)).map((file) => ({ filename: file.filename, content: beforeMap.get(file.filename).content }));
  const remove = candidates.filter((file) => !beforeMap.has(file.filename)).map((file) => file.filename);
  if (restore.length) await writeThemeFiles(env, themeId, restore);
  if (remove.length) await deleteThemeFiles(env, themeId, remove);
}

function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "page_shell_shopify_invalid_domain", "The Shopify store domain is invalid.");
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) throw httpError(503, "page_shell_shopify_invalid_version", "The Shopify API version is invalid.");
  return { storeDomain, apiVersion };
}

async function resolveAccessToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const cacheKey = `${config.storeDomain}:${clientId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached?.expiresAt > Date.now()) return { token: cached.token };
    const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
    });
    const body = await safeResponseJSON(response);
    const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
    if (!response.ok || !token) throw httpError(401, "page_shell_shopify_client_credentials_invalid", body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`);
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { token };
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw httpError(503, "page_shell_shopify_not_configured", "Shopify credentials are not configured.");
  return { token };
}

async function shopifyGraphQL(config, auth, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeResponseJSON(response);
  if (!response.ok) throw httpError(response.status, "page_shell_shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  if (body?.errors?.length) throw httpError(422, "page_shell_shopify_graphql_error", body.errors.map((item) => item?.message).filter(Boolean).join("; "));
  return body?.data || {};
}

function summarizeTheme(theme) { return { id: theme.id, name: theme.name, role: theme.role }; }
function bodyToText(body) { if (typeof body?.content === "string") return body.content; if (typeof body?.contentBase64 === "string") { try { return atob(body.contentBase64); } catch {} } return ""; }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function safeRequestJSON(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Page-Shell": KAIROS_PAGE_SHELL_BUILD, "X-Content-Type-Options": "nosniff" } }); }
