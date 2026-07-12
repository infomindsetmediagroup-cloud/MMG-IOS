import kernel from "./kairos-kernel-worker-v17.js";

const BUILD = "kairos-kernel-20260712-19";
const JOB_TTL_SECONDS = 3600;
const MAX_OBJECTIVE_CHARS = 12_000;
const MAX_SOURCE_CHARS = 50_000;
const OPENAI_TIMEOUT_MS = 25_000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/plan/jobs" && request.method === "POST") {
      return submitPlanningJob(request, env);
    }

    const match = url.pathname.match(/^\/api\/shopify\/staging\/plan\/jobs\/([a-f0-9-]+)$/i);
    if (match && request.method === "GET") {
      return readPlanningJob(request, env, match[1]);
    }

    const response = await kernel.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v19";
      body.experience = {
        ...(body.experience || {}),
        websitePlanningTransport: "openai-background-response-polling",
      };
      return json(body, response.status);
    }
    return retag(response);
  },
};

async function submitPlanningJob(request, env) {
  const submittedAt = new Date().toISOString();
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 8) return json({ status: "needs-input", error: { message: "Enter a specific website objective before starting the job." } }, 400);
    if (objective.length > MAX_OBJECTIVE_CHARS) return json({ status: "needs-input", error: { message: `Website objective exceeds ${MAX_OBJECTIVE_CHARS.toLocaleString()} characters.` } }, 413);

    const openaiKey = String(env.OPENAI_API_KEY || "").trim();
    if (!openaiKey) return json({ status: "needs-attention", error: { message: "OPENAI_API_KEY is not configured in the Worker environment." } }, 503);

    const sourceResponse = await kernel.fetch(new Request(new URL("/api/shopify/staging/source/inspect", request.url), {
      method: "POST",
      headers: { Accept: "application/json", "X-MMG-Internal": BUILD },
    }), env);
    const sourceBody = await safeJSON(sourceResponse);
    if (!sourceResponse.ok) {
      return json({
        status: "needs-attention",
        summary: sourceBody?.summary || "Kairos could not inspect the staging source.",
        error: sourceBody?.error || { message: `Source inspection returned HTTP ${sourceResponse.status}.` },
      }, sourceResponse.status);
    }

    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    const files = Array.isArray(evidence?.files)
      ? evidence.files.filter(file => file?.readable && typeof file?.content === "string")
      : [];

    if (!stagingTheme?.gid || stagingTheme.role === "MAIN") {
      return json({ status: "needs-attention", error: { message: "A verified non-live Kairos Staging theme is required." } }, 409);
    }
    if (!mainTheme?.gid || mainTheme.role !== "MAIN") {
      return json({ status: "needs-attention", error: { message: "The published Rise theme could not be verified." } }, 409);
    }
    if (!files.length) {
      return json({ status: "needs-attention", error: { message: "No readable staging source files were available for planning." } }, 409);
    }

    const sourceManifest = files.map(file => ({
      filename: file.filename,
      sha256: file.sha256,
      bytes: file.bytes,
      content: String(file.content).slice(0, 14_000),
    }));
    const boundedManifest = boundSourceManifest(sourceManifest, MAX_SOURCE_CHARS);
    const model = String(env.OPENAI_MODEL || "gpt-5.6").trim();

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        store: true,
        background: true,
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: "You are Kairos, the governed MMG website planning system. Produce an implementation-ready plan for a Shopify non-live staging theme. Use only the supplied files. Never target the MAIN theme. Never invent filenames, selectors, sections, settings, products, or source facts. Every proposed target file must exist in the supplied manifest. Keep scope minimal, reversible, and directly tied to the user's objective. Do not emit complete replacement file bodies. Describe bounded changes and verification requirements only.",
            }],
          },
          {
            role: "user",
            content: [{
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
            }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "kairos_shopify_staging_plan",
            strict: true,
            schema: planSchema(),
          },
        },
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });

    const openaiResult = await safeJSON(openaiResponse);
    if (!openaiResponse.ok || !openaiResult?.id) {
      return json({
        status: "needs-attention",
        summary: "Kairos could not submit the approval plan to OpenAI background processing.",
        error: { message: String(openaiResult?.error?.message || `OpenAI returned HTTP ${openaiResponse.status}.`).slice(0, 1000) },
      }, openaiResponse.status || 502);
    }

    const jobID = crypto.randomUUID();
    const metadata = {
      jobID,
      status: normalizeOpenAIStatus(openaiResult.status),
      build: BUILD,
      submittedAt,
      updatedAt: submittedAt,
      objective,
      model,
      openaiResponseID: openaiResult.id,
      sourceInspectionActionID: sourceBody.actionID || "",
      stagingTheme,
      mainTheme,
      files: files.map(file => ({ filename: file.filename, sha256: file.sha256, bytes: file.bytes })),
      summary: "Website job accepted. OpenAI is preparing the source-grounded approval plan.",
    };
    await writeJob(request, jobID, metadata);

    return json({
      jobID,
      status: metadata.status,
      build: BUILD,
      submittedAt,
      pollURL: `/api/shopify/staging/plan/jobs/${jobID}`,
      summary: metadata.summary,
    }, 202);
  } catch (error) {
    return json({ status: "needs-attention", error: { message: error instanceof Error ? error.message : "Kairos could not submit the website job." } }, 500);
  }
}

async function readPlanningJob(request, env, jobID) {
  const cached = await caches.default.match(jobRequest(request, jobID));
  if (!cached) return json({ jobID, status: "not-found", error: { message: "The website planning job was not found or expired." } }, 404);
  const job = await safeJSON(cached);

  if (job?.status === "completed" && job?.result) return json(job, 200);
  if (job?.status === "needs-attention") return json(job, Number(job.httpStatus || 500));

  const openaiKey = String(env.OPENAI_API_KEY || "").trim();
  if (!openaiKey) return json({ ...job, status: "needs-attention", error: { message: "OPENAI_API_KEY is not configured." } }, 503);

  const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(job.openaiResponseID)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${openaiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });
  const openaiResult = await safeJSON(response);
  if (!response.ok) {
    const failed = {
      ...job,
      status: "needs-attention",
      httpStatus: response.status,
      updatedAt: new Date().toISOString(),
      summary: "Kairos could not retrieve the background approval plan.",
      error: { message: String(openaiResult?.error?.message || `OpenAI returned HTTP ${response.status}.`).slice(0, 1000) },
    };
    await writeJob(request, jobID, failed);
    return json(failed, response.status);
  }

  const status = String(openaiResult?.status || "").toLowerCase();
  if (status === "queued" || status === "in_progress") {
    const working = {
      ...job,
      status: "working",
      updatedAt: new Date().toISOString(),
      summary: status === "queued" ? "The approval plan is queued with OpenAI." : "OpenAI is preparing the source-grounded approval plan.",
    };
    await writeJob(request, jobID, working);
    return json(working, 200);
  }

  if (status !== "completed") {
    const failed = {
      ...job,
      status: "needs-attention",
      httpStatus: 502,
      updatedAt: new Date().toISOString(),
      summary: "OpenAI did not complete the approval plan.",
      error: { message: terminalOpenAIMessage(openaiResult) },
    };
    await writeJob(request, jobID, failed);
    return json(failed, 502);
  }

  try {
    const outputText = extractOutputText(openaiResult);
    if (!outputText) throw new Error("OpenAI returned no structured planning output.");
    const plan = JSON.parse(outputText);
    validatePlanTargets(plan, job.files || []);
    const sourceHashes = Object.fromEntries((job.files || []).map(file => [file.filename, file.sha256]));
    const completedAt = new Date().toISOString();
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      status: "ready-for-approval",
      readOnly: true,
      build: BUILD,
      kernel: "standalone-v19",
      startedAt: job.submittedAt,
      completedAt,
      objective: job.objective,
      summary: plan.summary,
      plan: {
        ...plan,
        targetTheme: job.stagingTheme,
        publishedTheme: job.mainTheme,
        sourceHashes,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
      },
      evidence: {
        sourceInspectionActionID: job.sourceInspectionActionID,
        stagingTheme: job.stagingTheme,
        mainTheme: job.mainTheme,
        readableFileCount: (job.files || []).length,
        suppliedFiles: job.files || [],
        model: job.model,
        openaiResponseID: job.openaiResponseID,
        planningTransport: "openai-background-response-polling",
      },
    };
    const completed = {
      ...job,
      status: "completed",
      completedAt,
      updatedAt: completedAt,
      httpStatus: 200,
      summary: result.summary || "Website plan prepared for approval.",
      result,
    };
    await writeJob(request, jobID, completed);
    return json(completed, 200);
  } catch (error) {
    const failed = {
      ...job,
      status: "needs-attention",
      httpStatus: 502,
      updatedAt: new Date().toISOString(),
      summary: "Kairos could not validate the completed approval plan.",
      error: { message: error instanceof Error ? error.message : "The completed plan was invalid." },
    };
    await writeJob(request, jobID, failed);
    return json(failed, 502);
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
  if (!changes.length) throw new Error("The generated plan did not contain any file-level changes.");
  for (const change of changes) {
    if (!allowed.has(change?.filename)) throw new Error(`The generated plan targeted ${change?.filename || "an unknown file"}, which was not present in the verified staging source.`);
  }
}

function normalizeOpenAIStatus(status) {
  return status === "completed" ? "working" : status === "queued" ? "queued" : "working";
}

function terminalOpenAIMessage(response) {
  return String(response?.error?.message || response?.incomplete_details?.reason || `OpenAI ended with status ${response?.status || "unknown"}.`).slice(0, 1000);
}

async function writeJob(request, jobID, body) {
  await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`,
      "X-MMG-Runtime": BUILD,
    },
  }));
}

function jobRequest(request, jobID) {
  return new Request(new URL(`/_kairos/planning-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function retag(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Kernel", "standalone-v19");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function safeJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { raw: text.slice(0, 2000) }; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Kernel": "standalone-v19",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
