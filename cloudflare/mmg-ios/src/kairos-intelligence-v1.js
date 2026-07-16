const DEFAULT_SELF_HOSTED_MODEL = "Qwen3.6-35B-A3B";
const DEFAULT_ACCOUNT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const HEALTH_CACHE_MS = 15 * 60 * 1000;
const CONTROL_OBJECT = "kairos-intelligence-control-v1";

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
      max_tokens: 24,
      seed: 1729,
    });
    const text = extractGeneratedText(result);
    if (!text) throw gatewayError("Kairos account-scoped inference returned an empty health response.", "kairos_inference_empty", 502);
    const health = {
      status: "ready",
      reachable: true,
      ...runtime,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
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

  await claimInferenceBudget(env, String(input?.purpose || "inference"));
  let result;
  try {
    result = await env.AI.run(runtime.model, {
      messages: [
        { role: "system", content: String(input?.system || "") },
        { role: "user", content: String(input?.user || "") },
      ],
      temperature: clampNumber(input?.temperature, 0, 2, 0.2),
      max_tokens: Math.max(64, Math.min(4096, Number(input?.maxTokens || 2600))),
      seed: Number(input?.seed || 1729),
    });
  } catch (error) {
    throw gatewayError(safeMessage(error, "Kairos account-scoped inference failed."), error?.code || "kairos_inference_failed", Number(error?.statusCode || 502));
  }
  const text = extractGeneratedText(result);
  if (!text) throw gatewayError("Kairos enhanced intelligence returned an empty response.", "kairos_inference_empty", 502);
  return {
    text,
    model: runtime.model,
    provider: runtime.provider,
    runtime: runtime.mode,
    privacy: runtime.privacy,
    managedService: runtime.managedService,
    usage: result?.usage || null,
  };
}

export function parseStrictJSON(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const trimmed = String(value || "").trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) { try { return JSON.parse(fenced.trim()); } catch {} }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {} }
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
  const response = await timedFetch(`${baseURLFor(env)}/v1/chat/completions`, {
    method: "POST",
    headers: { ...authHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: runtime.model,
      temperature: input?.temperature ?? 0.2,
      max_tokens: input?.maxTokens ?? 12000,
      messages: [
        { role: "system", content: input?.system },
        { role: "user", content: input?.user },
      ],
    }),
  }, Number(env.KAIROS_INFERENCE_TIMEOUT_MS || 180000));
  const data = await safeJSON(response);
  if (!response.ok) throw gatewayError(data?.error?.message || data?.message || `Kairos intelligence returned ${response.status}.`, "kairos_inference_failed", 502);
  const text = extractGeneratedText(data);
  if (!text) throw gatewayError("Kairos private intelligence returned an empty response.", "kairos_inference_empty", 502);
  return { text, model: runtime.model, provider: runtime.provider, runtime: runtime.mode, privacy: runtime.privacy, managedService: false, usage: data?.usage || null };
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
  if (typeof result?.response === "string") return result.response.trim();
  if (result?.response && typeof result.response === "object") return JSON.stringify(result.response);
  const choice = result?.choices?.[0]?.message?.content ?? result?.choices?.[0]?.text;
  return typeof choice === "string" ? choice.trim() : "";
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
