import { createDeterministicPlan } from "./deterministic-planner.js";

export function createKairosIntelligenceRuntime(env = {}, fetcher = fetch) {
  const provider = normalizeProvider(env.KAIROS_MODEL_PROVIDER);
  const endpoint = String(env.KAIROS_MODEL_ENDPOINT || "").trim();
  const model = String(env.KAIROS_MODEL_NAME || "qwen2.5:7b-instruct").trim();
  const required = isTrue(env.KAIROS_MODEL_REQUIRED);
  const timeoutMs = clamp(Number(env.KAIROS_MODEL_TIMEOUT_MS || 15_000), 1_000, 60_000);

  return Object.freeze({
    describe() {
      return Object.freeze({
        provider,
        model: provider === "deterministic" ? null : model,
        endpointConfigured: Boolean(endpoint),
        paidApiRequired: false,
        deterministicFallback: !required,
        executionMode: provider === "deterministic" ? "offline_deterministic" : "self_hosted_with_fallback",
      });
    },

    async plan(input) {
      if (provider === "deterministic") return createDeterministicPlan(input);
      if (!endpoint) {
        if (required) throw runtimeError("MODEL_ENDPOINT_REQUIRED", "KAIROS_MODEL_ENDPOINT is required for the selected provider.", 503);
        return withFallback(createDeterministicPlan(input), "MODEL_ENDPOINT_NOT_CONFIGURED");
      }

      try {
        const plan = provider === "ollama"
          ? await requestOllamaPlan({ endpoint, model, timeoutMs, input, env, fetcher })
          : await requestOpenAICompatiblePlan({ endpoint, model, timeoutMs, input, env, fetcher });
        return normalizeModelPlan(plan, input, provider, model);
      } catch (error) {
        if (required) throw error;
        return withFallback(createDeterministicPlan(input), error?.code || "SELF_HOSTED_MODEL_UNAVAILABLE");
      }
    },
  });
}

async function requestOllamaPlan({ endpoint, model, timeoutMs, input, env, fetcher }) {
  const response = await timedFetch(
    fetcher,
    `${endpoint.replace(/\/$/, "")}/api/generate`,
    {
      method: "POST",
      headers: providerHeaders(env),
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        prompt: buildPrompt(input),
        options: { temperature: 0.1 },
      }),
    },
    timeoutMs,
  );
  const payload = await requireJsonResponse(response);
  return parseJsonObject(payload?.response, "OLLAMA_INVALID_RESPONSE");
}

async function requestOpenAICompatiblePlan({ endpoint, model, timeoutMs, input, env, fetcher }) {
  const response = await timedFetch(
    fetcher,
    `${endpoint.replace(/\/$/, "")}/v1/chat/completions`,
    {
      method: "POST",
      headers: providerHeaders(env),
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are Kairos. Return only a conservative JSON business execution plan. Never authorize production mutations." },
          { role: "user", content: buildPrompt(input) },
        ],
      }),
    },
    timeoutMs,
  );
  const payload = await requireJsonResponse(response);
  return parseJsonObject(payload?.choices?.[0]?.message?.content, "MODEL_INVALID_RESPONSE");
}

function buildPrompt(input = {}) {
  return JSON.stringify({
    objective: String(input.objective || "").trim(),
    context: input.context && typeof input.context === "object" ? input.context : {},
    requiredOutput: {
      workflowId: "string",
      domain: "string",
      requiresApproval: "boolean",
      stages: [{ order: 1, action: "string", status: "pending" }],
      constraints: ["string"],
    },
    governingRules: [
      "Autonomy level is draft mode unless a signed workflow manifest proves otherwise.",
      "Pricing, publication, production deployment, customer communications, financial commitments, permission changes, and destructive actions require approval.",
      "Prefer deterministic tools and validators over model judgment.",
    ],
  });
}

function normalizeModelPlan(plan, input, provider, model) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw runtimeError("MODEL_PLAN_INVALID", "The self-hosted model did not return a plan object.", 502);
  }
  const fallback = createDeterministicPlan(input);
  const stages = Array.isArray(plan.stages) && plan.stages.length
    ? plan.stages.slice(0, 30).map((stage, index) => ({
        order: index + 1,
        action: String(stage?.action || stage || "").trim() || `Stage ${index + 1}`,
        status: "pending",
      }))
    : fallback.stages;

  return Object.freeze({
    planVersion: "1.0",
    mode: "self_hosted_model",
    provider,
    model,
    objective: fallback.objective,
    workflowId: String(plan.workflowId || fallback.workflowId),
    domain: String(plan.domain || fallback.domain),
    autonomyLevel: 2,
    executionPolicy: Boolean(plan.requiresApproval) ? "draft_then_approval" : fallback.executionPolicy,
    requiresApproval: Boolean(plan.requiresApproval || fallback.requiresApproval),
    stages,
    constraints: Array.isArray(plan.constraints)
      ? [...new Set([...plan.constraints.map(String), ...fallback.constraints])].slice(0, 30)
      : fallback.constraints,
    context: fallback.context,
    generatedAt: new Date().toISOString(),
  });
}

function withFallback(plan, reason) {
  return Object.freeze({ ...plan, fallback: true, fallbackReason: reason });
}

async function timedFetch(fetcher, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw runtimeError("MODEL_TIMEOUT", "The self-hosted model timed out.", 504);
    throw runtimeError("MODEL_UNAVAILABLE", "The self-hosted model could not be reached.", 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function requireJsonResponse(response) {
  if (!response?.ok) throw runtimeError("MODEL_HTTP_ERROR", `The self-hosted model returned HTTP ${response?.status || 502}.`, 502);
  try {
    return await response.json();
  } catch {
    throw runtimeError("MODEL_RESPONSE_NOT_JSON", "The self-hosted model response was not JSON.", 502);
  }
}

function parseJsonObject(value, code) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
    return parsed;
  } catch {
    throw runtimeError(code, "The self-hosted model returned invalid structured output.", 502);
  }
}

function providerHeaders(env) {
  const headers = { "Content-Type": "application/json" };
  const token = String(env.KAIROS_MODEL_AUTH_TOKEN || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function normalizeProvider(value) {
  const provider = String(value || "deterministic").trim().toLowerCase();
  if (["deterministic", "ollama", "openai-compatible"].includes(provider)) return provider;
  throw runtimeError("MODEL_PROVIDER_UNSUPPORTED", `Unsupported KAIROS_MODEL_PROVIDER: ${provider}`, 503);
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function isTrue(value) {
  return String(value || "").toLowerCase() === "true";
}

function runtimeError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
