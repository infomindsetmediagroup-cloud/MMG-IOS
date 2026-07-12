import kernel from "./kairos-kernel-worker-v6.js";

const BUILD = "kairos-kernel-20260712-7";
const SHOPIFY_TIMEOUT_MS = 20_000;
const tokenCache = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/submit" || url.pathname === "/api/shopify/staging/create") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return submitStagingDuplication(request, env);
    }

    if (url.pathname === "/api/shopify/staging/verify") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return verifyStagingTheme(request, env);
    }

    const response = await kernel.fetch(request, env);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-v7");

    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v7";
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyStagingCreation: "resumable-submit-and-verify",
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

async function submitStagingDuplication(request, env) {
  const startedAt = new Date().toISOString();
  const actionID = crypto.randomUUID();

  try {
    const payload = await readRequestJSON(request);
    const proposalEnvelope = payload?.proposal;
    const approval = payload?.approval;
    validateApproval(proposalEnvelope, approval);

    const config = readShopifyConfig(env);
    const auth = await resolveAccessToken(config, env);
    const themes = await readThemes(config, auth.accessToken);
    const mainTheme = themes.find(theme => theme.role === "MAIN") || null;
    const existing = themes.find(theme => theme.role !== "MAIN" && theme.name.toLowerCase() === "kairos staging") || null;

    if (!mainTheme) throw httpError(409, "main_theme_not_found", "The published main theme could not be verified before execution.");
    if (mainTheme.gid !== approval.sourceThemeID) throw httpError(409, "source_theme_changed", "The approved source theme no longer matches the current published theme.");

    if (existing) {
      return json({
        actionID,
        actionType: "shopify.staging.submit",
        status: existing.processing ? "processing" : "ready-for-verification",
        build: BUILD,
        kernel: "standalone-v7",
        startedAt,
        completedAt: new Date().toISOString(),
        summary: existing.processing
          ? "Kairos found the existing non-live staging theme and Shopify is still processing it."
          : "Kairos found an existing non-live staging theme. No duplicate request was sent.",
        submitted: false,
        evidence: { credentialPath: auth.source, mainTheme, stagingTheme: existing },
      }, existing.processing ? 202 : 200);
    }

    const contract = await readDuplicateContract(config, auth.accessToken);
    if (!contract) throw httpError(409, "theme_duplicate_unavailable", "Shopify no longer exposes themeDuplicate.");
    const argNames = new Set((contract.args || []).map(arg => arg.name));
    if (!argNames.has("id") || !argNames.has("name")) throw httpError(409, "theme_duplicate_contract_changed", "themeDuplicate no longer exposes the approved id and name arguments.");

    const payloadType = unwrapTypeName(contract.type);
    const payloadFields = payloadType ? await readTypeFields(config, auth.accessToken, payloadType) : [];
    const fieldNames = new Set(payloadFields.map(field => field.name));
    const userErrorsSelection = fieldNames.has("userErrors") ? "userErrors { field message }" : "";

    const data = await shopifyGraphQL(config, auth.accessToken, `
      mutation KairosSubmitStaging($id: ID!, $name: String!) {
        themeDuplicate(id: $id, name: $name) {
          __typename
          ${userErrorsSelection}
        }
      }
    `, { id: mainTheme.gid, name: approval.targetThemeName });

    const result = data?.themeDuplicate || {};
    const userErrors = Array.isArray(result.userErrors) ? result.userErrors : [];
    if (userErrors.length) throw httpError(409, "theme_duplicate_user_error", userErrors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));

    return json({
      actionID,
      actionType: "shopify.staging.submit",
      status: "submitted",
      build: BUILD,
      kernel: "standalone-v7",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: "Shopify accepted the approved staging-theme duplication request. Verification is now a separate resumable step.",
      submitted: true,
      evidence: { credentialPath: auth.source, mainTheme, targetThemeName: approval.targetThemeName, acknowledgementType: result.__typename || payloadType || "ThemeDuplicatePayload" },
    }, 202);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({ actionID, actionType: "shopify.staging.submit", status: "needs-attention", build: BUILD, kernel: "standalone-v7", startedAt, completedAt: new Date().toISOString(), summary: "Kairos could not submit the staging-theme duplication request.", error: normalized }, normalized.status);
  }
}

async function verifyStagingTheme(request, env) {
  const startedAt = new Date().toISOString();
  const actionID = crypto.randomUUID();

  try {
    const payload = await readRequestJSON(request);
    const proposalEnvelope = payload?.proposal;
    const approval = payload?.approval;
    validateApproval(proposalEnvelope, approval);

    const config = readShopifyConfig(env);
    const auth = await resolveAccessToken(config, env);
    const themes = await readThemes(config, auth.accessToken);
    const mainTheme = themes.find(theme => theme.role === "MAIN") || null;
    const stagingTheme = themes.find(theme => theme.role !== "MAIN" && theme.name.toLowerCase() === approval.targetThemeName.toLowerCase()) || null;

    if (!mainTheme || mainTheme.gid !== approval.sourceThemeID) throw httpError(409, "main_theme_verification_failed", "The published Rise theme no longer matches the approved source theme.");

    if (!stagingTheme) {
      return json({
        actionID,
        actionType: "shopify.staging.verify",
        status: "pending",
        build: BUILD,
        kernel: "standalone-v7",
        startedAt,
        completedAt: new Date().toISOString(),
        summary: "Kairos has not discovered the non-live Kairos Staging theme yet. Retry verification shortly.",
        evidence: { credentialPath: auth.source, mainTheme, stagingTheme: null },
      }, 202);
    }

    if (stagingTheme.processingFailed) throw httpError(502, "staging_theme_processing_failed", "Shopify reported that the staging theme failed during processing.");

    if (stagingTheme.processing) {
      return json({
        actionID,
        actionType: "shopify.staging.verify",
        status: "processing",
        build: BUILD,
        kernel: "standalone-v7",
        startedAt,
        completedAt: new Date().toISOString(),
        summary: "Kairos discovered the non-live staging theme, but Shopify is still processing it.",
        evidence: { credentialPath: auth.source, mainTheme, stagingTheme },
      }, 202);
    }

    return json({
      actionID,
      actionType: "shopify.staging.verify",
      status: "completed",
      build: BUILD,
      kernel: "standalone-v7",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: "Kairos verified a separate non-live Kairos Staging theme and confirmed the published Rise theme remains unchanged.",
      execution: { operation: "themeDuplicate", publishedThemeChanged: false, productionPublishAuthorized: false },
      evidence: { credentialPath: auth.source, mainTheme, stagingTheme },
      rollback: { required: false, stagingThemeID: stagingTheme.gid, instruction: "Any future deletion requires separate explicit approval for this non-live theme ID only." },
    }, 200);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({ actionID, actionType: "shopify.staging.verify", status: "needs-attention", build: BUILD, kernel: "standalone-v7", startedAt, completedAt: new Date().toISOString(), summary: "Kairos could not verify the staging theme.", error: normalized }, normalized.status);
  }
}

function validateApproval(envelope, approval) {
  const proposal = envelope?.proposal;
  if (!envelope || !proposal) throw httpError(400, "staging_proposal_required", "The approved staging proposal is missing.");
  if (!approval || approval.status !== "approved") throw httpError(403, "staging_approval_required", "Explicit staging proposal approval is required.");
  if (approval.proposalID !== envelope.proposalID) throw httpError(409, "staging_approval_mismatch", "The approval is not bound to this proposal.");
  if (approval.operation !== "themeDuplicate" || proposal.operation !== "themeDuplicate") throw httpError(409, "staging_operation_mismatch", "Only themeDuplicate is permitted.");
  if (approval.sourceThemeID !== proposal.sourceTheme?.gid) throw httpError(409, "staging_source_mismatch", "The approved source theme does not match the proposal.");
  if (approval.targetThemeName !== "Kairos Staging" || proposal.targetThemeName !== "Kairos Staging") throw httpError(409, "staging_target_mismatch", "The only permitted target name is Kairos Staging.");
}

async function readDuplicateContract(config, accessToken) {
  const data = await shopifyGraphQL(config, accessToken, `query KairosDuplicateContract { mutationType: __type(name: "Mutation") { fields(includeDeprecated: true) { name args { name } type { kind name ofType { kind name ofType { kind name } } } } } }`);
  return (data?.mutationType?.fields || []).find(field => field?.name === "themeDuplicate") || null;
}

async function readTypeFields(config, accessToken, name) {
  const data = await shopifyGraphQL(config, accessToken, `query KairosPayloadFields($name: String!) { payload: __type(name: $name) { fields(includeDeprecated: true) { name } } }`, { name });
  return Array.isArray(data?.payload?.fields) ? data.payload.fields : [];
}

async function readThemes(config, accessToken) {
  const data = await shopifyGraphQL(config, accessToken, `query KairosThemeSnapshot { themes(first: 20) { nodes { id name role processing processingFailed } } }`);
  return Array.isArray(data?.themes?.nodes) ? data.themes.nodes.map(normalizeTheme) : [];
}

function normalizeTheme(theme) {
  const gid = String(theme?.id || "");
  return { id: gid.match(/OnlineStoreTheme\/(\d+)$/)?.[1] || "", gid, name: String(theme?.name || "Unnamed theme"), role: String(theme?.role || "UNKNOWN").toUpperCase(), processing: Boolean(theme?.processing), processingFailed: Boolean(theme?.processingFailed) };
}

function unwrapTypeName(type) { let current = type; while (current?.ofType) current = current.ofType; return current?.name || ""; }
function readShopifyConfig(env) { const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase(); const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim(); if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "SHOPIFY_STORE_DOMAIN is missing or invalid."); return { storeDomain, apiVersion }; }
async function resolveAccessToken(config, env) { const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim(); const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim(); const staticToken = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim(); if (clientId && clientSecret) return { accessToken: await getClientCredentialsToken(config.storeDomain, clientId, clientSecret), source: "client-credentials" }; if (staticToken) return { accessToken: staticToken, source: "admin-access-token" }; throw httpError(503, "shopify_not_configured", "Shopify credentials are not configured."); }
async function getClientCredentialsToken(storeDomain, clientId, clientSecret) { const key = `${storeDomain}:${clientId}`; const cached = tokenCache.get(key); if (cached?.expiresAt > Date.now()) return cached.accessToken; const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const body = await safeJSON(response); const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : ""; if (!response.ok || !accessToken) throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Token request returned HTTP ${response.status}.`).slice(0, 500)); tokenCache.set(key, { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 }); return accessToken; }
async function shopifyGraphQL(config, accessToken, query, variables = {}) { const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": accessToken }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS) }); const body = await safeJSON(response); if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", `Shopify Admin GraphQL returned HTTP ${response.status}.`); if (Array.isArray(body?.errors) && body.errors.length) throw httpError(502, "shopify_graphql_error", body.errors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000)); if (!body?.data) throw httpError(502, "shopify_graphql_empty_data", "Shopify Admin GraphQL returned no data."); return body.data; }
async function readRequestJSON(request) { try { return await request.json(); } catch { throw httpError(400, "invalid_json", "The request body must be valid JSON."); } }
function httpError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
function normalizeError(error) { return { status: Number.isInteger(error?.status) ? error.status : 500, code: typeof error?.code === "string" ? error.code : "staging_execution_failed", message: error instanceof Error ? error.message : "Staging execution failed." }; }
async function safeJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1000) }; } }
function methodNotAllowed(allow) { const response = json({ error: { code: "method_not_allowed", message: "Method not allowed." }, build: BUILD }, 405); response.headers.set("Allow", allow); return response; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Kairos-Kernel": "standalone-v7", "X-Content-Type-Options": "nosniff" } }); }
