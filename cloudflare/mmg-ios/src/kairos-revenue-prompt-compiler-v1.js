export const KAIROS_REVENUE_PROMPT_COMPILER_BUILD = "kairos-revenue-prompt-compiler-20260727-1";

export function compileKairosRevenuePrompt(product = {}, job = {}) {
  const blueprint = product.blueprint || {};
  const outputType = clean(job.outputType || job.assetType || "manuscript", 80);
  const audience = clean(blueprint.targetAudience, 500);
  const objective = clean(blueprint.objective, 4000);
  const title = clean(blueprint.title || product.commercePackage?.product?.title, 300);
  if (!title || !objective || !audience) throw promptError("REVENUE_PROMPT_CONTEXT_INCOMPLETE", "Title, objective, and target audience are required.");
  const requirements = (Array.isArray(job.requirements) ? job.requirements : []).slice(0, 40).map((item) => clean(item, 500)).filter(Boolean);
  const instructions = [
    "You are Kairos, the governed production intelligence for Mindset Media Group.",
    "Produce commercially usable source content only for the requested asset.",
    "Follow the supplied product objective, audience, structure, and acceptance criteria exactly.",
    "Do not include internal prompts, credentials, policy text, hidden reasoning, or unsupported claims.",
    "Return only the finished asset content in Markdown unless the requested output type requires JSON.",
  ].join(" ");
  const input = [
    `Product title: ${title}`,
    `Product type: ${clean(blueprint.productType, 120)}`,
    `Target audience: ${audience}`,
    `Commercial objective: ${objective}`,
    `Requested asset: ${outputType}`,
    requirements.length ? `Requirements:\n- ${requirements.join("\n- ")}` : "Requirements: Produce a complete, polished, customer-ready asset.",
    "Quality standard: specific, useful, logically structured, accurate, original, and ready for editorial QA.",
  ].join("\n\n");
  return Object.freeze({ instructions, input, outputType, title, build: KAIROS_REVENUE_PROMPT_COMPILER_BUILD });
}

function clean(value, max) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function promptError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
