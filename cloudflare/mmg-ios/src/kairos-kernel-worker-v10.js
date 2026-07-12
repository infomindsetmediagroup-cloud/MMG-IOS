import kernel from "./kairos-kernel-worker-v9.js";

const BUILD = "kairos-kernel-20260712-10";
const SHOPIFY_TIMEOUT_MS = 25_000;
const OPENAI_TIMEOUT_MS = 60_000;
const MAX_TARGET_FILES = 5;
const MAX_TOTAL_SOURCE_CHARS = 70_000;
const tokenCache = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/execute") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return executeApprovedPlan(request, env);
    }

    const response = await kernel.fetch(request, env);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-v10");

    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v10";
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyThemePlanning: "available-source-grounded",
        shopifyThemeMutation: "available-staging-only-with-explicit-approval",
        shopifyProductionPublish: "locked",
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

async function executeApprovedPlan(request, env) {
  const startedAt = new Date().toISOString();
  const actionID = crypto.randomUUID();

  try {
    const payload = await readRequestJSON(request);
    const planEnvelope = payload?.plan;
    const approval = payload?.approval;
    validateApproval(planEnvelope, approval);

    const openaiKey = String(env.OPENAI_API_KEY || "").trim();
    if (!openaiKey) throw httpError(503, "openai_not_configured", "OPENAI_API_KEY is not configured in the Worker environment.");

    const sourceRequest = new Request(new URL("/api/shopify/staging/source/inspect", request.url), {
      method: "POST",
      headers: { Accept: "application/json", "X-MMG-Internal": BUILD },
    });
    const sourceResponse = await kernel.fetch(sourceRequest, env);
    const sourceBody = await safeJSON(sourceResponse);
    if (!sourceResponse.ok) {
      throw httpError(sourceResponse.status, sourceBody?.error?.code || "staging_source_unavailable", sourceBody?.error?.message || sourceBody?.summary || "Kairos could not re-read the staging source.");
    }

    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    const sourceFiles = Array.isArray(evidence?.files)
      ? evidence.files.filter(file => file?.readable && typeof file?.content === "string")
      : [];

    if (!stagingTheme?.gid || stagingTheme.role === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
    if (stagingTheme.gid !== approval.targetThemeID || stagingTheme.gid !== planEnvelope?.plan?.targetTheme?.gid) {
      throw httpError(409, "staging_theme_changed", "The approved staging theme no longer matches the current verified staging theme.");
    }
    if (!mainTheme?.gid || mainTheme.role !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The published main theme could not be verified before staging execution.");

    const changes = (Array.isArray(planEnvelope?.plan?.changes) ? planEnvelope.plan.changes : [])
      .filter(change => change?.changeType === "modify");
    if (!changes.length) throw httpError(409, "approved_plan_has_no_modifications", "The approved plan contains no file modifications to execute.");
    if (changes.length > MAX_TARGET_FILES) throw httpError(409, "approved_plan_too_broad", `The approved plan targets ${changes.length} files; the execution limit is ${MAX_TARGET_FILES}.`);

    const currentByName = new Map(sourceFiles.map(file => [file.filename, file]));
    const originals = [];
    let totalChars = 0;

    for (const change of changes) {
      const filename = String(change.filename || "");
      const current = currentByName.get(filename);
      if (!current) throw httpError(409, "approved_target_missing", `The approved target ${filename} is not readable in the current staging source.`);
      const approvedHash = approval?.sourceHashes?.[filename];
      const planHash = planEnvelope?.plan?.sourceHashes?.[filename];
      if (!approvedHash || approvedHash !== planHash || approvedHash !== current.sha256) {
        throw httpError(409, "source_hash_mismatch", `The current source hash for ${filename} does not match the approved plan. Generate and approve a new plan.`);
      }
      totalChars += current.content.length;
      if (totalChars > MAX_TOTAL_SOURCE_CHARS) throw httpError(409, "approved_source_too_large", "The approved target source exceeds the execution size limit.");
      originals.push({
        filename,
        sha256: current.sha256,
        content: current.content,
        instructions: Array.isArray(change.instructions) ? change.instructions : [],
        purpose: String(change.purpose || ""),
        expectedOutcome: String(change.expectedOutcome || ""),
      });
    }

    const replacements = await generateReplacementBodies(openaiKey, env, planEnvelope, originals);
    validateReplacementSet(replacements, originals);

    const prepared = [];
    for (const replacement of replacements) {
      const original = originals.find(item => item.filename === replacement.filename);
      const afterHash = await sha256(replacement.content);
      if (afterHash === original.sha256) throw httpError(409, "generated_content_unchanged", `Generated replacement for ${replacement.filename} is identical to the current source.`);
      prepared.push({
        filename: replacement.filename,
        content: replacement.content,
        beforeSha256: original.sha256,
        afterSha256: afterHash,
        beforeBytes: new TextEncoder().encode(original.content).length,
        afterBytes: new TextEncoder().encode(replacement.content).length,
      });
    }

    const config = readShopifyConfig(env);
    const auth = await resolveAccessToken(config, env);
    const contract = await inspectUpsertContract(config, auth.accessToken);
    const mutationResult = await writeThemeFiles(config, auth.accessToken, stagingTheme.gid, prepared, contract);

    const verifyRequest = new Request(new URL("/api/shopify/staging/source/inspect", request.url), {
      method: "POST",
      headers: { Accept: "application/json", "X-MMG-Internal": BUILD },
    });
    const verifyResponse = await kernel.fetch(verifyRequest, env);
    const verifyBody = await safeJSON(verifyResponse);
    if (!verifyResponse.ok) throw httpError(verifyResponse.status, verifyBody?.error?.code || "staging_readback_failed", verifyBody?.error?.message || verifyBody?.summary || "Kairos could not read back the staging files after writing.");

    const readBackFiles = Array.isArray(verifyBody?.evidence?.files) ? verifyBody.evidence.files : [];
    const readBackByName = new Map(readBackFiles.map(file => [file.filename, file]));
    const verification = prepared.map(item => {
      const readBack = readBackByName.get(item.filename);
      return {
        filename: item.filename,
        expectedSha256: item.afterSha256,
        actualSha256: readBack?.sha256 || "",
        matched: Boolean(readBack?.sha256 && readBack.sha256 === item.afterSha256),
      };
    });

    if (verification.some(item => !item.matched)) {
      throw httpError(502, "staging_readback_hash_mismatch", "One or more staging files did not match the expected post-write hash. Use the returned source evidence to investigate before any further action.");
    }

    const afterMain = verifyBody?.evidence?.mainTheme;
    const afterStaging = verifyBody?.evidence?.stagingTheme;
    if (!afterMain?.gid || afterMain.gid !== mainTheme.gid || afterMain.role !== "MAIN") {
      throw httpError(502, "main_theme_changed_during_staging_write", "The published main theme did not remain unchanged during staging execution.");
    }
    if (!afterStaging?.gid || afterStaging.gid !== stagingTheme.gid || afterStaging.role === "MAIN") {
      throw httpError(502, "staging_theme_verification_failed", "The staging theme boundary could not be verified after execution.");
    }

    return json({
      actionID,
      actionType: "shopify.staging.execute",
      status: "completed",
      build: BUILD,
      kernel: "standalone-v10",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: `Kairos wrote and verified ${prepared.length} approved file${prepared.length === 1 ? "" : "s"} on the non-live Kairos Staging theme.`,
      objective: planEnvelope.objective,
      execution: {
        operation: "themeFilesUpsert",
        targetTheme: afterStaging,
        publishedTheme: afterMain,
        publishedThemeChanged: false,
        productionPublishAuthorized: false,
        filesWritten: prepared.map(item => ({
          filename: item.filename,
          beforeSha256: item.beforeSha256,
          afterSha256: item.afterSha256,
          beforeBytes: item.beforeBytes,
          afterBytes: item.afterBytes,
        })),
      },
      verification,
      evidence: {
        credentialPath: auth.source,
        sourceInspectionActionID: sourceBody.actionID,
        readBackInspectionActionID: verifyBody.actionID,
        mutationContract: contract,
        mutationResult,
      },
      rollback: {
        required: false,
        authorized: false,
        targetThemeID: stagingTheme.gid,
        files: originals.map(item => ({ filename: item.filename, sha256: item.sha256, content: item.content })),
        instruction: "Rollback requires a separate explicit approval and must write these original bodies only to the same non-live Kairos Staging theme.",
      },
    }, 200);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({
      actionID,
      actionType: "shopify.staging.execute",
      status: "needs-attention",
      build: BUILD,
      kernel: "standalone-v10",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: "Kairos could not complete the approved staging execution.",
      error: normalized,
    }, normalized.status);
  }
}

async function generateReplacementBodies(openaiKey, env, planEnvelope, originals) {
  const model = String(env.OPENAI_MODEL || "gpt-5.6").trim();
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["files"],
    properties: {
      files: {
        type: "array",
        minItems: originals.length,
        maxItems: originals.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["filename", "content"],
          properties: {
            filename: { type: "string" },
            content: { type: "string" },
          },
        },
      },
    },
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: "You are Kairos, the governed MMG Shopify staging implementation engine. Return complete replacement bodies only for the supplied approved files. Preserve valid Liquid, JSON, CSS, and Shopify syntax. Do not invent filenames or modify anything outside the approved instructions. Keep changes minimal and reversible. Do not include markdown fences or explanations.",
          }],
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              objective: planEnvelope.objective,
              strategy: planEnvelope?.plan?.strategy,
              acceptanceCriteria: planEnvelope?.plan?.acceptanceCriteria,
              files: originals,
            }),
          }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "kairos_shopify_staging_replacements",
          strict: true,
          schema,
        },
      },
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });

  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status, "openai_execution_generation_failed", String(body?.error?.message || `OpenAI returned HTTP ${response.status}.`).slice(0, 1000));
  const outputText = extractOutputText(body);
  if (!outputText) throw httpError(502, "openai_empty_execution_output", "OpenAI returned no replacement file output.");
  let parsed;
  try { parsed = JSON.parse(outputText); }
  catch { throw httpError(502, "openai_invalid_execution_json", "OpenAI returned replacement output that was not valid JSON."); }
  return Array.isArray(parsed?.files) ? parsed.files : [];
}

function validateReplacementSet(replacements, originals) {
  if (replacements.length !== originals.length) throw httpError(502, "replacement_file_count_mismatch", "The generated replacement set did not match the approved file count.");
  const allowed = new Set(originals.map(item => item.filename));
  const seen = new Set();
  for (const item of replacements) {
    const filename = String(item?.filename || "");
    if (!allowed.has(filename)) throw httpError(502, "replacement_target_not_approved", `Generated replacement targeted unapproved file ${filename || "unknown"}.`);
    if (seen.has(filename)) throw httpError(502, "replacement_target_duplicated", `Generated replacement duplicated ${filename}.`);
    if (typeof item?.content !== "string" || !item.content.length) throw httpError(502, "replacement_content_missing", `Generated replacement for ${filename} has no content.`);
    seen.add(filename);
  }
}

async function inspectUpsertContract(config, accessToken) {
  const data = await shopifyGraphQL(config, accessToken, `
    query KairosThemeFilesUpsertContract {
      mutationType: __type(name: "Mutation") {
        fields(includeDeprecated: true) {
          name
          args { name type { ...TypeRef } }
          type { ...TypeRef }
        }
      }
    }
    fragment TypeRef on __Type {
      kind name ofType { kind name ofType { kind name ofType { kind name } } }
    }
  `);
  const field = (data?.mutationType?.fields || []).find(item => item?.name === "themeFilesUpsert");
  if (!field) throw httpError(409, "theme_files_upsert_unavailable", "Shopify did not expose themeFilesUpsert.");
  const args = Object.fromEntries((field.args || []).map(arg => [arg.name, formatType(arg.type)]));
  if (!args.themeId || !args.files) throw httpError(409, "theme_files_upsert_contract_changed", "themeFilesUpsert does not expose the expected themeId and files arguments.");
  return { name: field.name, arguments: args, returnType: formatType(field.type) };
}

async function writeThemeFiles(config, accessToken, themeID, prepared, contract) {
  const data = await shopifyGraphQL(config, accessToken, `
    mutation KairosWriteApprovedStagingFiles($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }
  `, {
    themeId: themeID,
    files: prepared.map(item => ({
      filename: item.filename,
      body: { type: "TEXT", value: item.content },
    })),
  });
  const result = data?.themeFilesUpsert || {};
  const userErrors = Array.isArray(result.userErrors) ? result.userErrors : [];
  if (userErrors.length) throw httpError(409, "theme_files_upsert_user_error", userErrors.map(item => item?.message).filter(Boolean).join(" | ").slice(0, 1000));
  return {
    contract,
    upsertedThemeFiles: Array.isArray(result.upsertedThemeFiles) ? result.upsertedThemeFiles : [],
  };
}

function validateApproval(planEnvelope, approval) {
  const plan = planEnvelope?.plan;
  if (!planEnvelope || !plan) throw httpError(400, "staging_plan_required", "The approved staging plan is missing.");
  if (!approval || approval.status !== "approved") throw httpError(403, "staging_plan_approval_required", "Explicit staging plan approval is required.");
  if (!approval.planID || approval.planID !== planEnvelope.planID) throw httpError(409, "staging_plan_approval_mismatch", "The approval is not bound to this staging plan.");
  if (!approval.targetThemeID || approval.targetThemeID !== plan.targetTheme?.gid) throw httpError(409, "staging_plan_target_mismatch", "The approved staging theme does not match the plan target.");
  if (approval.objective !== planEnvelope.objective) throw httpError(409, "staging_plan_objective_mismatch", "The approved objective does not match the staging plan.");
  if (!approval.sourceHashes || JSON.stringify(approval.sourceHashes) !== JSON.stringify(plan.sourceHashes || {})) throw httpError(409, "staging_plan_hash_manifest_mismatch", "The approval source-hash manifest does not match the plan.");
  if (plan.productionPublishAuthorized || plan.liveThemeMutationAuthorized) throw httpError(409, "production_authority_forbidden", "The staging plan contains forbidden production authority.");
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content?.text === "string" && content.text.trim()) return content.text.trim();
    }
  }
  return "";
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

function formatType(type) {
  if (!type) return "unknown";
  if (type.kind === "NON_NULL") return `${formatType(type.ofType)}!`;
  if (type.kind === "LIST") return `[${formatType(type.ofType)}]`;
  return type.name || type.kind || "unknown";
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readRequestJSON(request) {
  try { return await request.json(); }
  catch { throw httpError(400, "invalid_json", "The request body must be valid JSON."); }
}

async function safeJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { raw: text.slice(0, 2000) }; }
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeError(error) {
  return {
    status: Number.isInteger(error?.status) ? error.status : 500,
    code: typeof error?.code === "string" ? error.code : "staging_execution_failed",
    message: error instanceof Error ? error.message : "Staging execution failed.",
  };
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
      "X-Kairos-Kernel": "standalone-v10",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
