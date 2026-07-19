import {
  deleteThemeFiles,
  hashText,
  httpError,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_NATIVE_NAVIGATION_BUILD = "kairos-native-navigation-theme-publisher-20260719-9";
export const NATIVE_NAVIGATION_PATH = "/api/shopify/navigation/publish";
export const NATIVE_NAVIGATION_CONFIRMATION = "PUBLISH_MMG_NATIVE_MAIN_NAVIGATION";

const SHOPIFY_TIMEOUT_MS = 25_000;
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 500;
const LAYOUT_FILE = "layout/theme.liquid";
const CSS_FILE = "assets/mmg-canonical-navigation.css";
const JS_FILE = "assets/mmg-canonical-navigation.js";
const MARKER_START = "<!-- MMG_CANONICAL_NAVIGATION_START -->";
const MARKER_END = "<!-- MMG_CANONICAL_NAVIGATION_END -->";
const tokenCache = new Map();

const LEGACY_MARKERS = [
  ["<!-- MMG_THEME_MENU_HOTFIX_START -->", "<!-- MMG_THEME_MENU_HOTFIX_END -->"],
  ["<!-- MMG_ALL_THEME_NAV_START -->", "<!-- MMG_ALL_THEME_NAV_END -->"],
  ["<!-- MMG_LIVE_HEADER_NAV_START -->", "<!-- MMG_LIVE_HEADER_NAV_END -->"],
  [MARKER_START, MARKER_END],
];

const NAVIGATION = [
  {
    title: "Shop",
    items: [
      { title: "All Products", url: "/collections/all" },
    ],
  },
  {
    title: "Create & Learn",
    items: [
      { title: "Free Creator Toolkit", url: "/pages/free-creator-toolkit" },
      { title: "CapCut Templates", url: "/pages/capcut-templates" },
    ],
  },
  {
    title: "Services",
    items: [
      { title: "Publishing Services", url: "/pages/publishing-services" },
      { title: "Customer Portal", url: "/pages/customer-portal" },
    ],
  },
  {
    title: "Company",
    items: [
      { title: "Company Overview", url: "/pages/about" },
      { title: "Founder", url: "/pages/founder" },
      { title: "Our Standards", url: "/pages/our-standards" },
      { title: "Publishing Philosophy", url: "/pages/publishing-philosophy" },
      { title: "Contact", url: "/pages/contact" },
    ],
  },
  {
    title: "Support",
    items: [
      { title: "Customer Portal", url: "/pages/customer-portal" },
      { title: "Contact", url: "/pages/contact" },
      { title: "Privacy Policy", url: "/policies/privacy-policy" },
      { title: "Terms of Service", url: "/policies/terms-of-service" },
      { title: "Refund Policy", url: "/policies/refund-policy" },
      { title: "Shipping Policy", url: "/policies/shipping-policy" },
    ],
  },
];

const CSS_SOURCE = String.raw`/* MMG canonical navigation · kairos-native-navigation-theme-publisher-20260719-9 */
.mmg-canonical-nav{align-items:center;display:flex;gap:clamp(.8rem,1.45vw,1.8rem);list-style:none;margin:0;padding:0}
.mmg-canonical-nav>li{position:relative}
.mmg-canonical-nav a,.mmg-canonical-nav summary{color:rgba(var(--color-foreground),.86);cursor:pointer;font:inherit;font-size:1.4rem;line-height:1.3;list-style:none;padding:1.1rem .15rem;text-decoration:none;white-space:nowrap}
.mmg-canonical-nav a:hover,.mmg-canonical-nav summary:hover,.mmg-canonical-nav a:focus-visible,.mmg-canonical-nav summary:focus-visible{color:rgb(var(--color-foreground));text-decoration:underline;text-underline-offset:.3rem}
.mmg-canonical-nav summary{align-items:center;display:flex;gap:.4rem}
.mmg-canonical-nav summary::-webkit-details-marker,.mmg-canonical-drawer summary::-webkit-details-marker{display:none}
.mmg-canonical-nav summary:after{content:"⌄";font-size:1.05rem;line-height:1;transform:translateY(-.1rem)}
.mmg-canonical-nav__submenu{background:rgb(var(--color-background));border:1px solid rgba(var(--color-foreground),.12);border-radius:1rem;box-shadow:0 1.2rem 3rem rgba(0,0,0,.14);display:grid;gap:.15rem;left:50%;list-style:none;margin:0;min-width:25rem;padding:.8rem;position:absolute;top:calc(100% - .2rem);transform:translateX(-50%);z-index:50}
.mmg-canonical-nav__submenu a{border-radius:.65rem;display:block;padding:.9rem 1.1rem;white-space:normal}
.mmg-canonical-nav__submenu a:hover,.mmg-canonical-nav__submenu a:focus-visible{background:rgba(var(--color-foreground),.06);text-decoration:none}
.mmg-canonical-drawer{display:grid;list-style:none;margin:0;padding:0}
.mmg-canonical-drawer>li{border-bottom:1px solid rgba(var(--color-foreground),.08)}
.mmg-canonical-drawer a,.mmg-canonical-drawer summary{align-items:center;color:rgb(var(--color-foreground));display:flex;font-size:1.8rem;justify-content:space-between;line-height:1.3;padding:1.25rem 2rem;text-decoration:none}
.mmg-canonical-drawer summary{cursor:pointer;list-style:none}
.mmg-canonical-drawer summary:after{content:"+"}
.mmg-canonical-drawer details[open]>summary:after{content:"−"}
.mmg-canonical-drawer__submenu{display:grid;list-style:none;margin:0;padding:0 0 .8rem 1.4rem}
.mmg-canonical-drawer__submenu a{font-size:1.55rem;padding:.9rem 2rem}
@media(max-width:989px){.header__inline-menu .mmg-canonical-nav{display:none!important}}
@media(min-width:990px){.mmg-canonical-drawer{display:none!important}}
`;

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
  const filenames = await listThemeFiles(config, auth, mainTheme.id);
  const headerCandidates = filenames.filter((filename) => /^(sections|snippets)\/.*(header|menu|navigation).*\.liquid$/i.test(filename));
  const managedNames = [...new Set([LAYOUT_FILE, CSS_FILE, JS_FILE, ...headerCandidates])];
  const beforeFiles = await readThemeFiles(config, auth, mainTheme.id, managedNames);
  const beforeMap = new Map(beforeFiles.map((file) => [file.filename, file]));
  const layoutBefore = beforeMap.get(LAYOUT_FILE)?.content;
  if (!layoutBefore) throw httpError(409, "live_theme_layout_unavailable", `${LAYOUT_FILE} was not readable from the published Shopify MAIN theme.`);

  const jsSource = buildNavigationRuntime();
  const updates = [
    { filename: LAYOUT_FILE, content: injectNavigationAssets(stripLegacyBlocks(layoutBefore)) },
    { filename: CSS_FILE, content: CSS_SOURCE },
    { filename: JS_FILE, content: jsSource },
  ];

  const cleanedLegacyFiles = [];
  for (const filename of headerCandidates) {
    const before = beforeMap.get(filename)?.content;
    if (!before) continue;
    const after = stripLegacyBlocks(before);
    if (after !== before) {
      updates.push({ filename, content: after });
      cleanedLegacyFiles.push(filename);
    }
  }

  await writeThemeFiles(env, mainTheme.id, updates);
  try {
    await verifyReadBack(config, auth, mainTheme.id, updates);
  } catch (failure) {
    await restoreFiles(env, mainTheme.id, updates, beforeMap);
    throw failure;
  }

  return json({
    status: "completed",
    build: KAIROS_NATIVE_NAVIGATION_BUILD,
    completedAt: new Date().toISOString(),
    summary: "Published the approved five-group MMG navigation into the verified Shopify MAIN theme and removed conflicting legacy navigation runtimes.",
    navigation: {
      strategy: "verified-main-theme-canonical-runtime",
      topLevel: NAVIGATION.map((group) => ({ title: group.title, children: group.items.length })),
      desktop: true,
      mobileDrawer: true,
      preservedControls: ["hamburger", "search", "account", "cart"],
    },
    theme: summarizeTheme(mainTheme),
    files: await Promise.all(updates.map(async (file) => ({
      filename: file.filename,
      beforeSha256: beforeMap.get(file.filename)?.sha256 || null,
      afterSha256: await hashText(file.content),
      changed: beforeMap.get(file.filename)?.content !== file.content,
    }))),
    cleanup: {
      legacyRuntimeBlocksRemoved: true,
      cleanedLegacyFiles,
    },
    verification: {
      valid: true,
      exactThemeFileReadBack: true,
      layoutInjectionPresent: true,
      canonicalTopLevel: NAVIGATION.map((group) => group.title),
      legacyRuntimeBlocksRemoved: true,
    },
    safeguards: {
      mainThemeRoleVerified: String(mainTheme.role).toUpperCase() === "MAIN",
      liveThemeChanged: true,
      rollbackOnReadBackFailure: true,
      nativeHeaderControlsPreserved: true,
      broadHeaderReplacementPrevented: true,
      workersAIUsed: false,
    },
  });
}

function buildNavigationRuntime() {
  return String.raw`(() => {
  "use strict";
  const BUILD = "${KAIROS_NATIVE_NAVIGATION_BUILD}";
  const LINKS = ${JSON.stringify(NAVIGATION)};

  function escapeHTML(value) {
    return String(value ?? "")
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;");
  }

  function childHTML(item) {
    return '<li><a href="' + escapeHTML(item.url) + '">' + escapeHTML(item.title) + '</a></li>';
  }

  function desktopHTML() {
    return '<ul class="mmg-canonical-nav list-menu list-menu--inline" role="list" data-mmg-navigation-build="' + BUILD + '">' + LINKS.map(function(group) {
      return '<li><details class="mmg-canonical-nav__group"><summary class="header__menu-item list-menu__item link focus-inset"><span>' + escapeHTML(group.title) + '</span></summary><ul class="mmg-canonical-nav__submenu" role="list">' + group.items.map(childHTML).join("") + '</ul></details></li>';
    }).join("") + '</ul>';
  }

  function drawerHTML() {
    return '<ul class="mmg-canonical-drawer" role="list" data-mmg-navigation-build="' + BUILD + '">' + LINKS.map(function(group) {
      return '<li><details><summary>' + escapeHTML(group.title) + '</summary><ul class="mmg-canonical-drawer__submenu" role="list">' + group.items.map(childHTML).join("") + '</ul></details></li>';
    }).join("") + '</ul>';
  }

  function install() {
    const desktop = document.querySelector('header .header__inline-menu');
    if (desktop && desktop.dataset.mmgCanonicalNavigation !== BUILD) {
      desktop.innerHTML = desktopHTML();
      desktop.dataset.mmgCanonicalNavigation = BUILD;
    }

    const drawer = document.querySelector('#menu-drawer .menu-drawer__navigation, .menu-drawer .menu-drawer__navigation');
    if (drawer && drawer.dataset.mmgCanonicalNavigation !== BUILD) {
      drawer.innerHTML = drawerHTML();
      drawer.dataset.mmgCanonicalNavigation = BUILD;
    }

    if (desktop || drawer) document.documentElement.dataset.mmgCanonicalNavigation = BUILD;
    return Boolean(desktop || drawer);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  let attempts = 0;
  const timer = window.setInterval(function() {
    attempts += 1;
    if (install() || attempts >= 60) window.clearInterval(timer);
  }, 150);

  const observer = new MutationObserver(function() { install(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(function() { observer.disconnect(); }, 15000);
})();`;
}

function injectNavigationAssets(source) {
  const block = `${MARKER_START}\n{{ 'mmg-canonical-navigation.css' | asset_url | stylesheet_tag }}\n<script src="{{ 'mmg-canonical-navigation.js' | asset_url }}" defer="defer"></script>\n${MARKER_END}`;
  const cleaned = String(source || "").trimEnd();
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `${block}\n</head>`);
  if (/<\/body>/i.test(cleaned)) return cleaned.replace(/<\/body>/i, `${block}\n</body>`);
  throw httpError(409, "live_theme_layout_invalid", `${LAYOUT_FILE} contains neither </head> nor </body>.`);
}

function stripLegacyBlocks(source) {
  let output = String(source || "");
  for (const [startMarker, endMarker] of LEGACY_MARKERS) {
    const pattern = new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`, "g");
    output = output.replace(pattern, "");
  }
  return output;
}

async function getMainTheme(config, auth) {
  const data = await shopifyGraphQL(config, auth, `query KairosMainTheme { themes(first: 20) { nodes { id name role processing processingFailed } } }`, {});
  const main = (data?.themes?.nodes || []).find((theme) => String(theme?.role || "").toUpperCase() === "MAIN");
  if (!main?.id) throw httpError(409, "main_theme_not_found", "The published Shopify MAIN theme could not be identified.");
  if (main.processing || main.processingFailed) throw httpError(409, "main_theme_not_ready", "The published Shopify MAIN theme is processing or failed processing.");
  return main;
}

async function listThemeFiles(config, auth, themeId) {
  const data = await shopifyGraphQL(config, auth, `query KairosNavigationThemeFileNames($themeId: ID!) { theme(id: $themeId) { files(first: 250) { nodes { filename } } } }`, { themeId });
  return (data?.theme?.files?.nodes || []).map((node) => node?.filename).filter(Boolean);
}

async function readThemeFiles(config, auth, themeId, filenames) {
  const output = [];
  for (let index = 0; index < filenames.length; index += 40) {
    const batch = filenames.slice(index, index + 40);
    const data = await shopifyGraphQL(config, auth, `query KairosNavigationThemeFiles($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } userErrors { code filename } } } }`, { themeId, filenames: batch, first: batch.length });
    const connection = data?.theme?.files;
    const errors = (connection?.userErrors || []).filter((item) => item?.code && item.code !== "NOT_FOUND");
    if (errors.length) throw httpError(502, "theme_file_read_failed", errors.map((item) => item.code).join("; "));
    for (const filename of batch) {
      const node = (connection?.nodes || []).find((item) => item?.filename === filename);
      const content = bodyToText(node?.body);
      if (content) output.push({ filename, content, sha256: await hashText(content) });
    }
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
  throw httpError(502, "native_navigation_theme_readback_failed", "Shopify did not preserve the exact canonical navigation files.");
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
  if (body?.errors?.length) throw httpError(422, "shopify_graphql_error", body.errors.map((item) => item?.message).filter(Boolean).join("; "));
  return body?.data || {};
}

function summarizeTheme(theme) { return { id: theme.id, name: theme.name, role: theme.role }; }
function bodyToText(body) { if (typeof body?.content === "string") return body.content; if (typeof body?.contentBase64 === "string") { try { return atob(body.contentBase64); } catch {} } return ""; }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function safeRequestJSON(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Native-Navigation": KAIROS_NATIVE_NAVIGATION_BUILD, "X-Content-Type-Options": "nosniff" } }); }
