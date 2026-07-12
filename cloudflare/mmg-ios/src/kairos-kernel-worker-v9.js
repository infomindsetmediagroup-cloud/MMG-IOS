import kernel from "./kairos-kernel-worker-v8.js";

const BUILD = "kairos-kernel-20260712-9";
const OPENAI_TIMEOUT_MS = 45_000;
const MAX_SOURCE_CHARS = 50_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/plan") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return buildSourceGroundedPlan(request, env);
    }

    const response = await kernel.fetch(request, env);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-v9");

    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v9";
      body.capabilities = {
        ...(body.capabilities || {}),
        shopifyStagingSourceInspection: "verified-read-only",
        shopifyThemePlanning: "available-source-grounded-read-only",
        shopifyThemeMutation: "locked-pending-plan-approval",
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

async function buildSourceGroundedPlan(request, env) {
  const startedAt = new Date().toISOString();
  const actionID = crypto.randomUUID();

  try {
    const payload = await readRequestJSON(request);
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 8) {
      throw httpError(400, "objective_required", "Enter a specific website objective before generating the staging plan.");
    }
    if (objective.length > 2000) {
      throw httpError(400, "objective_too_long", "The website objective must be 2,000 characters or fewer.");
    }

    const openaiKey = String(env.OPENAI_API_KEY || "").trim();
    if (!openaiKey) throw httpError(503, "openai_not_configured", "OPENAI_API_KEY is not configured in the Worker environment.");

    const sourceRequest = new Request(new URL("/api/shopify/staging/source/inspect", request.url), {
      method: "POST",
      headers: { Accept: "application/json", "X-MMG-Internal": BUILD },
    });
    const sourceResponse = await kernel.fetch(sourceRequest, env);
    const sourceBody = await safeJSON(sourceResponse);
    if (!sourceResponse.ok) {
      throw httpError(sourceResponse.status, sourceBody?.error?.code || "staging_source_unavailable", sourceBody?.error?.message || sourceBody?.summary || "Kairos could not read the staging source.");
    }

    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    const files = Array.isArray(evidence?.files) ? evidence.files.filter(file => file?.readable && typeof file?.content === "string") : [];
    if (!stagingTheme?.gid || stagingTheme.role === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
    if (!files.length) throw httpError(409, "readable_staging_source_required", "No readable staging source files were available for planning.");

    const sourceManifest = files.map(file => ({
      filename: file.filename,
      sha256: file.sha256,
      bytes: file.bytes,
      content: String(file.content).slice(0, 14_000),
    }));
    const boundedManifest = boundSourceManifest(sourceManifest, MAX_SOURCE_CHARS);

    const schema = planSchema();
    const model = String(env.OPENAI_MODEL || "gpt-5.6").trim();
    const openaiBody = {
      model,
      store: false,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are Kairos, the governed MMG website planning system. Produce an implementation-ready plan for a Shopify non-live staging theme. Use only the supplied files. Never target the MAIN theme. Never invent filenames, selectors, sections, settings, products, or source facts. Every proposed target file must exist in the supplied manifest. Keep scope minimal, reversible, and directly tied to the user's objective. Do not emit complete replacement file bodies. Describe bounded changes and verification requirements only.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                objective,
                governance: {
                  targetTheme: stagingTheme,
                  publishedTheme: mainTheme,
                  liveThemeWritesAllowed: false,
                  productionPublishAllowed: false,
                  requireSourceHashMatch: true,
                  requireReadBackVerification: true,
                  requireRollback: true,
                },
                sourceManifest: boundedManifest,
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "kairos_shopify_staging_plan",
          strict: true,
          schema,
        },
      },
    };

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(openaiBody),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
    const openaiResult = await safeJSON(openaiResponse);
    if (!openaiResponse.ok) {
      throw httpError(openaiResponse.status, "openai_planning_failed", String(openaiResult?.error?.message || `OpenAI returned HTTP ${openaiResponse.status}.`).slice(0, 1000));
    }

    const outputText = extractOutputText(openaiResult);
    if (!outputText) throw httpError(502, "openai_empty_plan", "OpenAI returned no structured planning output.");

    let plan;
    try { plan = JSON.parse(outputText); }
    catch { throw httpError(502, "openai_invalid_plan_json", "OpenAI returned planning output that was not valid JSON."); }

    validatePlanTargets(plan, files);
    const sourceHashes = Object.fromEntries(files.map(file => [file.filename, file.sha256]));
    const planID = crypto.randomUUID();

    return json({
      actionID,
      planID,
      actionType: "shopify.staging.plan",
      status: "ready-for-approval",
      readOnly: true,
      build: BUILD,
      kernel: "standalone-v9",
      startedAt,
      completedAt: new Date().toISOString(),
      objective,
      summary: plan.summary,
      plan: {
        ...plan,
        targetTheme: stagingTheme,
        publishedTheme: mainTheme,
        sourceHashes,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
      },
      evidence: {
        sourceInspectionActionID: sourceBody.actionID,
        stagingTheme,
        mainTheme,
        readableFileCount: files.length,
        suppliedFiles: files.map(file => ({ filename: file.filename, sha256: file.sha256, bytes: file.bytes })),
        model,
        openaiResponseID: openaiResult?.id || "",
      },
    }, 200);
  } catch (error) {
    const normalized = normalizeError(error);
    return json({
      actionID,
      actionType: "shopify.staging.plan",
      status: "needs-attention",
      readOnly: true,
      build: BUILD,
      kernel: "standalone-v9",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: "Kairos could not generate the source-grounded staging plan.",
      error: normalized,
    }, normalized.status);
  }
}

function planSchema() {
  const stringArray = { type: "array", items: { type: "string" } };
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "strategy", "changes", "risks", "acceptanceCriteria", "rollbackPlan"],
    properties: {
      summary: { type: "string" },
      strategy: { type: "string" },
      changes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["filename", "purpose", "changeType", "instructions", "expectedOutcome"],
          properties: {
            filename: { type: "string" },
            purpose: { type: "string" },
            changeType: { type: "string", enum: ["modify", "no-change"] },
            instructions: stringArray,
            expectedOutcome: { type: "string" },
          },
        },
      },
      risks: stringArray,
      acceptanceCriteria: stringArray,
      rollbackPlan: stringArray,
    },
  };
}

function boundSourceManifest(files, maxChars) {
  const output = [];
  let used = 0;
  for (const file of files) {
    const remaining = Math.max(0, maxChars - used);
    if (!remaining) break;
    const content = file.content.slice(0, remaining);
    output.push({ ...file, content });
    used += content.length;
  }
  return output;
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

function validatePlanTargets(plan, files) {
  const allowed = new Set(files.map(file => file.filename));
  const changes = Array.isArray(plan?.changes) ? plan.changes : [];
  if (!changes.length) throw httpError(502, "plan_has_no_changes", "The generated plan did not contain any file-level changes.");
  for (const change of changes) {
    if (!allowed.has(change?.filename)) {
      throw httpError(502, "plan_target_not_in_source", `The generated plan targeted ${change?.filename || "an unknown file"}, which was not present in the verified staging source.`);
    }
  }
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
    code: typeof error?.code === "string" ? error.code : "staging_plan_failed",
    message: error instanceof Error ? error.message : "Staging planning failed.",
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
      "X-Kairos-Kernel": "standalone-v9",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
