export const KAIROS_NATIVE_PAGE_REPAIR_BUILD = "kairos-native-page-content-repair-20260719-1";
export const NATIVE_PAGE_REPAIR_PATH = "/api/shopify/pages/repair";
export const NATIVE_PAGE_REPAIR_CONFIRMATION = "REPAIR_MMG_AUDITED_PAGES_NOW";

const SHOPIFY_TIMEOUT_MS = 25_000;
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 500;
const MANAGED_START = "<!-- MMG_NATIVE_PAGE_REPAIR_START -->";
const MANAGED_END = "<!-- MMG_NATIVE_PAGE_REPAIR_END -->";
const TARGET_HANDLES = ["free-creator-toolkit", "publishing-services"];
const tokenCache = new Map();

export async function handleNativePageRepair(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== NATIVE_PAGE_REPAIR_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  if (payload?.confirmation !== NATIVE_PAGE_REPAIR_CONFIRMATION) {
    throw httpError(
      403,
      "native_page_repair_confirmation_required",
      `Provide the exact confirmation phrase: ${NATIVE_PAGE_REPAIR_CONFIRMATION}.`,
    );
  }

  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const pages = await getPages(config, auth);
  const targets = TARGET_HANDLES.map((handle) => pages.find((page) => page?.handle === handle));
  const missing = TARGET_HANDLES.filter((handle, index) => !targets[index]?.id);
  if (missing.length) {
    throw httpError(
      404,
      "native_page_repair_targets_missing",
      `The following Shopify pages were not found: ${missing.join(", ")}.`,
    );
  }

  const before = new Map(targets.map((page) => [page.handle, normalizePage(page)]));
  const candidates = targets.map((page) => ({
    before: normalizePage(page),
    body: transformPageBody(page.handle, page.body || ""),
  }));

  const updated = [];
  try {
    for (const candidate of candidates) {
      const page = await updatePageBody(config, auth, candidate.before.id, candidate.body);
      updated.push(normalizePage(page));
    }
    await verifyExactReadBack(config, auth, candidates);
  } catch (failure) {
    await rollbackPages(config, auth, updated, before);
    throw failure;
  }

  const after = [];
  for (const candidate of candidates) {
    const page = await getPage(config, auth, candidate.before.id);
    after.push(normalizePage(page));
  }

  const toolkit = after.find((page) => page.handle === "free-creator-toolkit");
  const publishing = after.find((page) => page.handle === "publishing-services");
  const toolkitAudit = auditToolkitBody(toolkit?.body || "");
  const publishingAudit = auditPublishingBody(publishing?.body || "");

  const verification = {
    valid:
      toolkitAudit.valid &&
      publishingAudit.valid &&
      candidates.every((candidate) =>
        after.some(
          (page) => page.id === candidate.before.id && page.body === candidate.body,
        ),
      ),
    exactPageReadBack: candidates.every((candidate) =>
      after.some(
        (page) => page.id === candidate.before.id && page.body === candidate.body,
      ),
    toolkitMiniNavigationRemoved: toolkitAudit.toolkitMiniNavigationRemoved,
    publishingDirectoryRemoved: publishingAudit.publishingDirectoryRemoved,
    projectGuideLinksRepaired: publishingAudit.projectGuideLinksRepaired,
    nativeTitleSuppressionInstalled:
      toolkitAudit.nativeTitleSuppressionInstalled &&
      publishingAudit.nativeTitleSuppressionInstalled,
    managedMarkersPresent:
      toolkitAudit.managedMarkersPresent && publishingAudit.managedMarkersPresent,
  };

  if (!verification.valid) {
    await rollbackPages(config, auth, after, before);
    throw httpError(
      502,
      "native_page_repair_post_publish_verification_failed",
      `Shopify page repair verification failed: ${JSON.stringify(verification)}.`,
    );
  }

  return json({
    status: "completed",
    build: KAIROS_NATIVE_PAGE_REPAIR_BUILD,
    completedAt: new Date().toISOString(),
    summary:
      "Repaired the audited Free Creator Toolkit and Publishing Services page bodies directly in Shopify with exact readback and rollback protection.",
    pages: after.map((page) => ({
      id: page.id,
      handle: page.handle,
      title: page.title,
      templateSuffix: page.templateSuffix,
      beforeLength: before.get(page.handle)?.body?.length || 0,
      afterLength: page.body.length,
    })),
    verification,
    safeguards: {
      exactTargetHandles: TARGET_HANDLES,
      rollbackOnFailure: true,
      exactReadBackRequired: true,
      nativeShopifyPagesUpdated: true,
      themeFilesChanged: false,
      workersAIUsed: false,
    },
  });
}

function transformPageBody(handle, source) {
  const clean = stripManagedBlock(String(source || ""));
  if (handle === "free-creator-toolkit") return transformToolkitBody(clean);
  if (handle === "publishing-services") return transformPublishingBody(clean);
  return clean;
}

function transformToolkitBody(source) {
  const withoutMiniNavigation = removeToolkitMiniNavigation(source);
  return `${managedStyleBlock("free-creator-toolkit")}\n${withoutMiniNavigation}`;
}

function transformPublishingBody(source) {
  let output = removePublishingDirectory(source);
  output = repairProjectGuideLinks(output);
  output = ensurePublishingProcessId(output);
  return `${managedStyleBlock("publishing-services")}\n${output}`;
}

function managedStyleBlock(handle) {
  return `${MANAGED_START}
<div data-mmg-native-page="${handle}" hidden></div>
<style data-mmg-native-page-repair="${KAIROS_NATIVE_PAGE_REPAIR_BUILD}">
body:has([data-mmg-native-page="${handle}"]) main h1.main-page-title,
body:has([data-mmg-native-page="${handle}"]) main h1.page-title,
body:has([data-mmg-native-page="${handle}"]) main .main-page-title,
body:has([data-mmg-native-page="${handle}"]) main .page-title.main-page-title{display:none!important}
</style>
${MANAGED_END}`;
}

function removeToolkitMiniNavigation(source) {
  const knownLabels = [
    "MMG Home",
    "Knowledge Library",
    "Creator’s Bible",
    "Creator's Bible",
    "AI Guide",
    "CapCut Templates",
  ];
  const index = source.indexOf("MMG Home");
  if (index < 0) return source;

  return removeSmallestEnclosingBlock(source, index, (fragment) => {
    const labels = knownLabels.filter((label) => fragment.includes(label));
    const anchorCount = countAnchors(fragment);
    return (
      labels.length >= 4 &&
      anchorCount >= 4 &&
      anchorCount <= 12 &&
      !fragment.includes("The Free Creator Toolkit.")
    );
  });
}

function removePublishingDirectory(source) {
  const needles = ["Explore Mindset Media Group™", "Explore Mindset Media Group"];
  const needle = needles.find((value) => source.includes(value));
  if (!needle) return source;
  const index = source.indexOf(needle);

  return removeSmallestEnclosingBlock(source, index, (fragment) => {
    const anchorCount = countAnchors(fragment);
    return (
      fragment.includes(needle) &&
      anchorCount >= 6 &&
      !fragment.includes("Turn your knowledge into a published book.")
    );
  });
}

function repairProjectGuideLinks(source) {
  let output = source.replace(
    /(href\s*=\s*["'])(?:https?:\/\/[^"']+)?\/pages\/project-guide(?:[?#][^"']*)?(["'])/gi,
    `$1/pages/publishing-services#publishing-process$2`,
  );
  output = output
    .replace(/View the Project Guide/g, "View the Publishing Process")
    .replace(/Read the Project Guide/g, "Read the Publishing Process")
    .replace(/>\s*Project Guide\s*</g, ">Publishing Process<");
  return output;
}

function ensurePublishingProcessId(source) {
  if (/\bid\s*=\s*["']publishing-process["']/i.test(source)) return source;

  const headings = [
    "The publishing workflow is designed to be clear.",
    "Our Process",
  ];

  for (const heading of headings) {
    const escaped = escapeRegExp(heading);
    const pattern = new RegExp(
      `(<(?:h2|h3|div|section)\\b)([^>]*>\\s*(?:<[^>]+>\\s*)*${escaped})`,
      "i",
    );
    if (pattern.test(source)) {
      return source.replace(pattern, `$1 id="publishing-process"$2`);
    }
  }

  const textIndex = headings
    .map((heading) => source.indexOf(heading))
    .find((value) => value >= 0);
  if (textIndex == null || textIndex < 0) return source;

  const ranges = pairElementRanges(source)
    .filter((range) => range.start <= textIndex && textIndex < range.end)
    .sort((a, b) => a.end - a.start - (b.end - b.start));
  const target = ranges.find((range) => ["section", "div", "h2", "h3"].includes(range.tag));
  if (!target) return source;
  const opening = source.slice(target.start, target.openEnd);
  if (/\bid\s*=\s*["']/i.test(opening)) return source;
  const injected = opening.replace(/>$/, ' id="publishing-process">');
  return source.slice(0, target.start) + injected + source.slice(target.openEnd);
}

function removeSmallestEnclosingBlock(source, textIndex, predicate) {
  const candidates = pairElementRanges(source)
    .filter((range) => range.start <= textIndex && textIndex < range.end)
    .sort((a, b) => a.end - a.start - (b.end - b.start));

  const target = candidates.find((range) => {
    if (["html", "body", "main"].includes(range.tag)) return false;
    return predicate(source.slice(range.start, range.end));
  });
  if (!target) return source;
  return source.slice(0, target.start) + source.slice(target.end);
}

function pairElementRanges(source) {
  const voidTags = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);
  const ranges = [];
  const stack = [];
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g;
  let match;

  while ((match = tokenPattern.exec(source))) {
    if (!match[1]) continue;
    const tag = match[1].toLowerCase();
    const token = match[0];
    const closing = /^<\//.test(token);
    const selfClosing = /\/\s*>$/.test(token) || voidTags.has(tag);

    if (closing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag !== tag) continue;
        const entry = stack[index];
        stack.splice(index, 1);
        ranges.push({
          tag,
          start: entry.start,
          openEnd: entry.openEnd,
          closeStart: match.index,
          end: tokenPattern.lastIndex,
        });
        break;
      }
    } else if (!selfClosing) {
      stack.push({ tag, start: match.index, openEnd: tokenPattern.lastIndex });
    }
  }

  return ranges;
}

function countAnchors(fragment) {
  return (fragment.match(/<a\b/gi) || []).length;
}

function stripManagedBlock(source) {
  const pattern = new RegExp(
    `${escapeRegExp(MANAGED_START)}[\\s\\S]*?${escapeRegExp(MANAGED_END)}\\s*`,
    "g",
  );
  return String(source || "").replace(pattern, "");
}

function auditToolkitBody(body) {
  const known = [
    "MMG Home",
    "Knowledge Library",
    "Creator’s Bible",
    "Creator's Bible",
    "AI Guide",
    "CapCut Templates",
  ];
  const remainingLabels = known.filter((label) => body.includes(label));
  const managedMarkersPresent =
    body.includes(MANAGED_START) && body.includes(MANAGED_END);
  const nativeTitleSuppressionInstalled =
    body.includes('data-mmg-native-page="free-creator-toolkit"') &&
    body.includes("h1.main-page-title") &&
    body.includes("display:none!important");
  const toolkitMiniNavigationRemoved = remainingLabels.length < 4;
  return {
    valid:
      managedMarkersPresent &&
      nativeTitleSuppressionInstalled &&
      toolkitMiniNavigationRemoved,
    managedMarkersPresent,
    nativeTitleSuppressionInstalled,
    toolkitMiniNavigationRemoved,
    remainingLegacyLabels: remainingLabels,
  };
}

function auditPublishingBody(body) {
  const managedMarkersPresent =
    body.includes(MANAGED_START) && body.includes(MANAGED_END);
  const nativeTitleSuppressionInstalled =
    body.includes('data-mmg-native-page="publishing-services"') &&
    body.includes("h1.main-page-title") &&
    body.includes("display:none!important");
  const projectGuideLinksRepaired =
    !/\/pages\/project-guide/i.test(body) &&
    body.includes("/pages/publishing-services#publishing-process") &&
    /\bid\s*=\s*["']publishing-process["']/i.test(body);
  const publishingDirectoryRemoved =
    !body.includes("Explore Mindset Media Group™") &&
    !body.includes("Explore Mindset Media Group");
  return {
    valid:
      managedMarkersPresent &&
      nativeTitleSuppressionInstalled &&
      projectGuideLinksRepaired &&
      publishingDirectoryRemoved,
    managedMarkersPresent,
    nativeTitleSuppressionInstalled,
    projectGuideLinksRepaired,
    publishingDirectoryRemoved,
  };
}

async function getPages(config, auth) {
  const data = await shopifyGraphQL(
    config,
    auth,
    `query KairosAuditedPages {
      pages(first: 100) {
        nodes { id handle title body templateSuffix }
      }
    }`,
    {},
  );
  return data?.pages?.nodes || [];
}

async function getPage(config, auth, id) {
  const data = await shopifyGraphQL(
    config,
    auth,
    `query KairosAuditedPage($id: ID!) {
      page(id: $id) { id handle title body templateSuffix }
    }`,
    { id },
  );
  if (!data?.page?.id) {
    throw httpError(404, "native_page_repair_readback_missing", `Shopify page ${id} was not readable.`);
  }
  return data.page;
}

async function updatePageBody(config, auth, id, body) {
  const data = await shopifyGraphQL(
    config,
    auth,
    `mutation KairosRepairPage($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle title body templateSuffix }
        userErrors { code field message }
      }
    }`,
    { id, page: { body } },
  );
  const errors = data?.pageUpdate?.userErrors || [];
  if (errors.length) {
    throw httpError(
      422,
      "native_page_repair_update_failed",
      errors
        .map((item) => `${(item.field || []).join(".")}: ${item.message}`)
        .join("; "),
    );
  }
  if (!data?.pageUpdate?.page?.id) {
    throw httpError(502, "native_page_repair_update_missing", `Shopify returned no page for ${id}.`);
  }
  return data.pageUpdate.page;
}

async function verifyExactReadBack(config, auth, candidates) {
  for (let attempt = 1; attempt <= READ_BACK_ATTEMPTS; attempt += 1) {
    let valid = true;
    for (const candidate of candidates) {
      const page = await getPage(config, auth, candidate.before.id);
      if (page.body !== candidate.body) valid = false;
    }
    if (valid) return;
    if (attempt < READ_BACK_ATTEMPTS) await delay(READ_BACK_DELAY_MS);
  }
  throw httpError(
    502,
    "native_page_repair_readback_mismatch",
    "Shopify did not preserve the exact repaired page bodies.",
  );
}

async function rollbackPages(config, auth, updatedPages, beforeMap) {
  for (const page of updatedPages || []) {
    const before = beforeMap.get(page.handle);
    if (!before?.id) continue;
    try {
      await updatePageBody(config, auth, before.id, before.body);
    } catch {}
  }
}

function normalizePage(page) {
  return {
    id: page?.id || "",
    handle: page?.handle || "",
    title: page?.title || "",
    body: page?.body || "",
    templateSuffix: page?.templateSuffix || null,
  };
}

function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) {
    throw httpError(503, "native_page_repair_invalid_domain", "The Shopify store domain is invalid.");
  }
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) {
    throw httpError(503, "native_page_repair_invalid_version", "The Shopify API version is invalid.");
  }
  return { storeDomain, apiVersion };
}

async function resolveAccessToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const cacheKey = `${config.storeDomain}:${clientId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached?.expiresAt > Date.now()) return { token: cached.token, source: "client_credentials" };

    const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
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
      throw httpError(
        401,
        "native_page_repair_client_credentials_invalid",
        body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`,
      );
    }
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { token, source: "client_credentials" };
  }

  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) {
    throw httpError(503, "native_page_repair_not_configured", "Shopify credentials are not configured.");
  }
  return { token, source: "legacy_direct_token" };
}

async function shopifyGraphQL(config, auth, query, variables) {
  const response = await fetch(
    `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": auth.token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
    },
  );
  const body = await safeResponseJSON(response);
  if (!response.ok) {
    throw httpError(
      response.status,
      "native_page_repair_graphql_http_error",
      body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`,
    );
  }
  if (body?.errors?.length) {
    throw httpError(
      422,
      "native_page_repair_graphql_error",
      body.errors.map((item) => item?.message).filter(Boolean).join("; "),
    );
  }
  return body?.data || {};
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
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
      "X-MMG-Native-Page-Repair": KAIROS_NATIVE_PAGE_REPAIR_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
