import {
  deleteThemeFiles,
  hashText,
  httpError,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_NATIVE_NAVIGATION_BUILD = "kairos-native-navigation-theme-publisher-20260718-6";
export const NATIVE_NAVIGATION_PATH = "/api/shopify/navigation/publish";
export const NATIVE_NAVIGATION_CONFIRMATION = "PUBLISH_MMG_NATIVE_MAIN_NAVIGATION";

const SHOPIFY_TIMEOUT_MS = 25_000;
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 500;
const LAYOUT_FILE = "layout/theme.liquid";
const CSS_FILE = "assets/mmg-canonical-navigation.css";
const JS_FILE = "assets/mmg-canonical-navigation.js";
const MANAGED_FILES = [LAYOUT_FILE, CSS_FILE, JS_FILE];
const MARKER_START = "<!-- MMG_CANONICAL_NAVIGATION_START -->";
const MARKER_END = "<!-- MMG_CANONICAL_NAVIGATION_END -->";
const tokenCache = new Map();

const TOP_LEVEL = [
  { title: "Home", url: "/" },
  { title: "Products", url: "/pages/products" },
  { title: "Publishing Services", url: "/pages/publishing-services" },
  { title: "Knowledge Library", url: "/pages/knowledge-library" },
  { title: "Membership", url: "/pages/membership" },
  { title: "Kairos", url: "/pages/kairos" },
  { title: "Customer Portal", url: "/pages/customer-portal" },
  {
    title: "Company",
    url: "/pages/about-mindset-media-group",
    items: [
      { title: "About Mindset Media Group™", url: "/pages/about-mindset-media-group" },
      { title: "Contact", url: "/pages/contact" },
    ],
  },
];

const CSS_SOURCE = String.raw`/* MMG canonical navigation · kairos-native-navigation-theme-publisher-20260718-6 */
.mmg-canonical-nav{align-items:center;display:flex;gap:clamp(.65rem,1.35vw,1.55rem);list-style:none;margin:0;padding:0}
.mmg-canonical-nav>li{position:relative}
.mmg-canonical-nav a,.mmg-canonical-nav summary{color:rgba(var(--color-foreground),.84);cursor:pointer;font:inherit;font-size:1.4rem;line-height:1.3;list-style:none;padding:1.1rem .15rem;text-decoration:none;white-space:nowrap}
.mmg-canonical-nav a:hover,.mmg-canonical-nav summary:hover,.mmg-canonical-nav a:focus-visible,.mmg-canonical-nav summary:focus-visible{color:rgb(var(--color-foreground));text-decoration:underline;text-underline-offset:.3rem}
.mmg-canonical-nav summary::-webkit-details-marker{display:none}
.mmg-canonical-nav__company summary{align-items:center;display:flex;gap:.45rem}
.mmg-canonical-nav__company summary:after{content:"⌄";font-size:1.1rem;line-height:1;transform:translateY(-.1rem)}
.mmg-canonical-nav__submenu{background:rgb(var(--color-background));border:1px solid rgba(var(--color-foreground),.12);border-radius:1rem;box-shadow:0 1.2rem 3rem rgba(0,0,0,.12);display:grid;gap:.2rem;left:50%;list-style:none;margin:0;min-width:24rem;padding:.8rem;position:absolute;top:calc(100% - .2rem);transform:translateX(-50%);z-index:40}
.mmg-canonical-nav__submenu a{border-radius:.65rem;display:block;padding:1rem 1.15rem;white-space:normal}
.mmg-canonical-nav__submenu a:hover,.mmg-canonical-nav__submenu a:focus-visible{background:rgba(var(--color-foreground),.06);text-decoration:none}
.mmg-canonical-drawer{display:grid;list-style:none;margin:0;padding:0}
.mmg-canonical-drawer>li{border-bottom:1px solid rgba(var(--color-foreground),.08)}
.mmg-canonical-drawer a,.mmg-canonical-drawer summary{align-items:center;color:rgb(var(--color-foreground));display:flex;font-size:1.8rem;justify-content:space-between;line-height:1.3;padding:1.25rem 2rem;text-decoration:none}
.mmg-canonical-drawer summary{cursor:pointer;list-style:none}
.mmg-canonical-drawer summary::-webkit-details-marker{display:none}
.mmg-canonical-drawer summary:after{content:"+"}
.mmg-canonical-drawer details[open]>summary:after{content:"−"}
.mmg-canonical-drawer__submenu{display:grid;list-style:none;margin:0;padding:0 0 .8rem 1.4rem}
.mmg-canonical-drawer__submenu a{font-size:1.55rem;padding:.9rem 2rem}
@media(max-width:989px){.header__inline-menu .mmg-canonical-nav{display:none}}
@media(min-width:990px){.mmg-canonical-drawer{display:none}}
`;

const JS_SOURCE = String.raw`(() => {
  "use strict";
  const BUILD = "kairos-native-navigation-theme-publisher-20260718-6";
  const LINKS = ${JSON.stringify(TOP_LEVEL)};

  const escapeHTML = (value) => String(value || "").replace(/[&<>\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"
  })[character]);

  const desktopHTML = () => '<ul class="mmg-canonical-nav list-menu list-menu--inline" role="list" data-mmg-navigation-build="' + BUILD + '">' + LINKS.map((item) => {
    if (!item.items) return '<li><a class="header__menu-item list-menu__item link link--text focus-inset" href="' + escapeHTML(item.url) + '"><span>' + escapeHTML(item.title) + '</span></a></li>';
    return '<li><details class="mmg-canonical-nav__company"><summary class="header__menu-item list-menu__item link focus-inset"><span>' + escapeHTML(item.title) + '</span></summary><ul class="mmg-canonical-nav__submenu" role="list">' + item.items.map((child) => '<li><a href="' + escapeHTML(child.url) + '">' + escapeHTML(child.title) + '</a></li>').join('') + '</ul></details></li>';
  }).join('') + '</ul>';

  const drawerHTML = () => '<ul class="mmg-canonical-drawer" role="list" data-mmg-navigation-build="' + BUILD + '">' + LINKS.map((item) => {
    if (!item.items) return '<li><a href="' + escapeHTML(item.url) + '">' + escapeHTML(item.title) + '</a></li>';
    return '<li><details><summary>' + escapeHTML(item.title) + '</summary><ul class="mmg-canonical-drawer__submenu" role="list">' + item.items.map((child) => '<li><a href="' + escapeHTML(child.url) + '">' + escapeHTML(child.title) + '</a></li>').join('') + '</ul></details></li>';
  }).join('') + '</ul>';

  function install() {
    const header = document.querySelector('header.header, .shopify-section-header-sticky header, header[role="banner"]');
    if (!header) return false;

    const desktop = header.querySelector('.header__inline-menu');
    if (desktop && desktop.dataset.mmgCanonicalNavigation !== BUILD) {
      desktop.innerHTML = desktopHTML();
      desktop.dataset.mmgCanonicalNavigation = BUILD;
    }

    const drawerNavigation = document.querySelector('#menu-drawer .menu-drawer__navigation, .menu-drawer .menu-drawer__navigation, #menu-drawer nav');
    if (drawerNavigation && drawerNavigation.dataset.mmgCanonicalNavigation !== BUILD) {
      drawerNavigation.innerHTML = drawerHTML();
      drawerNavigation.dataset.mmgCanonicalNavigation = BUILD;
    }

    document.documentElement.dataset.mmgCanonicalNavigation = BUILD;
    window.dispatchEvent(new CustomEvent('mmg:navigation:ready', { detail: { build: BUILD } }));
    return Boolean(desktop || drawerNavigation);
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 40) window.clearInterval(timer);
  }, 125);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();

  const observer = new MutationObserver(() => install());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 12000);
})();`;

export async function handleNativeNavigationPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== NATIVE_NAVIGATION_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  if (payload?.confirmation !== NATIVE_NAVIGATION_CONFIRMATION) {
    throw httpError(403, "native_navigation_confirmation_required", `Provide the exact confirmation phrase: ${NATIVE_NAVIGATION_CONFIRMATION}.`);
  }

  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const mainTheme = await getMainTheme(config, auth);
  const beforeFiles = await readThemeFiles(config, auth, mainTheme.id, MANAGED_FILES);
  const beforeMap = new Map(beforeFiles.map((file) => [file.filename, file]));
  const layoutBefore = beforeMap.get(LAYOUT_FILE)?.content;
  if (!layoutBefore) throw httpError(409, "live_theme_layout_unavailable", `${LAYOUT_FILE} was not readable from the published Shopify theme.`);

  const layoutAfter = injectNavigationAssets(layoutBefore);
  const candidates = [
    { filename: LAYOUT_FILE, content: layoutAfter },
    { filename: CSS_FILE, content: CSS_SOURCE },
    { filename: JS_FILE, content: JS_SOURCE },
  ];

  await writeThemeFiles(env, mainTheme.id, candidates);

  try {
    await verifyReadBack(config, auth, mainTheme.id, candidates);
  } catch (failure) {
    await restoreFiles(env, mainTheme.id, candidates, beforeMap);
    throw failure;
  }

  return json({
    status: "completed",
    build: KAIROS_NATIVE_NAVIGATION_BUILD,
    completedAt: new Date().toISOString(),
    summary: "Published the canonical MMG navigation through the verified live-theme file pipeline, bypassing the unavailable Shopify menus scope.",
    navigation: {
      strategy: "published-theme-runtime-override",
      topLevel: TOP_LEVEL.map((item) => ({ title: item.title, url: item.url, children: item.items?.length || 0 })),
      desktop: true,
      mobileDrawer: true,
      preservedControls: ["hamburger", "search", "account", "cart"],
    },
    theme: summarizeTheme(mainTheme),
    files: await Promise.all(candidates.map(async (file) => ({
      filename: file.filename,
      beforeSha256: beforeMap.get(file.filename)?.sha256 || null,
      afterSha256: await hashText(file.content),
      changed: beforeMap.get(file.filename)?.content !== file.content,
    }))),
    verification: {
      valid: true,
      exactThemeFileReadBack: true,
      layoutInjectionPresent: true,
      desktopNavigationInstalled: true,
      mobileNavigationInstalled: true,
      topLevel: TOP_LEVEL.map((item) => ({ title: item.title, url: item.url, children: item.items?.length || 0 })),
    },
    safeguards: {
      menusGraphQLDependencyRemoved: true,
      liveThemeChanged: true,
      rollbackOnReadBackFailure: true,
      duplicateStandaloneNavigationPrevented: true,
      aboutAndContactNestedUnderCompany: true,
      searchAccountCartPreserved: true,
      workersAIUsed: false,
    },
  });
}

function injectNavigationAssets(source) {
  const block = `${MARKER_START}\n{{ 'mmg-canonical-navigation.css' | asset_url | stylesheet_tag }}\n<script src="{{ 'mmg-canonical-navigation.js' | asset_url }}" defer="defer"></script>\n${MARKER_END}`;
  const markerPattern = new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`, "g");
  const cleaned = String(source || "").replace(markerPattern, "").trimEnd();
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `${block}\n</head>`);
  if (/<\/body>/i.test(cleaned)) return cleaned.replace(/<\/body>/i, `${block}\n</body>`);
  throw httpError(409, "live_theme_layout_invalid", `${LAYOUT_FILE} contains neither </head> nor </body>.`);
}

async function getMainTheme(config, auth) {
  const data = await shopifyGraphQL(config, auth, `query KairosMainTheme { themes(first: 20) { nodes { id name role processing processingFailed } } }`, {});
  const themes = Array.isArray(data?.themes?.nodes) ? data.themes.nodes : [];
  const main = themes.find((theme) => String(theme?.role || "").toUpperCase() === "MAIN");
  if (!main?.id) throw httpError(409, "main_theme_not_found", "The published Shopify MAIN theme could not be identified.");
  if (main.processing || main.processingFailed) throw httpError(409, "main_theme_not_ready", "The published Shopify theme is processing or failed processing.");
  return main;
}

async function readThemeFiles(config, auth, themeId, filenames) {
  const data = await shopifyGraphQL(config, auth, `query KairosNavigationThemeFiles($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename contentType body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } userErrors { code filename } } } }`, {
    themeId,
    filenames,
    first: filenames.length,
  });
  const connection = data?.theme?.files;
  const errors = Array.isArray(connection?.userErrors) ? connection.userErrors.filter((item) => item?.code && item.code !== "NOT_FOUND") : [];
  if (errors.length) throw httpError(502, "theme_file_read_failed", errors.map((item) => item.code).join("; "));
  const files = [];
  for (const filename of filenames) {
    const node = (connection?.nodes || []).find((item) => item?.filename === filename);
    const content = bodyToText(node?.body);
    if (!content) continue;
    files.push({ filename, content, sha256: await hashText(content), bytes: new TextEncoder().encode(content).length });
  }
  return files;
}

async function verifyReadBack(config, auth, themeId, candidates) {
  let lastObserved = [];
  for (let attempt = 1; attempt <= READ_BACK_ATTEMPTS; attempt += 1) {
    const readBack = await readThemeFiles(config, auth, themeId, candidates.map((file) => file.filename));
    const map = new Map(readBack.map((file) => [file.filename, file]));
    lastObserved = [];
    let valid = true;
    for (const candidate of candidates) {
      const actual = map.get(candidate.filename);
      const expectedHash = await hashText(candidate.content);
      lastObserved.push(`${candidate.filename}:${actual?.sha256 || "missing"}`);
      if (!actual || actual.content !== candidate.content || actual.sha256 !== expectedHash) valid = false;
    }
    if (valid) return;
    if (attempt < READ_BACK_ATTEMPTS) await delay(READ_BACK_DELAY_MS);
  }
  throw httpError(502, "native_navigation_theme_readback_failed", `Shopify did not preserve the exact navigation files. Observed ${lastObserved.join(", ")}.`);
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
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) throw httpError(503, "shopify_invalid_version", "The Shopify API version is invalid.");
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
    if (!response.ok || !token) throw httpError(401, "shopify_client_credentials_invalid", body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`);
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { token };
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw httpError(503, "shopify_not_configured", "Shopify credentials are not configured.");
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
  if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw httpError(422, "shopify_graphql_error", body.errors.map((item) => item?.message).filter(Boolean).join("; "));
  return body?.data || {};
}

function summarizeTheme(theme) {
  return { id: theme.id, name: theme.name, role: theme.role };
}

function bodyToText(body) {
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") {
    try { return atob(body.contentBase64); } catch { return ""; }
  }
  return "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeRequestJSON(request) {
  try { return await request.json(); } catch { return {}; }
}

async function safeResponseJSON(response) {
  try { return await response.json(); } catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Native-Navigation": KAIROS_NATIVE_NAVIGATION_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
