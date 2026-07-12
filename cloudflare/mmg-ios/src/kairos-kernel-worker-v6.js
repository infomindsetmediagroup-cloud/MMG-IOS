import kernel from "./kairos-kernel-worker-v5.js";

const BUILD = "kairos-kernel-20260712-6";
const SHOPIFY_TIMEOUT_MS = 20_000;
const POLL_ATTEMPTS = 12;
const POLL_DELAY_MS = 1500;
const tokenCache = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/create") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return createApprovedStagingTheme(request, env);
    }

    const response = await kernel.fetch(request, env);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-v6");

    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v6";
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyStagingCreation: "available-with-explicit-approval",
        shopifyThemePlanning: "locked-pending-verified-staging-theme",
      };
      return json(body, response.status);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

async function createApprovedStagingTheme(request, env) {
  const startedAt = new Date().toISOString();
  const actionID = crypto.randomUUID();

  try {
    const payload = await readRequestJSON(request);
    const proposalEnvelope = payload?.proposal;
    const approval = payload?.approval;
    validateApproval(proposalEnvelope, approval);

    const config = readShopifyConfig(env);
    const auth = await resolveAccessToken(config, env);
    const beforeThemes = await readThemes(config, auth.accessToken);
    const mainTheme = beforeThemes.find(theme => theme.role === "MAIN") || null;
    const existing = beforeThemes.find(theme => theme.role !== "MAIN" && theme.name.toLowerCase() === "kairos staging") || null;

    if (!mainTheme) throw httpError(409, "main_theme_not_found", "The published main theme could not be verified before execution.");
    if (mainTheme.gid !== approval.sourceThemeID) {
      throw httpError(409, "source_theme_changed", "The approved source theme no longer matches the current published theme. Prepare and approve a new proposal.");
    }

    if (existing) {
      return json(completion(actionID, startedAt, auth.source, config, mainTheme, existing, true, []), 200);
    }

    const contract = await readDuplicateContract(config, auth.accessToken);
    if (!contract) throw httpError(409, "theme_duplicate_unavailable", "Shopify no longer exposes themeDuplicate.");

    const argNames = new Set((contract.args || []).map(arg => arg.name));
    if (!argNames.has("id") || !argNames.has("name")) {
      throw httpError(409, "theme_duplicate_contract_changed", `themeDuplicate arguments are ${[...argNames].join(", ") || "empty"}; expected id and name.`);
    }

    const payloadType = unwrapTypeName(contract.type);
    const payloadFields = payloadType ? await readTypeFields(config, auth.accessToken, payloadType) : [];
    const fieldNames = new Set(payloadFields.map(field => field.name));
    const userErrorsSelection = fieldNames.has("userErrors") ? "userErrors { field message }" : "";

    const mutation = `
      mutation KairosCreateStaging($id: ID!, $name: String!) {
        themeDuplicate(id: $id, name: $name) {
          __typename
          ${userErrorsSelection}
        }
      }
    `;

    const mutationData = await shopifyGraphQL(config, auth.accessToken, mutation, {
      id: mainTheme.gid,
      name: approval.targetThemeName,
    });

    const result = mutationData?.themeDuplicate || {};
    const userErrors = Array.isArray(result.userErrors) ? result.userErrors : [];
    if (userErrors.length) {
      throw httpError(409, "theme_duplicate_user_error", userErrors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
    }

    const pollEvidence = [];
    let staging = null;

    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
      const snapshot = await readThemes(config, auth.accessToken);
      staging = snapshot.find(theme => theme.role !== "MAIN" && theme.name.toLowerCase() === approval.targetThemeName.toLowerCase()) || null;
      pollEvidence.push({ attempt, checkedAt: new Date().toISOString(), theme: staging });
      if (staging && !staging.processing) break;
      await delay(POLL_DELAY_MS);
    }

    const afterThemes = await readThemes(config, auth.accessToken);
    const afterMain = afterThemes.find(theme => theme.role === "MAIN") || null;
    const verifiedStaging = afterThemes.find(theme => theme.role !== "MAIN" && theme.name.toLowerCase() === approval.targetThemeName.toLowerCase()) || null;

    if (!verifiedStaging) throw httpError(502, "staging_theme_not_found_after_duplicate", "Shopify accepted themeDuplicate, but Kairos could not find the new non-live theme during verification.");
    if (verifiedStaging.processing) throw httpError(504, "staging_theme_still_processing", "Kairos found the staging theme, but Shopify is still processing it. Retry the action to verify the existing copy.");
    if (verifiedStaging.processingFailed) throw httpError(502, "staging_theme_processing_failed", "Shopify reported that staging-theme processing failed.");
    if (!afterMain || afterMain.gid !== mainTheme.gid || afterMain.role !== "MAIN") {
      throw httpError(502, "main_theme_verification_failed", "The published Rise theme did not remain unchanged after duplication.");
    }

    return json(completion(actionID, startedAt, auth.source, config, afterMain, verifiedStaging, false, pollEvidence), 200);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({
      actionID,
      actionType: "shopify.staging.create",
      status: "needs-attention",
      build: BUILD,
      kernel: "standalone-v6",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: "Kairos could not create and verify the non-live staging theme.",
      error: normalized,
    }, normalized.status);
  }
}

function completion(actionID, startedAt, credentialPath, config, mainTheme, stagingTheme, reusedExisting, pollEvidence) {
  return {
    actionID,
    actionType: "shopify.staging.create",
    status: "completed",
    build: BUILD,
    kernel: "standalone-v6",
    startedAt,
    completedAt: new Date().toISOString(),
    summary: reusedExisting
      ? "Kairos found and verified the existing non-live Kairos Staging theme."
      : "Kairos duplicated the published theme and verified a separate non-live Kairos Staging theme.",
    execution: {
      operation: reusedExisting ? "verifyExisting" : "themeDuplicate",
      reusedExisting,
      publishedThemeChanged: false,
      productionPublishAuthorized: false,
    },
    evidence: {
      credentialPath,
      storeDomain: config.storeDomain,
      apiVersion: config.apiVersion,
      mainTheme,
      stagingTheme,
      pollEvidence,
    },
    rollback: {
      required: false,
      instruction: "The live theme was not modified. Removing this non-live copy requires a separate explicit deletion approval.",
      stagingThemeID: stagingTheme.gid,
    },
  };
}

function validateApproval(proposalEnvelope, approval) {
  const proposal = proposalEnvelope?.proposal;
  if (!proposalEnvelope || !proposal) throw httpError(400, "staging_proposal_required", "The approved staging proposal is missing.");
  if (!approval || approval.status !== "approved") throw httpError(403, "staging_approval_required", "Explicit staging proposal approval is required.");
  if (!approval.proposalID || approval.proposalID !== proposalEnvelope.proposalID) throw httpError(409, "staging_approval_mismatch", "The approval is not bound to this proposal.");
  if (approval.operation !== "themeDuplicate" || proposal.operation !== "themeDuplicate") throw httpError(409, "staging_operation_mismatch", "Only the approved themeDuplicate operation is permitted.");
  if (!approval.sourceThemeID || approval.sourceThemeID !== proposal.sourceTheme?.gid) throw httpError(409, "staging_source_mismatch", "The approved source theme does not match the proposal.");
  if (approval.targetThemeName !== "Kairos Staging" || proposal.targetThemeName !== "Kairos Staging") throw httpError(409, "staging_target_mismatch", "The only permitted target name is Kairos Staging.");
}

async function readDuplicateContract(config, accessToken) {
  const data = await shopifyGraphQL(config, accessToken, `
    query KairosDuplicateContract {
      mutationType: __type(name: "Mutation") {
        fields(includeDeprecated: true) {
          name
          args { name type { ...TypeRef } }
          type { ...TypeRef }
        }
      }
    }
    fragment TypeRef on __Type {
      kind
      name
      ofType { kind name ofType { kind name ofType { kind name } } }
    }
  `);
  const fields = Array.isArray(data?.mutationType?.fields) ? data.mutationType.fields : [];
  return fields.find(field => field?.name === "themeDuplicate") || null;
}

async function readTypeFields(config, accessToken, typeName) {
  const data = await shopifyGraphQL(config, accessToken, `
    query KairosPayloadType($name: String!) {
      payload: __type(name: $name) {
        fields(includeDeprecated: true) { name }
      }
    }
  `, { name: typeName });
  return Array.isArray(data?.payload?.fields) ? data.payload.fields : [];
}

async function readThemes(config, accessToken) {
  const data = await shopifyGraphQL(config, accessToken, `query KairosThemeVerification { themes(first: 20) { nodes { id name role processing processingFailed } } }`);
  return Array.isArray(data?.themes?.nodes) ? data.themes.nodes.map(normalizeTheme) : [];
}

function unwrapTypeName(type) {
  let current = type;
  while (current?.ofType) current = current.ofType;
  return current?.name || "";
}

function normalizeTheme(theme) {
  const gid = String(theme?.id || "");
  return {
    id: gid.match(/OnlineStoreTheme\/(\d+)$/)?.[1] || "",
    gid,
    name: String(theme?.name || "Unnamed theme"),
    role: String(theme?.role || "UNKNOWN").toUpperCase(),
    processing: Boolean(theme?.processing),
    processingFailed: Boolean(theme?.processingFailed),
  };
}

function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "SHOPIFY_STORE_DOMAIN is missing or invalid.");
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) throw httpError(503, "shopify_invalid_version", "SHOPIFY_API_VERSION is invalid.");
  return { storeDomain, apiVersion };
}

async function resolveAccessToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  const staticToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (clientId && clientSecret) return { accessToken: await getClientCredentialsToken(config.storeDomain, clientId, clientSecret), source: "client-credentials" };
  if (staticToken) return { accessToken: staticToken, source: "admin-access-token" };
  throw httpError(503, "shopify_not_configured", "Shopify credentials are not configured.");
}

async function getClientCredentialsToken(storeDomain, clientId, clientSecret) {
  const key = `${storeDomain}:${clientId}`;
  const cached = tokenCache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.accessToken;
  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  if (!response.ok || !accessToken) throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Token request returned HTTP ${response.status}.`).slice(0, 500));
  tokenCache.set(key, { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 });
  return accessToken;
}

async function shopifyGraphQL(config, accessToken, query, variables = {}) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", `Shopify Admin GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw httpError(502, "shopify_graphql_error", body.errors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
  if (!body?.data) throw httpError(502, "shopify_graphql_empty_data", "Shopify Admin GraphQL returned no data.");
  return body.data;
}

async function readRequestJSON(request) {
  try { return await request.json(); } catch { throw httpError(400, "invalid_json", "The request body must be valid JSON."); }
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeError(error) {
  return {
    status: Number.isInteger(error?.status) ? error.status : 500,
    code: typeof error?.code === "string" ? error.code : "staging_creation_failed",
    message: error instanceof Error ? error.message : "Staging creation failed.",
  };
}

async function safeJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1000) }; }
}

function methodNotAllowed(allow) {
  const response = json({ error: { code: "method_not_allowed", message: "Method not allowed." }, build: BUILD }, 405);
  response.headers.set("Allow", allow);
  return response;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Kernel": "standalone-v6",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
