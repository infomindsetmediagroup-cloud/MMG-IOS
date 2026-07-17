const DEFAULT_SELF_HOSTED_MODEL = "Qwen3.6-35B-A3B";
const DEFAULT_ACCOUNT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const HEALTH_CACHE_MS = 15 * 60 * 1000;
const CONTROL_OBJECT = "kairos-intelligence-control-v1";
const STRUCTURED_OUTPUT_ATTEMPTS = 3;

export const KAIROS_PROVIDER_POLICY = Object.freeze({
  openai: "prohibited",
  openAIModels: "prohibited",
  externalHostedModelAPIs: "prohibited",
  selfHostedInference: "preferred",
  cloudflareAccountInference: "permitted-with-customer-content-isolation",
  customerContentTraining: "prohibited",
  permittedInference: Object.freeze(["mmg-controlled-vllm", "cloudflare-account-binding-qwen"]),
});

export function inferenceRuntime(env) {
  if (selfHostedConfigured(env)) {
    return Object.freeze({
      configured: true,
      mode: "self-hosted-private",
      provider: "kairos-private-runtime",
      model: String(env?.KAIROS_MODEL || DEFAULT_SELF_HOSTED_MODEL).trim(),
      selfHosted: true,
      managedService: false,
      externalInferenceAPI: false,
      privacy: "mmg-controlled-hardware",
    });
  }
  if (env?.AI && typeof env.AI.run === "function") {
    return Object.freeze({
      configured: true,
      mode: "cloudflare-account-scoped",
      provider: "cloudflare-workers-ai",
      model: accountModel(env),
      selfHosted: false,
      managedService: true,
      externalInferenceAPI: false,
      privacy: "customer-content-isolated-no-training",
    });
  }
  return Object.freeze({
    configured: false,
    mode: "deterministic-native",
    provider: "kairos-native",
    model: null,
    selfHosted: false,
    managedService: false,
    externalInferenceAPI: false,
    privacy: "local-deterministic-processing",
  });
}

export function intelligenceConfigured(env) {
  return inferenceRuntime(env).configured;
}

export async function probeKairosIntelligence(env) {
  const runtime = inferenceRuntime(env);
  if (!runtime.configured) {
    return { status: "needs-configuration", reachable: false, ...runtime, providerPolicy: KAIROS_PROVIDER_POLICY };
  }
  if (runtime.selfHosted) return probeSelfHosted(env, runtime);

  const cached = await readCachedHealth(env, runtime.mode);
  if (cached && Date.now() - Date.parse(cached.checkedAt || 0) < HEALTH_CACHE_MS) return { ...cached, cached: true };

  const started = Date.now();
  try {
    await claimInferenceBudget(env, "health-probe");
    const result = await env.AI.run(runtime.model, {
      messages: [
        { role: "system", content: "You are the Kairos inference health probe. Reply with READY only." },
        { role: "user", content: "Confirm runtime readiness." },
      ],
      temperature: 0,
      max_tokens: 256,
      seed: 1729,
    });
    const text = extractGeneratedText(result);
    const reasoningSignal = extractReasoningSignal(result);
    if (!text && !reasoningSignal) throw gatewayError("Kairos account-scoped inference returned an empty health response.", "kairos_inference_empty", 502);
    const health = {
      status: "ready",
      reachable: true,
      ...runtime,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      outputSignal: text ? "final-response" : "reasoning-response",
      providerPolicy: KAIROS_PROVIDER_POLICY,
    };
    await writeCachedHealth(env, runtime.mode, health);
    return health;
  } catch (error) {
    return {
      status: "unavailable",
      reachable: false,
      ...runtime,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      providerPolicy: KAIROS_PROVIDER_POLICY,
      error: { code: error?.code || "kairos_inference_unreachable", message: safeMessage(error, "Account-scoped inference is unavailable.") },
    };
  }
}

export async function runKairosIntelligence(env, input) {
  const runtime = inferenceRuntime(env);
  if (!runtime.configured) throw gatewayError("Kairos enhanced intelligence runtime is not configured.", "kairos_inference_not_configured", 503);
  if (runtime.selfHosted) return runSelfHosted(env, input, runtime);

  const structured = requiresStructuredJSON(input);
  let lastError = null;
  for (let attempt = 0; attempt < (structured ? STRUCTURED_OUTPUT_ATTEMPTS : 1); attempt += 1) {
    await claimInferenceBudget(env, structured && attempt > 0
      ? `${String(input?.purpose || "inference")}:structured-retry-${attempt}`
      : String(input?.purpose || "inference"));
    const request = buildAccountRequest(input, attempt);
    let result;
    try {
      result = await env.AI.run(runtime.model, request);
    } catch (error) {
      throw gatewayError(safeMessage(error, "Kairos account-scoped inference failed."), error?.code || "kairos_inference_failed", Number(error?.statusCode || 502));
    }
    const text = extractGeneratedText(result);
    if (!text) {
      lastError = gatewayError("Kairos enhanced intelligence returned an empty response.", "kairos_inference_empty", 502);
      continue;
    }
    if (structured) {
      try {
        const parsed = parseStrictJSON(text);
        return intelligenceResult(JSON.stringify(parsed), result, runtime, true, attempt + 1);
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    return intelligenceResult(text, result, runtime, false, attempt + 1);
  }
  throw gatewayError(
    safeMessage(lastError, "Kairos returned invalid structured output."),
    lastError?.code || "kairos_invalid_json",
    Number(lastError?.statusCode || 502),
  );
}

export function parseStrictJSON(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const trimmed = String(value || "").trim();
  const withoutReasoning = stripReasoningBlocks(trimmed);
  const fenced = withoutReasoning.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  for (const candidate of [withoutReasoning, fenced]) {
    const parsed = parseJSONCandidate(candidate);
    if (parsed) return parsed;
  }
  throw gatewayError("Kairos returned invalid structured output.", "kairos_invalid_json", 502);
}

async function probeSelfHosted(env, runtime) {
  const baseURL = baseURLFor(env);
  const started = Date.now();
  try {
    const response = await timedFetch(`${baseURL}/v1/models`, { method: "GET", headers: authHeaders(env) }, Number(env.KAIROS_INFERENCE_HEALTH_TIMEOUT_MS || 10000));
    const data = await safeJSON(response);
    if (!response.ok) throw gatewayError(data?.error?.message || `Private inference returned ${response.status}.`, "kairos_inference_health_failed", 502);
    const servedModels = Array.isArray(data?.data) ? data.data.map(item => item?.id).filter(Boolean) : [];
    return { status: "ready", reachable: true, ...runtime, servedModels, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), providerPolicy: KAIROS_PROVIDER_POLICY };
  } catch (error) {
    return { status: "unavailable", reachable: false, ...runtime, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), providerPolicy: KAIROS_PROVIDER_POLICY, error: { code: error?.code || "kairos_inference_unreachable", message: safeMessage(error, "Private inference is unavailable.") } };
  }
}

async function runSelfHosted(env, input, runtime) {
  const structured = requiresStructuredJSON(input);
  let lastError = null;
  for (let attempt = 0; attempt < (structured ? STRUCTURED_OUTPUT_ATTEMPTS : 1); attempt += 1) {
    await claimInferenceBudget(env, structured && attempt > 0
      ? `${String(input?.purpose || "inference")}:structured-retry-${attempt}`
      : String(input?.purpose || "inference"));
    const body = buildSelfHostedRequest(input, runtime, attempt);
    const response = await timedFetch(`${baseURLFor(env)}/v1/chat/completions`, {
      method: "POST",
      headers: { ...authHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, Number(env.KAIROS_INFERENCE_TIMEOUT_MS || 180000));
    const data = await safeJSON(response);
    if (!response.ok) throw gatewayError(data?.error?.message || data?.message || `Kairos intelligence returned ${response.status}.`, "kairos_inference_failed", 502);
    const text = extractGeneratedText(data);
    if (!text) {
      lastError = gatewayError("Kairos private intelligence returned an empty response.", "kairos_inference_empty", 502);
      continue;
    }
    if (structured) {
      try {
        const parsed = parseStrictJSON(text);
        return intelligenceResult(JSON.stringify(parsed), data, runtime, true, attempt + 1);
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    return intelligenceResult(text, data, runtime, false, attempt + 1);
  }
  throw gatewayError(
    safeMessage(lastError, "Kairos returned invalid structured output."),
    lastError?.code || "kairos_invalid_json",
    Number(lastError?.statusCode || 502),
  );
}

function buildAccountRequest(input, attempt) {
  const structured = requiresStructuredJSON(input);
  const request = {
    messages: [
      { role: "system", content: structuredSystemPrompt(input, attempt) },
      { role: "user", content: String(input?.user || "") },
    ],
    temperature: attempt > 0 ? 0 : clampNumber(input?.temperature, 0, 2, 0.2),
    max_tokens: Math.max(64, Math.min(structured ? 3072 : 4096, Number(input?.maxTokens || 2600))),
    seed: Number(input?.seed || 1729) + attempt,
  };
  if (structured) request.response_format = structuredJSONFormat(input);
  return request;
}

function buildSelfHostedRequest(input, runtime, attempt) {
  const structured = requiresStructuredJSON(input);
  const body = {
    model: runtime.model,
    temperature: attempt > 0 ? 0 : (input?.temperature ?? 0.2),
    max_tokens: Math.max(64, Math.min(structured ? 3072 : 12000, Number(input?.maxTokens || 12000))),
    messages: [
      { role: "system", content: structuredSystemPrompt(input, attempt) },
      { role: "user", content: String(input?.user || "") },
    ],
  };
  if (structured) body.response_format = structuredJSONFormat(input);
  return body;
}

function structuredSystemPrompt(input, attempt) {
  const base = String(input?.system || "");
  if (!requiresStructuredJSON(input)) return base;
  const homepageLimit = /homepage/i.test(String(input?.purpose || ""))
    ? " For homepage replacement plans, return between 1 and 8 replacements only, selecting the highest-impact visible customer-facing text."
    : "";
  const retry = attempt > 0
    ? ` This is structured-output retry ${attempt + 1}. Return one complete JSON object only. Do not include markdown fences, reasoning, comments, prefixes, suffixes, or trailing text.${homepageLimit}`
    : ` Return one complete JSON object only.${homepageLimit}`;
  return `${base}\n\n${retry}`.trim();
}

function intelligenceResult(text, result, runtime, structuredOutput, attempts) {
  return {
    text,
    model: runtime.model,
    provider: runtime.provider,
    runtime: runtime.mode,
    privacy: runtime.privacy,
    managedService: runtime.managedService,
    structuredOutput,
    structuredAttempts: attempts,
    usage: result?.usage || null,
  };
}

function requiresStructuredJSON(input) {
  if (input?.structuredOutput === true || input?.jsonSchema) return true;
  const system = String(input?.system || "");
  return /\b(?:return|respond with)\s+(?:strict\s+)?json\b/i.test(system);
}

function structuredJSONFormat(input) {
  const schema = input?.jsonSchema;
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    return { type: "json_schema", json_schema: schema };
  }
  return { type: "json_object" };
}

function stripReasoningBlocks(value) {
  return String(value || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, "")
    .trim();
}

function parseJSONCandidate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}
  const normalized = text.replace(/^\uFEFF/, "").replace(/,\s*([}\]])/g, "$1");
  if (normalized !== text) {
    try {
      const parsed = JSON.parse(normalized);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  for (const candidate of balancedJSONObjectCandidates(normalized)) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function balancedJSONObjectCandidates(value) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(value.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return candidates;
}

function selfHostedConfigured(env) {
  try { return Boolean(validatedKairosInferenceBaseURL(env?.KAIROS_INFERENCE_URL) && String(env?.KAIROS_INFERENCE_TOKEN || "").trim()); }
  catch { return false; }
}

function validatedKairosInferenceBaseURL(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) throw gatewayError("Kairos private intelligence runtime is not configured.", "kairos_inference_not_configured", 503);
  let url;
  try { url = new URL(raw); }
  catch { throw gatewayError("Kairos private intelligence requires a valid HTTPS URL.", "kairos_inference_url_invalid", 503); }
  if (url.protocol !== "https:") throw gatewayError("Kairos private intelligence requires HTTPS.", "kairos_inference_url_invalid", 503);
  const hostname = url.hostname.toLowerCase();
  if (/(^|\.)(openai\.com|chatgpt\.com|oaistatic\.com|oaiusercontent\.com)$/.test(hostname) || /(^|\.)openai\.azure\.com$/.test(hostname)) {
    throw gatewayError("Kairos policy prohibits OpenAI endpoints.", "openai_provider_prohibited", 503);
  }
  return raw;
}

function accountModel(env) {
  const model = String(env?.KAIROS_WORKERS_AI_MODEL || DEFAULT_ACCOUNT_MODEL).trim();
  if (!/^@cf\/qwen\//.test(model)) return DEFAULT_ACCOUNT_MODEL;
  return model;
}

function baseURLFor(env) {
  return validatedKairosInferenceBaseURL(env?.KAIROS_INFERENCE_URL).replace(/\/v1\/(chat\/completions|models)$/i, "");
}

function authHeaders(env) {
  return { Authorization: `Bearer ${String(env.KAIROS_INFERENCE_TOKEN || "").trim()}` };
}

async function claimInferenceBudget(env, purpose) {
  if (!env?.KAIROS_PROJECTS) return;
  const response = await controlStub(env).fetch(new Request("https://kairos.internal/control/inference/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      purpose: String(purpose || "inference").slice(0, 120),
      perMinute: Math.max(1, Math.min(60, Number(env.KAIROS_INFERENCE_MAX_REQUESTS_PER_MINUTE || 6))),
      perDay: Math.max(10, Math.min(5000, Number(env.KAIROS_INFERENCE_MAX_REQUESTS_PER_DAY || 200))),
    }),
  }));
  if (response.status === 429) {
    const body = await safeJSON(response);
    throw Object.assign(gatewayError(body?.error?.message || "Kairos inference budget is temporarily exhausted.", "kairos_inference_rate_limited", 429), { retryAfterMs: Math.max(1000, Number(body?.retryAfterMs || 60_000)) });
  }
  if (!response.ok) throw gatewayError("Kairos could not reserve its inference budget.", "kairos_inference_budget_unavailable", 503);
}

async function readCachedHealth(env, id) {
  if (!env?.KAIROS_PROJECTS) return null;
  try {
    const response = await controlStub(env).fetch(new Request(`https://kairos.internal/ledger/get?collection=intelligence-health&id=${encodeURIComponent(id)}`));
    if (!response.ok) return null;
    return (await response.json()).value || null;
  } catch { return null; }
}

async function writeCachedHealth(env, id, value) {
  if (!env?.KAIROS_PROJECTS) return;
  try {
    await controlStub(env).fetch(new Request("https://kairos.internal/ledger/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "intelligence-health", id, value: { ...value, id } }),
    }));
  } catch {}
}

function controlStub(env) {
  return env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(CONTROL_OBJECT));
}

function extractGeneratedText(result) {
  if (typeof result === "string") return result.trim();
  const response = typeof result?.response === "string" ? result.response.trim() : "";
  if (response) return response;
  const choice = result?.choices?.[0]?.message?.content ?? result?.choices?.[0]?.text;
  if (typeof choice === "string" && choice.trim()) return choice.trim();
  if (Array.isArray(choice)) {
    const combined = choice.map(part => typeof part === "string" ? part : part?.text || part?.content || "").join("").trim();
    if (combined) return combined;
  }
  if (result?.response && typeof result.response === "object") return JSON.stringify(result.response);
  return "";
}

function extractReasoningSignal(result) {
  const reasoning = result?.reasoning
    ?? result?.reasoning_content
    ?? result?.choices?.[0]?.message?.reasoning
    ?? result?.choices?.[0]?.message?.reasoning_content;
  return typeof reasoning === "string" ? reasoning.trim() : "";
}

async function timedFetch(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  catch (error) {
    if (error?.name === "AbortError") throw gatewayError("Kairos intelligence request timed out.", "kairos_inference_timeout", 504);
    throw gatewayError(safeMessage(error, "Kairos intelligence runtime could not be reached."), "kairos_inference_unreachable", 502);
  } finally { clearTimeout(timeout); }
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function safeMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function gatewayError(message, code, statusCode) { return Object.assign(new Error(message), { code, statusCode }); }
async function safeJSON(response) { try { return await response.json(); } catch { return {}; } }
