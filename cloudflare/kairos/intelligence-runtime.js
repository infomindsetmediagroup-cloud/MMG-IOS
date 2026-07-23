import { createDeterministicPlan } from "./deterministic-planner.js";

const MAX_MODEL_RESPONSE_BYTES = 1_000_000;
const MAX_MODEL_STAGES = 24;
const MAX_MODEL_CONSTRAINTS = 30;
const MAX_STAGE_ACTION_LENGTH = 500;
const MAX_CONSTRAINT_LENGTH = 1_000;

export function createKairosIntelligenceRuntime(env = {}, fetcher = fetch) {
  const provider = normalizeProvider(env.KAIROS_MODEL_PROVIDER);
  const endpoint = provider === "deterministic"
    ? ""
    : normalizeModelEndpoint(env.KAIROS_MODEL_ENDPOINT, env);
  const model = String(env.KAIROS_MODEL_NAME || "qwen2.5:7b-instruct").trim().slice(0, 200);
  const required = isTrue(env.KAIROS_MODEL_REQUIRED);
  const timeoutMs = clamp(Number(env.KAIROS_MODEL_TIMEOUT_MS || 15_000), 1_000, 60_000);

  return Object.freeze({
    describe() {
      return Object.freeze({
        provider,
        model: provider === "deterministic" ? null : model,
        endpointConfigured: Boolean(endpoint),
        endpointSecurity: endpoint ? new URL(endpoint).protocol.replace(":", "") : null,
        modelRequired: required,
        paidApiRequired: false,
        deterministicFallback: !required,
        executionMode: provider === "deterministic" ? "offline_deterministic" : "self_hosted_with_fallback",
      });
    },

    async plan(input) {
      const deterministicPlan = createDeterministicPlan(input);
      if (provider === "deterministic") return deterministicPlan;
      if (!endpoint) {
        if (required) throw runtimeError("MODEL_ENDPOINT_REQUIRED", "KAIROS_MODEL_ENDPOINT is required for the selected provider.", 503);
        return withFallback(deterministicPlan, "MODEL_ENDPOINT_NOT_CONFIGURED");
      }

      const safeInput = {
        objective: deterministicPlan.objective,
        context: deterministicPlan.context,
      };

      try {
        const plan = provider === "ollama"
          ? await requestOllamaPlan({ endpoint, model, timeoutMs, input: safeInput, env, fetcher })
          : await requestOpenAICompatiblePlan({ endpoint, model, timeoutMs, input: safeInput, env, fetcher });
        return normalizeModelPlan(plan, deterministicPlan, provider, model);
      } catch (error) {
        if (required) throw error;
        return withFallback(deterministicPlan, error?.code || "SELF_HOSTED_MODEL_UNAVAILABLE");
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
          {
            role: "system",
            content: "You are Kairos. Return only a conservative JSON execution-plan refinement. You may refine stages and constraints, but you cannot choose the workflow, lower approval requirements, or authorize any mutation.",
          },
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
      requiresApproval: "boolean",
      stages: [{ order: 1, action: "string", status: "pending" }],
      constraints: ["string"],
    },
    governingRules: [
      "The deterministic policy engine has already selected the workflow and business domain.",
      "You cannot change workflow identity or reduce an approval requirement.",
      "Autonomy level is draft mode unless a signed workflow manifest proves otherwise.",
      "Pricing, publication, production deployment, customer communications, financial commitments, permission changes, and destructive actions require approval.",
      "Prefer deterministic tools and validators over model judgment.",
    ],
  });
}

function normalizeModelPlan(plan, fallback, provider, model) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw runtimeError("MODEL_PLAN_INVALID", "The self-hosted model did not return a plan object.", 502);
  }

  const stages = Array.isArray(plan.stages) && plan.stages.length
    ? plan.stages
        .slice(0, MAX_MODEL_STAGES)
        .map((stage, index) => ({
          order: index + 1,
          action: cleanModelText(stage?.action || stage, MAX_STAGE_ACTION_LENGTH) || `Stage ${index + 1}`,
          status: "pending",
        }))
    : fallback.stages;

  const modelConstraints = Array.isArray(plan.constraints)
    ? plan.constraints
        .map((constraint) => cleanModelText(constraint, MAX_CONSTRAINT_LENGTH))
        .filter(Boolean)
    : [];
  const constraints = [...new Set([...modelConstraints, ...fallback.constraints])].slice(0, MAX_MODEL_CONSTRAINTS);
  const requiresApproval = fallback.requiresApproval || plan.requiresApproval === true;

  return Object.freeze({
    planVersion: "1.0",
    mode: "self_hosted_model",
    provider,
    model,
    objective: fallback.objective,
    workflowId: fallback.workflowId,
    domain: fallback.domain,
    autonomyLevel: 2,
    executionPolicy: requiresApproval ? "draft_then_approval" : fallback.executionPolicy,
    requiresApproval,
    stages,
    constraints,
    context: fallback.context,
    generatedAt: new Date().toISOString(),
  });
}

function withFallback(plan, reason) {
  return Object.freeze({ ...plan, fallback: true, fallbackReason: String(reason || "MODEL_FALLBACK") });
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
  const declaredLength = Number(response.headers?.get?.("Content-Length") || 0);
  if (declaredLength > MAX_MODEL_RESPONSE_BYTES) {
    throw runtimeError("MODEL_RESPONSE_TOO_LARGE", "The self-hosted model response exceeded the maximum size.", 502);
  }

  let text;
  try {
    text = await response.text();
  } catch {
    throw runtimeError("MODEL_RESPONSE_UNREADABLE", "The self-hosted model response could not be read.", 502);
  }
  if (new TextEncoder().encode(text).byteLength > MAX_MODEL_RESPONSE_BYTES) {
    throw runtimeError("MODEL_RESPONSE_TOO_LARGE", "The self-hosted model response exceeded the maximum size.", 502);
  }
  try {
    return JSON.parse(text);
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
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Kairos-Client": "mmg-kairos-self-hosted-runtime/1.0",
  };
  const token = String(env.KAIROS_MODEL_AUTH_TOKEN || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function normalizeProvider(value) {
  const provider = String(value || "deterministic").trim().toLowerCase();
  if (["deterministic", "ollama", "openai-compatible"].includes(provider)) return provider;
  throw runtimeError("MODEL_PROVIDER_UNSUPPORTED", `Unsupported KAIROS_MODEL_PROVIDER: ${provider}`, 503);
}

function normalizeModelEndpoint(value, env) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw runtimeError("MODEL_ENDPOINT_INVALID", "KAIROS_MODEL_ENDPOINT must be an absolute URL.", 503);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw runtimeError("MODEL_ENDPOINT_INVALID", "The model endpoint cannot contain credentials, a query string, or a fragment.", 503);
  }

  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const insecureAllowed = loopback || isTrue(env.KAIROS_ALLOW_INSECURE_MODEL_ENDPOINT);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && insecureAllowed)) {
    throw runtimeError("MODEL_ENDPOINT_INSECURE", "The self-hosted model endpoint must use HTTPS outside local development.", 503);
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${normalizedPath}`;
}

function cleanModelText(value, maximumLength) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maximumLength);
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
