import { compileKairosRevenuePrompt, KAIROS_REVENUE_PROMPT_COMPILER_BUILD } from "./kairos-revenue-prompt-compiler-v1.js";

export const KAIROS_OPENAI_REVENUE_EXECUTOR_BUILD = "kairos-openai-revenue-executor-20260727-1";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export async function executeKairosRevenueJob(product = {}, job = {}, env = {}, input = {}) {
  assertExecutionAllowed(job, input);
  const apiKey = clean(env.OPENAI_API_KEY, 500);
  if (!apiKey) throw executorError("OPENAI_API_KEY_MISSING", "OPENAI_API_KEY is required for revenue production execution.", 503);
  const compiled = compileKairosRevenuePrompt(product, job);
  const model = clean(input.model || env.KAIROS_REVENUE_MODEL || "gpt-5", 120);
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: compiled.instructions,
      input: compiled.input,
      max_output_tokens: boundedInt(input.maxOutputTokens, 1000, 32000, 12000),
      store: false,
      metadata: {
        kairos_job_id: clean(job.jobId, 180),
        kairos_revenue_product_id: clean(product.revenueProductId, 180),
        kairos_output_type: compiled.outputType,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw executorError("OPENAI_REVENUE_EXECUTION_FAILED", clean(payload?.error?.message || `OpenAI request failed with status ${response.status}.`, 1000), response.status);
  const outputText = clean(payload.output_text || extractOutputText(payload.output), 2_000_000);
  if (!outputText) throw executorError("OPENAI_REVENUE_OUTPUT_EMPTY", "OpenAI returned no usable revenue asset content.", 502);
  return Object.freeze({
    executionId: clean(payload.id, 180),
    jobId: clean(job.jobId, 180),
    revenueProductId: clean(product.revenueProductId, 180),
    outputType: compiled.outputType,
    model: clean(payload.model || model, 120),
    content: outputText,
    contentType: "text/markdown; charset=utf-8",
    usage: Object.freeze({ inputTokens: Number(payload.usage?.input_tokens || 0), outputTokens: Number(payload.usage?.output_tokens || 0), totalTokens: Number(payload.usage?.total_tokens || 0) }),
    completedAt: new Date().toISOString(),
    requiresEditorialQA: true,
    automaticPublicationAllowed: false,
    builds: Object.freeze({ executor: KAIROS_OPENAI_REVENUE_EXECUTOR_BUILD, compiler: KAIROS_REVENUE_PROMPT_COMPILER_BUILD }),
  });
}

function assertExecutionAllowed(job, input) {
  if (job.authorization?.status !== "authorized") throw executorError("REVENUE_JOB_NOT_AUTHORIZED", "Revenue job must be explicitly authorized before execution.", 409);
  if (clean(input.confirmation, 120) !== "EXECUTE REVENUE JOB") throw executorError("EXECUTION_CONFIRMATION_REQUIRED", "Use confirmation EXECUTE REVENUE JOB.", 409);
  if (!clean(job.jobId, 180)) throw executorError("REVENUE_JOB_ID_REQUIRED", "Revenue job ID is required.");
}
function extractOutputText(output) { return (Array.isArray(output) ? output : []).flatMap((item) => Array.isArray(item?.content) ? item.content : []).filter((item) => item?.type === "output_text").map((item) => item.text || "").join("\n\n"); }
function boundedInt(value, min, max, fallback) { const number = Math.floor(Number(value) || fallback); return Math.min(max, Math.max(min, number)); }
function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function executorError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
