const DEFAULT_MODEL = "Qwen3.6-35B-A3B";
export const KAIROS_PROVIDER_POLICY = Object.freeze({
  openai: "prohibited",
  externalInferenceProviders: "prohibited",
  permittedInference: "kairos-controlled-hardware-only",
});

export function intelligenceConfigured(env) {
  try { return Boolean(validatedKairosInferenceBaseURL(env?.KAIROS_INFERENCE_URL)); }
  catch { return false; }
}

export async function runKairosIntelligence(env, input) {
  const baseURL = validatedKairosInferenceBaseURL(env?.KAIROS_INFERENCE_URL);

  const model = String(env.KAIROS_MODEL || DEFAULT_MODEL).trim();
  const endpoint = baseURL.endsWith("/v1/chat/completions") ? baseURL : `${baseURL}/v1/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  const token = String(env.KAIROS_INFERENCE_TOKEN || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.KAIROS_INFERENCE_TIMEOUT_MS || 180000));
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 12000,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw gatewayError("Kairos intelligence request timed out.", "kairos_inference_timeout", 504);
    throw gatewayError(error instanceof Error ? error.message : "Kairos intelligence runtime could not be reached.", "kairos_inference_unreachable", 502);
  } finally {
    clearTimeout(timeout);
  }

  const data = await safeJSON(response);
  if (!response.ok) {
    throw gatewayError(data?.error?.message || data?.message || `Kairos intelligence returned ${response.status}.`, "kairos_inference_failed", 502);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw gatewayError("Kairos intelligence returned an empty response.", "kairos_inference_empty", 502);
  }

  return { text: text.trim(), model, provider: "kairos-private-runtime" };
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

export function parseStrictJSON(text) {
  const trimmed = String(text || "").trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    try { return JSON.parse(fenced.trim()); } catch {}
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {}
  }
  throw gatewayError("Kairos returned invalid structured output.", "kairos_invalid_json", 502);
}

function gatewayError(message, code, statusCode) {
  return Object.assign(new Error(message), { code, statusCode });
}

async function safeJSON(response) {
  try { return await response.json(); } catch { return {}; }
}
