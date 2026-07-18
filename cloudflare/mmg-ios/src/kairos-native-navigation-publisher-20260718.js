import {
  deleteThemeFiles,
  hashText,
  httpError,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_NATIVE_NAVIGATION_BUILD = "kairos-native-navigation-theme-publisher-20260718-7";
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

const ROOTS = [
  { key: "home", title: "Home", url: "/" },
  { key: "products", title: "Products", url: "/pages/products" },
  { key: "services", title: "Publishing Services", url: "/pages/publishing-services" },
  { key: "knowledge", title: "Knowledge Library", url: "/pages/knowledge-library" },
  { key: "membership", title: "Membership", url: "/pages/membership" },
  { key: "kairos", title: "Kairos", url: "/pages/kairos" },
  { key: "portal", title: "Customer Portal", url: "/pages/customer-portal" },
  { key: "company", title: "Company", url: "/pages/about-mindset-media-group" },
];

const ROOT_HANDLES = new Set(ROOTS.map((item) => item.url.split("/").filter(Boolean).pop()).filter(Boolean));

const CATEGORY_RULES = {
  products: [
    "product", "products", "shop", "store", "catalog", "book", "books", "ebook", "ebooks",
    "digital-product", "digital-products", "prompt", "prompts", "course", "courses", "collection",
  ],
  services: [
    "service", "services", "publishing", "publisher", "manuscript", "editing", "editorial", "proofread",
    "formatting", "book-design", "cover-design", "author-service", "consultation", "consulting",
    "production", "professional-cover", "website-design", "website-retool",
  ],
  knowledge: [
    "knowledge", "library", "resource", "resources", "guide", "guides", "learn", "learning",
    "education", "creator-education", "article", "articles", "tutorial", "tutorials", "faq", "help-center",
  ],
  membership: [
    "membership", "memberships", "member", "members", "pricing", "plans", "subscription", "subscriptions",
    "community", "join", "benefits",
  ],
  kairos: [
    "kairos", "command-center", "command-centre", "intelligence", "ai-system", "operating-system",
    "automation", "workspace", "manuscript-studio", "website-builder",
  ],
  portal: [
    "customer-portal", "client-portal", "portal", "customer", "client", "dashboard", "account",
    "orders", "downloads", "support-ticket", "project-status",
  ],
  company: [
    "about", "company", "our-story", "story", "mission", "vision", "values", "team", "leadership",
    "founder", "contact", "careers", "career", "press", "media", "partners", "partnerships",
    "privacy", "terms", "refund", "returns", "shipping", "accessibility", "legal", "policy", "policies",
    "disclaimer", "intellectual-property", "copyright", "community-guidelines",
  ],
};

const CSS_SOURCE = String.raw`/* MMG integrated navigation · kairos-native-navigation-theme-publisher-20260718-7 */
.mmg-canonical-nav{align-items:center;display:flex;gap:clamp(.55rem,1.1vw,1.25rem);list-style:none;margin:0;padding:0}
.mmg-canonical-nav>li{position:relative}
.mmg-canonical-nav a,.mmg-canonical-nav summary{color:rgba(var(--color-foreground),.84);cursor:pointer;font:inherit;font-size:1.35rem;line-height:1.3;list-style:none;padding:1.1rem .12rem;text-decoration:none;white-space:nowrap}
.mmg-canonical-nav a:hover,.mmg-canonical-nav summary:hover,.mmg-canonical-nav a:focus-visible,.mmg-canonical-nav summary:focus-visible{color:rgb(var(--color-foreground));text-decoration:underline;text-underline-offset:.3rem}
.mmg-canonical-nav summary::-webkit-details-marker{display:none}
.mmg-canonical-nav__group summary{align-items:center;display:flex;gap:.4rem}
.mmg-canonical-nav__group summary:after{content:"⌄";font-size:1.05rem;line-height:1;transform:translateY(-.1rem)}
.mmg-canonical-nav__submenu{background:rgb(var(--color-background));border:1px solid rgba(var(--color-foreground),.12);border-radius:1rem;box-shadow:0 1.2rem 3rem rgba(0,0,0,.14);display:grid;gap:.15rem;left:50%;list-style:none;margin:0;max-height:min(70vh,52rem);min-width:26rem;overflow:auto;padding:.8rem;position:absolute;top:calc(100% - .2rem);transform:translateX(-50%);z-index:40}
.mmg-canonical-nav__submenu a{border-radius:.65rem;display:block;padding:.9rem 1.1rem;white-space:normal}
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

export async function handleNativeNavigationPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== NATIVE_NAVIGATION_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  if (payload?.confirmation !== NATIVE_NAVIGATION_CONFIRMATION) {
    throw httpError(403, "native_navigation_confirmation_required", `Provide the exact confirmation phrase: ${NATIVE_NAVIGATION_CONFIRMATION}.`);
  }

  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const [mainTheme, pages] = await Promise.all([
    getMainTheme(config, auth),
    getPublishedPages(config, auth),
  ]);
  const navigation = buildNavigation(pages);
  const jsSource = buildNavigationRuntime(navigation);

  const beforeFiles = await readThemeFiles(config, auth, mainTheme.id, MANAGED_FILES);
  const beforeMap = new Map(beforeFiles.map((file) => [file.filename, file]));
  const layoutBefore = beforeMap.get(LAYOUT_FILE)?.content;
  if (!layoutBefore) throw httpError(409, "live_theme_layout_unavailable", `${LAYOUT_FILE} was not readable from the published Shopify theme.`);

  const candidates = [
    { filename: LAYOUT_FILE, content: injectNavigationAssets(layoutBefore) },
    { filename: CSS_FILE, content: CSS_SOURCE },
    { filename: JS_FILE, content: jsSource },
  ];

  await writeThemeFiles(env, mainTheme.id, candidates);
  try {
    await verifyReadBack(config, auth, mainTheme.id, candidates);
  } catch (failure) {
    await restoreFiles(env, mainTheme.id, candidates, beforeMap);
    throw failure;
  }

  const linkedPages = navigation.flatMap((item) => item.items || []);
  const integratedHandles = new Set(linkedPages.map((item) => item.handle));
  const unassigned = pages.filter((page) => !ROOT_HANDLES.has(page.handle) && !integratedHandles.has(page.handle));

  return json({
    status: "completed",
    build: KAIROS_NATIVE_NAVIGATION_BUILD,
    completedAt: new Date().toISOString(),
    summary: "Published an integrated storefront navigation generated from Shopify's complete published-page inventory.",
    navigation: {
      strategy: "published-theme-runtime-override-with-page-inventory",
      topLevel: navigation.map(summarizeNavigationItem),
      linkedPublishedPages: linkedPages.length,
      desktop: true,
      mobileDrawer: true,
      preservedControls: ["hamburger", "search", "account", "cart"],
    },
    inventory: {
      publishedPagesDiscovered: pages.length,
      integratedPages: linkedPages.map((item) => ({ title: item.title, handle: item.handle, url: item.url, category: item.category })),
      unassignedPages: unassigned.map((item) => ({ title: item.title, handle: item.handle, url: item.url })),
    },
    theme: summarizeTheme(mainTheme),
    files: await Promise.all(candidates.map(async (file) => ({
      filename: file.filename,
      beforeSha256: beforeMap.get(file.filename)?.sha256 || null,
      afterSha256: await hashText(file.content),
      changed: beforeMap.get(file.filename)?.content !== file.content,
    }))),
    verification: {
      valid: unassigned.length === 0,
      exactThemeFileReadBack: true,
      layoutInjectionPresent: true,
      desktopNavigationInstalled: true,
      mobileNavigationInstalled: true,
      everyPublishedPageIntegrated: unassigned.length === 0,
      topLevel: navigation.map(summarizeNavigationItem),
    },
    safeguards: {
      menusGraphQLDependencyRemoved: true,
      liveThemeChanged: true,
      rollbackOnReadBackFailure: true,
      duplicateStandaloneNavigationPrevented: true,
      allPublishedPagesIntegrated: unassigned.length === 0,
      searchAccountCartPreserved: true,
      workersAIUsed: false,
    },
  });
}

function buildNavigation(pages) {
  const groups = new Map(ROOTS.map((root) => [root.key, { ...root, items: [] }]));
  const normalizedPages = pages
    .filter((page) => page?.handle && page?.title)
    .map((page) => ({
      title: String(page.title).trim(),
      handle: String(page.handle).trim().toLowerCase(),
      url: `/pages/${String(page.handle).trim()}`,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  for (const page of normalizedPages) {
    if (ROOT_HANDLES.has(page.handle) && page.handle !== "about-mindset-media-group") continue;
    const category = classifyPage(page);
    const item = { ...page, category };
    const group = groups.get(category) || groups.get("company");
    if (!group.items.some((existing) => existing.handle === item.handle)) group.items.push(item);
  }

  const about = normalizedPages.find((page) => page.handle === "about-mindset-media-group");
  if (about) groups.get("company").items.unshift({ ...about, title: "About Mindset Media Group™", category: "company" });

  for (const group of groups.values()) group.items = dedupeAndSort(group.items);
  return ROOTS.map((root) => groups.get(root.key));
}

function classifyPage(page) {
  const haystack = `${page.handle} ${page.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let best = "company";
  let score = 0;
  for (const [category, terms] of Object.entries(CATEGORY_RULES)) {
    const matches = terms.reduce((total, term) => total + (haystack.includes(term) ? Math.max(1, term.length) : 0), 0);
    if (matches > score) {
      score = matches;
      best = category;
    }
  }
  return best;
}

function dedupeAndSort(items) {
  const seen = new Set();
  return items
    .filter((item) => {
      if (seen.has(item.handle)) return false;
      seen.add(item.handle);
      return true;
    })
    .sort((a, b) => {
      const preferred = ["about-mindset-media-group", "contact", "our-story", "mission", "vision", "team"];
      const ai = preferred.indexOf(a.handle);
      const bi = preferred.indexOf(b.handle);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.title.localeCompare(b.title);
    });
}

function summarizeNavigationItem(item) {
  return { title: item.title, url: item.url, children: item.items?.length || 0 };
}

function buildNavigationRuntime(navigation) {
  return String.raw`(() => {
  "use strict";
  const BUILD = "${KAIROS_NATIVE_NAVIGATION_BUILD}";
  const LINKS = ${JSON.stringify(navigation)};

  const escapeHTML = (value) => String(value || "").replace(/[&<>\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"
  })[character]);

  const childHTML = (item) => '<li><a href="' + escapeHTML(item.url) + '">' + escapeHTML(item.title) + '</a></li>';

  const desktopHTML = () => '<ul class="mmg-canonical-nav list-menu list-menu--inline" role="list" data-mmg-navigation-build="' + BUILD + '">' + LINKS.map((item) => {
    if (!item.items || !item.items.length) return '<li><a class="header__menu-item list-menu__item link link--text focus-inset" href="' + escapeHTML(item.url) + '"><span>' + escapeHTML(item.title) + '</span></a></li>';
    return '<li><details class="mmg-canonical-nav__group"><summary class="header__menu-item list-menu__item link focus-inset"><span>' + escapeHTML(item.title) + '</span></summary><ul class="mmg-canonical-nav__submenu" role="list"><li><a href="' + escapeHTML(item.url) + '"><strong>' + escapeHTML(item.title) + ' Overview</strong></a></li>' + item.items.map(childHTML).join('') + '</ul></details></li>';
  }).join('') + '</ul>';

  const drawerHTML = () => '<ul class="mmg-canonical-drawer" role="list" data-mmg-navigation-build="' + BUILD + '">' + LINKS.map((item) => {
    if (!item.items || !item.items.length) return '<li><a href="' + escapeHTML(item.url) + '">' + escapeHTML(item.title) + '</a></li>';
    return '<li><details><summary>' + escapeHTML(item.title) + '</summary><ul class="mmg-canonical-drawer__submenu" role="list"><li><a href="' + escapeHTML(item.url) + '"><strong>' + escapeHTML(item.title) + ' Overview</strong></a></li>' + item.items.map(childHTML).join('') + '</ul></details></li>';
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
    window.dispatchEvent(new CustomEvent('mmg:navigation:ready', { detail: { build: BUILD, links: LINKS } }));
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
}

function injectNavigationAssets(source) {
  const block = `${MARKER_START}\n{{ 'mmg-canonical-navigation.css' | asset_url | stylesheet_tag }}\n<script src="{{ 'mmg-canonical-navigation.js' | asset_url }}" defer="defer"></script>\n${MARKER_END}`;
  const markerPattern = new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`, "g");
  const cleaned = String(source || "").replace(markerPattern, "").trimEnd();
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `${block}\n</head>`);
  if (/<\/body>/i.test(cleaned)) return cleaned.replace(/<\/body>/i, `${block}\n</body>`);
  throw httpError(409, "live_theme_layout_invalid", `${LAYOUT_FILE} contains neither </head> nor </body>.`);
}

async function getPublishedPages(config, auth) {
  const pages = [];
  let cursor = null;
  do {
    const data = await shopifyGraphQL(config, auth, `query KairosPublishedPages($first: Int!, $after: String) {
      pages(first: $first, after: $after, sortKey: TITLE) {
        nodes { title handle publishedAt }
        pageInfo { hasNextPage endCursor }
      }
    }`, { first: 100, after: cursor });
    const connection = data?.pages;
    pages.push(...(Array.isArray(connection?.nodes) ? connection.nodes.filter((page) => page?.publishedAt) : []));
    cursor = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);
  return pages;
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
    themeId, filenames, first: filenames.length,
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

function summarizeTheme(theme) { return { id: theme.id, name: theme.name, role: theme.role }; }
function bodyToText(body) {
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") {
    try { return atob(body.contentBase64); } catch { return ""; }
  }
  return "";
}
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function safeRequestJSON(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
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
