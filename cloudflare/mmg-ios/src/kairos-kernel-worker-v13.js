import kernel from "./kairos-kernel-worker-v12.js";

const BUILD = "kairos-kernel-20260712-13";
const JSON_POLICY = "Execution compatibility requirement: do not propose modifications to any .json Shopify theme file in this job. Use only verified non-JSON Liquid or CSS source files. Preserve templates/index.json, config/settings_data.json, and all section-group JSON files unchanged.";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/plan" && request.method === "POST") {
      return buildJsonSafePlan(request, env, ctx);
    }

    const response = await kernel.fetch(request, env, ctx);
    return withRuntimeHeaders(response);
  },
};

async function buildJsonSafePlan(request, env, ctx) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    const governedObjective = `${objective}\n\n${JSON_POLICY}`;

    const delegated = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...payload, objective: governedObjective }),
    });

    const response = await kernel.fetch(delegated, env, ctx);
    const body = await safeJSON(response.clone());

    if (!response.ok) return withRuntimeHeaders(response);

    const changes = Array.isArray(body?.plan?.changes) ? body.plan.changes : [];
    const jsonTargets = changes.filter(change => change?.changeType === "modify" && String(change?.filename || "").toLowerCase().endsWith(".json"));
    const safeChanges = changes.filter(change => !(change?.changeType === "modify" && String(change?.filename || "").toLowerCase().endsWith(".json")));
    const executable = safeChanges.filter(change => change?.changeType === "modify");

    if (!executable.length) {
      return json({
        actionID: body?.actionID || crypto.randomUUID(),
        actionType: "shopify.staging.plan",
        status: "needs-attention",
        build: BUILD,
        kernel: "standalone-v13",
        summary: "Kairos could not produce a safe non-JSON staging plan for this objective.",
        error: {
          status: 409,
          code: "json_only_plan_blocked",
          message: "The generated plan depended only on Shopify JSON files. Those files remain protected until the structured JSON patch engine is enabled.",
        },
        evidence: {
          blockedTargets: jsonTargets.map(change => change.filename),
          jsonWritePolicy: "protected",
        },
      }, 409);
    }

    body.build = BUILD;
    body.kernel = "standalone-v13";
    body.objective = objective;
    body.plan = {
      ...(body.plan || {}),
      changes: safeChanges,
      jsonWritePolicy: "protected",
      protectedJsonTargets: jsonTargets.map(change => change.filename),
    };
    body.evidence = {
      ...(body.evidence || {}),
      jsonWritePolicy: "protected",
      protectedJsonTargets: jsonTargets.map(change => change.filename),
    };
    body.summary = jsonTargets.length
      ? `${body.summary || "Staging plan prepared."} Shopify JSON files were excluded from execution and remain unchanged.`
      : body.summary;

    return json(body, 200);
  } catch (error) {
    return json({
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      status: "needs-attention",
      build: BUILD,
      kernel: "standalone-v13",
      summary: "Kairos could not prepare the JSON-safe staging plan.",
      error: {
        status: 400,
        code: "json_safe_plan_failed",
        message: error instanceof Error ? error.message : "The planning request failed.",
      },
    }, 400);
  }
}

function withRuntimeHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Kernel", "standalone-v13");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
      "X-Kairos-Kernel": "standalone-v13",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
