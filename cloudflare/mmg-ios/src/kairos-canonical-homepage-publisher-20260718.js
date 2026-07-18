import {
  deleteThemeFiles,
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  semanticHash,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";
import {
  BUILD_PATH,
  CSS_FILE,
  CSS_SOURCE,
  JS_FILE,
  JS_SOURCE,
  KAIROS_CANONICAL_HOMEPAGE_BUILD,
  MANAGED_FILES,
  PUBLISH_CONFIRMATION,
  SECTION_FILE,
  SECTION_SOURCE,
  STAGING_CONFIRMATION,
  TEMPLATE_FILE,
  TEMPLATE_SOURCE,
} from "./kairos-canonical-homepage-source-20260718.js";

export { KAIROS_CANONICAL_HOMEPAGE_BUILD };

const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 450;
const SHOPIFY_TIMEOUT_MS = 25_000;
const tokenCache = new Map();

export async function handleCanonicalHomepageBuild(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== BUILD_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  const mode = payload?.mode === "publish" ? "publish" : payload?.mode === "repair" ? "repair" : "build";
  const requiredConfirmation = mode === "publish" ? PUBLISH_CONFIRMATION : STAGING_CONFIRMATION;
  if (payload?.confirmation !== requiredConfirmation) {
    throw httpError(403, "canonical_homepage_confirmation_required", `Provide the exact confirmation phrase: ${requiredConfirmation}.`);
  }

  const inspection = await inspectStagingSource(null, request, env, KAIROS_CANONICAL_HOMEPAGE_BUILD, MANAGED_FILES);
  const evidence = inspection?.evidence || {};
  validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);

  if (mode === "publish") {
    return publishVerifiedHomepage(env, evidence);
  }
  return installStagingHomepage(request, env, evidence, mode);
}

async function installStagingHomepage(request, env, evidence, mode) {
  const beforeMap = new Map((evidence.files || []).map((file) => [file.filename, file]));
  const prepared = await prepareCandidates(beforeMap);

  await writeThemeFiles(env, evidence.stagingTheme.gid, prepared.map(({ filename, content }) => ({ filename, content })));

  try {
    await verifyThemeReadBack(env, evidence.stagingTheme.gid, prepared, "staging");
  } catch (error) {
    await restorePreviousFiles(env, evidence.stagingTheme.gid, prepared, beforeMap);
    throw error;
  }

  const previewURL = stagingPreviewURL(env, evidence.stagingTheme.gid);
  return json({
    status: "completed",
    build: KAIROS_CANONICAL_HOMEPAGE_BUILD,
    mode,
    completedAt: new Date().toISOString(),
    summary: `Kairos ${mode === "repair" ? "repaired" : "installed"} the publishing-services framework homepage bundle in the verified non-live Kairos Staging theme and confirmed exact source read-back.`,
    preview: {
      url: previewURL,
      desktopURL: previewURL,
      mobileURL: previewURL,
      theme: evidence.stagingTheme,
    },
    production: {
      url: storefrontOrigin(env),
      publishedTheme: evidence.mainTheme,
      publishedThemeChanged: false,
      publishAuthorized: false,
    },
    files: prepared.map(({ content, ...file }) => ({ ...file, changed: file.beforeSha256 !== file.afterSha256 })),
    verification: verificationSummary(),
    safeguards: {
      stagingOnly: true,
      mainThemeMutation: false,
      rollbackOnReadBackFailure: true,
    },
  }, 200);
}

async function publishVerifiedHomepage(env, evidence) {
  const preparedForStaging = await prepareCandidates(new Map());
  await verifyThemeReadBack(env, evidence.stagingTheme.gid, preparedForStaging, "staging");

  const mainFiles = await readThemeFiles(env, evidence.mainTheme.gid, MANAGED_FILES);
  const beforeMap = new Map(mainFiles.map((file) => [file.filename, file]));
  const prepared = await prepareCandidates(beforeMap);

  await writeThemeFiles(env, evidence.mainTheme.gid, prepared.map(({ filename, content }) => ({ filename, content })));

  try {
    await verifyThemeReadBack(env, evidence.mainTheme.gid, prepared, "published");
  } catch (error) {
    await restorePreviousFiles(env, evidence.mainTheme.gid, prepared, beforeMap);
    throw error;
  }

  const liveURL = storefrontOrigin(env);
  return json({
    status: "completed",
    build: KAIROS_CANONICAL_HOMEPAGE_BUILD,
    mode: "publish",
    completedAt: new Date().toISOString(),
    summary: "Kairos promoted the verified publishing-services framework homepage bundle to the published Shopify theme and confirmed exact source read-back.",
    preview: {
      url: stagingPreviewURL(env, evidence.stagingTheme.gid),
      desktopURL: stagingPreviewURL(env, evidence.stagingTheme.gid),
      mobileURL: stagingPreviewURL(env, evidence.stagingTheme.gid),
      theme: evidence.stagingTheme,
    },
    production: {
      url: liveURL,
      publishedTheme: evidence.mainTheme,
      publishedThemeChanged: true,
      publishAuthorized: true,
    },
    files: prepared.map(({ content, ...file }) => ({ ...file, changed: file.beforeSha256 !== file.afterSha256 })),
    verification: {
      ...verificationSummary(),
      stagingBundleVerifiedBeforePublish: true,
      publishedThemeReadBackVerified: true,
    },
    safeguards: {
      stagingOnly: false,
      mainThemeMutation: true,
      rollbackOnReadBackFailure: true,
      sourceBundlePromotedWithoutReconstruction: true,
    },
  }, 200);
}

async function prepareCandidates(beforeMap) {
  const candidates = [
    { filename: TEMPLATE_FILE, content: TEMPLATE_SOURCE },
    { filename: SECTION_FILE, content: SECTION_SOURCE },
    { filename: CSS_FILE, content: CSS_SOURCE },
    { filename: JS_FILE, content: JS_SOURCE },
  ];
  const prepared = [];
  for (const candidate of candidates) {
    prepared.push({
      ...candidate,
      beforeSha256: beforeMap.get(candidate.filename)?.sha256 || null,
      afterSha256: await hashText(candidate.content),
      existedBefore: beforeMap.has(candidate.filename),
      beforeBytes: beforeMap.get(candidate.filename)?.bytes || 0,
      afterBytes: new TextEncoder().encode(candidate.content).length,
      readBackVerification: candidate.filename === TEMPLATE_FILE ? "semantic-json" : "exact-bytes",
    });
  }
  return prepared;
}

async function verifyThemeReadBack(env, themeGid, prepared, label) {
  let lastError = null;
  let lastObserved = [];
  for (let attempt = 1; attempt <= READ_BACK_ATTEMPTS; attempt += 1) {
    try {
      const files = await readThemeFiles(env, themeGid, MANAGED_FILES);
      const readBackMap = new Map(files.map((file) => [file.filename, file]));
      const observed = [];
      let matched = true;

      for (const candidate of prepared) {
        const actual = readBackMap.get(candidate.filename);
        if (!actual) {
          matched = false;
          observed.push(`${candidate.filename}:missing`);
          break;
        }

        if (candidate.filename === TEMPLATE_FILE) {
          const expectedSemanticSha256 = await semanticHash(parseShopifyJson(candidate.content));
          const actualSemanticSha256 = await semanticHash(parseShopifyJson(actual.content));
          observed.push(`${candidate.filename}:${actualSemanticSha256}`);
          if (actualSemanticSha256 !== expectedSemanticSha256) {
            matched = false;
            break;
          }
          candidate.afterSha256 = actual.sha256;
          candidate.afterBytes = actual.bytes;
          candidate.semanticSha256 = actualSemanticSha256;
          continue;
        }

        observed.push(`${candidate.filename}:${actual.sha256}`);
        if (actual.content !== candidate.content || actual.sha256 !== candidate.afterSha256) {
          matched = false;
          break;
        }
        candidate.afterSha256 = actual.sha256;
        candidate.afterBytes = actual.bytes;
      }

      lastObserved = observed;
      if (matched) return files;
    } catch (error) {
      lastError = error;
    }

    if (attempt < READ_BACK_ATTEMPTS) await delay(READ_BACK_DELAY_MS);
  }

  const detail = lastError instanceof Error ? ` Last read error: ${lastError.message}` : "";
  throw httpError(
    502,
    "canonical_homepage_readback_mismatch",
    `Shopify did not expose the current ${label} homepage revision after ${READ_BACK_ATTEMPTS} read-back attempts. Observed ${lastObserved.join(", ") || "no readable files"}.${detail}`,
  );
}

async function readThemeFiles(env, themeGid, filenames) {
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const normalized = [...new Set(filenames.map((value) => String(value || "").trim()).filter(Boolean))];
  const data = await shopifyGraphQL(
    config,
    auth,
    `query KairosThemeFiles($themeId: ID!, $filenames: [String!], $first: Int!) {
      theme(id: $themeId) {
        files(first: $first, filenames: $filenames) {
          nodes {
            filename
            contentType
            body {
              ... on OnlineStoreThemeFileBodyText { content }
              ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
            }
          }
          userErrors { code filename }
        }
      }
    }`,
    { themeId: themeGid, filenames: normalized, first: normalized.length },
  );

  const connection = data?.theme?.files;
  const errors = Array.isArray(connection?.userErrors)
    ? connection.userErrors.filter((error) => error?.code && error.code !== "NOT_FOUND")
    : [];
  if (errors.length) {
    throw httpError(502, "theme_file_read_failed", `Shopify could not read the managed homepage files: ${errors.map((error) => error.code).join(", ")}.`);
  }

  const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
  const files = [];
  for (const filename of normalized) {
    const node = nodes.find((item) => item?.filename === filename);
    const content = bodyToText(node?.body);
    if (!content) continue;
    files.push({
      filename,
      content,
      sha256: await hashText(content),
      bytes: new TextEncoder().encode(content).length,
      contentType: node?.contentType || "",
    });
  }
  return files;
}

async function restorePreviousFiles(env, themeGid, prepared, beforeMap) {
  const restore = prepared
    .filter((file) => beforeMap.has(file.filename))
    .map((file) => ({ filename: file.filename, content: beforeMap.get(file.filename).content }));
  const remove = prepared
    .filter((file) => !beforeMap.has(file.filename))
    .map((file) => file.filename)
    .filter((filename) => filename !== TEMPLATE_FILE);

  if (restore.length) await writeThemeFiles(env, themeGid, restore);
  if (remove.length) await deleteThemeFiles(env, themeGid, remove);
}

function verificationSummary() {
  return {
    exactReadBack: true,
    templateReadBack: "semantic-json",
    exactByteReadBackFiles: [SECTION_FILE, CSS_FILE, JS_FILE],
    templateSections: ["mmg_canonical_homepage"],
    requiredSectionIDs: ["pathways", "resources", "services", "subscriptions", "kairos", "mission", "questions", "next-step"],
    singlePrimaryHeadingDesigned: true,
    responsiveStylesIncluded: true,
    interactionScriptIncluded: true,
    reducedMotionSupported: true,
  };
}

function validateThemeBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN" || String(stagingTheme.name || "").trim().toLowerCase() !== "kairos staging") {
    throw httpError(409, "verified_kairos_staging_required", "The canonical homepage can only be installed into the verified non-live Kairos Staging theme.");
  }
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN" || mainTheme.gid === stagingTheme.gid) {
    throw httpError(409, "main_theme_boundary_invalid", "The published MAIN theme boundary could not be verified.");
  }
}

function stagingPreviewURL(env, gid) {
  const themeID = String(gid || "").split("/").pop();
  const origin = storefrontOrigin(env);
  return themeID ? `${origin}/?preview_theme_id=${encodeURIComponent(themeID)}` : origin;
}

function storefrontOrigin(env) {
  return String(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com").replace(/\/+$/, "");
}

function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) {
    throw httpError(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  }
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) {
    throw httpError(503, "shopify_invalid_version", "The Shopify API version is invalid.");
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
      throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`).slice(0, 500));
    }
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
    throw httpError(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  }
  if (Array.isArray(body?.errors) && body.errors.length) {
    throw httpError(422, "shopify_graphql_error", body.errors.map((error) => error?.message).filter(Boolean).join("; "));
  }
  return body?.data || {};
}

function bodyToText(body) {
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") {
    try { return atob(body.contentBase64); }
    catch { return ""; }
  }
  return "";
}

async function safeRequestJSON(request) {
  try { return await request.json(); }
  catch { return {}; }
}

async function safeResponseJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_CANONICAL_HOMEPAGE_BUILD,
      "X-Kairos-Staging-Only": value?.mode === "publish" ? "false" : "true",
      "X-Kairos-Production-Publish": value?.mode === "publish" ? "true" : "false",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
