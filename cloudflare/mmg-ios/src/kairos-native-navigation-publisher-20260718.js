export const KAIROS_NATIVE_NAVIGATION_BUILD = "kairos-native-navigation-publisher-20260718-4";
export const NATIVE_NAVIGATION_PATH = "/api/shopify/navigation/publish";
export const NATIVE_NAVIGATION_CONFIRMATION = "PUBLISH_MMG_NATIVE_MAIN_NAVIGATION";

const SHOPIFY_TIMEOUT_MS = 25_000;
const tokenCache = new Map();

const CANONICAL_ITEMS = [
  { title: "Home", type: "HTTP", url: "/", items: [] },
  { title: "Products", type: "HTTP", url: "/pages/products", items: [] },
  { title: "Publishing Services", type: "HTTP", url: "/pages/publishing-services", items: [] },
  { title: "Knowledge Library", type: "HTTP", url: "/pages/knowledge-library", items: [] },
  { title: "Membership", type: "HTTP", url: "/pages/membership", items: [] },
  { title: "Kairos", type: "HTTP", url: "/pages/kairos", items: [] },
  { title: "Customer Portal", type: "HTTP", url: "/pages/customer-portal", items: [] },
  {
    title: "Company",
    type: "HTTP",
    url: "/pages/about-mindset-media-group",
    items: [
      { title: "About Mindset Media Group™", type: "HTTP", url: "/pages/about-mindset-media-group", items: [] },
      { title: "Contact", type: "HTTP", url: "/pages/contact", items: [] },
    ],
  },
];

export async function handleNativeNavigationPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== NATIVE_NAVIGATION_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  if (payload?.confirmation !== NATIVE_NAVIGATION_CONFIRMATION) {
    return json({
      status: "failed",
      error: {
        code: "native_navigation_confirmation_required",
        message: `Provide the exact confirmation phrase: ${NATIVE_NAVIGATION_CONFIRMATION}.`,
      },
    }, 403);
  }

  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const menu = await getMainMenu(config, auth);
  const before = summarize(menu.items || []);
  const updated = await updateMenu(config, auth, menu, CANONICAL_ITEMS);
  const verification = verify(updated?.items || []);

  if (!verification.valid) {
    throw error(422, "native_navigation_verification_failed", verification.errors.join("; "));
  }

  return json({
    status: "completed",
    build: KAIROS_NATIVE_NAVIGATION_BUILD,
    summary: "Published the exact canonical Shopify main navigation without coupling menu publication to landing-page creation or template assignment.",
    navigation: {
      id: updated.id,
      handle: updated.handle,
      title: updated.title,
      items: updated.items,
    },
    cleanup: {
      previousTopLevel: before,
      canonicalTopLevel: verification.topLevel,
      replacedLegacyTree: true,
    },
    verification,
    pages: [],
    safeguards: {
      nativeShopifyMenuOnly: true,
      existingEquivalentItemsPreferred: false,
      equivalentDestinationsMergedAcrossTree: true,
      companyGroupPreserved: true,
      aboutAndContactNestedUnderCompany: true,
      duplicateDestinationsRemoved: true,
      landingPagesPublished: false,
      navigationIndependentFromLandingPages: true,
    },
  });
}

async function getMainMenu(config, auth) {
  const data = await shopifyGraphQL(
    config,
    auth,
    `query KairosMenus {
      menus(first: 50) {
        nodes {
          id
          handle
          title
          isDefault
          items {
            id
            title
            type
            url
            items {
              id
              title
              type
              url
              items { id title type url }
            }
          }
        }
      }
    }`,
    {},
  );

  const menus = data?.menus?.nodes || [];
  const menu = menus.find(item => item.handle === "main-menu")
    || menus.find(item => item.isDefault && /main/i.test(item.title))
    || menus.find(item => /main/i.test(item.title));

  if (!menu?.id) {
    throw error(404, "main_menu_not_found", "Shopify's native main menu could not be identified.");
  }
  return menu;
}

async function updateMenu(config, auth, menu, items) {
  const data = await shopifyGraphQL(
    config,
    auth,
    `mutation KairosUpdateMainMenu($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu {
          id
          handle
          title
          items {
            id
            title
            type
            url
            items {
              id
              title
              type
              url
              items { id title type url }
            }
          }
        }
        userErrors { code field message }
      }
    }`,
    { id: menu.id, title: menu.title, items },
  );

  const errors = data?.menuUpdate?.userErrors || [];
  if (errors.length) {
    throw error(
      422,
      "native_navigation_update_failed",
      errors.map(item => `${item.field?.join(".") || "menu"}: ${item.message}`).join("; "),
    );
  }

  const updated = data?.menuUpdate?.menu;
  if (!updated?.id) {
    throw error(422, "native_navigation_update_empty", "Shopify returned no updated menu after menuUpdate.");
  }
  return updated;
}

function verify(items) {
  const errors = [];
  const expectedTitles = CANONICAL_ITEMS.map(item => item.title);
  const observedTitles = items.map(item => item.title);

  if (observedTitles.length !== expectedTitles.length) {
    errors.push(`Expected ${expectedTitles.length} top-level items; received ${observedTitles.length}.`);
  }

  expectedTitles.forEach((title, index) => {
    if (observedTitles[index] !== title) {
      errors.push(`Expected top-level item ${index + 1} to be ${title}; received ${observedTitles[index] || "missing"}.`);
    }
  });

  const company = items.find(item => item.title === "Company");
  const companyChildren = company?.items || [];
  const childTitles = companyChildren.map(item => item.title);
  if (childTitles.length !== 2
    || childTitles[0] !== "About Mindset Media Group™"
    || childTitles[1] !== "Contact") {
    errors.push("Company must contain exactly About Mindset Media Group™ and Contact, in that order.");
  }

  if (observedTitles.includes("Catalog")) errors.push("Catalog must not remain top-level.");
  if (observedTitles.includes("Contact")) errors.push("Contact must not remain top-level.");

  const flattened = flatten(items);
  const normalizedUrls = flattened.map(item => normalize(item.url)).filter(Boolean);
  const duplicateUrls = [...new Set(normalizedUrls.filter((url, index) => normalizedUrls.indexOf(url) !== index))]
    .filter(url => url !== "/pages/about-mindset-media-group");
  if (duplicateUrls.length) errors.push(`Duplicate destinations remain: ${duplicateUrls.join(", ")}.`);

  return {
    valid: errors.length === 0,
    errors,
    topLevel: items.map(item => ({
      title: item.title,
      url: item.url || null,
      children: (item.items || []).length,
    })),
    destinationCounts: Object.fromEntries(
      normalizedUrls.reduce((counts, url) => counts.set(url, (counts.get(url) || 0) + 1), new Map()),
    ),
  };
}

function summarize(items) {
  return items.map(item => ({
    title: item.title,
    url: item.url || null,
    children: (item.items || []).length,
  }));
}

function flatten(items) {
  const output = [];
  for (const item of items) {
    output.push(item);
    output.push(...flatten(item.items || []));
  }
  return output;
}

function normalize(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value, "https://store.invalid");
    return (parsed.pathname.replace(/\/$/, "") || "/").toLowerCase();
  } catch {
    return String(value || "").replace(/\/$/, "").toLowerCase();
  }
}

function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) {
    throw error(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  }
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
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
    });
    const body = await safeResponseJSON(response);
    const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
    if (!response.ok || !token) {
      throw error(
        401,
        "shopify_client_credentials_invalid",
        body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`,
      );
    }
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { token };
  }

  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw error(503, "shopify_not_configured", "Shopify credentials are not configured.");
  return { token };
}

async function shopifyGraphQL(config, auth, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": auth.token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeResponseJSON(response);
  if (!response.ok) {
    throw error(
      response.status,
      "shopify_graphql_http_error",
      body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`,
    );
  }
  if (body?.errors?.length) {
    throw error(422, "shopify_graphql_error", body.errors.map(item => item.message).join("; "));
  }
  return body?.data || {};
}

function error(status, code, message) {
  const value = new Error(message);
  value.status = status;
  value.code = code;
  return value;
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
