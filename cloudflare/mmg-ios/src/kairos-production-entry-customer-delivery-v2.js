import currentRuntime, { KairosProject as CurrentKairosProject } from "./kairos-production-entry-digital-asset-v2-v1.js";
import {
  KAIROS_CUSTOMER_DELIVERY_BUILD,
  attachCustomerDelivery,
  handleCustomerDelivery,
  handleCustomerDeliveryObjectRequest,
} from "./kairos-customer-delivery-v2.js";
import {
  handlePublishingExperience,
  KAIROS_PUBLISHING_EXPERIENCE_BUILD,
} from "./kairos-publishing-experience-v1.js";

const BUILD = "kairos-production-entry-customer-delivery-20260723-7-no-cost";
const EXECUTE_PATH = "/api/shopify/product-publication/execute";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5";
const REGISTRY_OBJECT = "mmg-production-project-registry";
const NO_COST_MODEL = "kairos-no-cost-source-preserving";

export class KairosProject extends CurrentKairosProject {
  constructor(state, env) {
    super(state, withNoCostCompatibility(env));
    this.env = withNoCostCompatibility(env);
  }

  async fetch(request) {
    const delivery = await handleCustomerDeliveryObjectRequest(this.state, request, this.env);
    if (delivery) return stamp(delivery);
    return stamp(await super.fetch(request));
  }
}

export default {
  async fetch(request, env, ctx) {
    const runtimeEnv = withNoCostCompatibility(env);
    const delivery = await handleCustomerDelivery(request.clone(), runtimeEnv);
    if (delivery) return stamp(delivery);

    const experience = await handlePublishingExperience(request.clone(), runtimeEnv);
    if (experience) return stamp(experience);

    const url = new URL(request.url);
    if (request.method === "POST" && /^\/api\/production-registry\/manuscripts\/[a-z0-9-]{8,}\/setup$/i.test(url.pathname)) {
      const repaired = await ensureActiveProjectSource(request.clone(), runtimeEnv);
      if (repaired) return stamp(repaired);
    }

    if (request.method === "POST" && url.pathname === EXECUTE_PATH) {
      return executeDraftWithDelivery(request, runtimeEnv, ctx);
    }

    return stamp(await currentRuntime.fetch(request, runtimeEnv, ctx));
  },

  async scheduled(controller, env, ctx) {
    if (typeof currentRuntime.scheduled === "function") {
      return currentRuntime.scheduled(controller, withNoCostCompatibility(env), ctx);
    }
  },
};

function withNoCostCompatibility(env) {
  if (!env) return env;
  const freeOpenAIEnabled = String(env.KAIROS_OPENAI_FREE_CREDITS_ENABLED || "false").toLowerCase() === "true";
  const mayUseOpenAI = freeOpenAIEnabled && Boolean(String(env.OPENAI_API_KEY || "").trim());
  const adapter = Object.freeze({
    async run(_legacyModel, input = {}) {
      if (!mayUseOpenAI) {
        return {
          response: deterministicSourcePreservingResponse(input),
          provider: NO_COST_MODEL,
          paidApiUsed: false,
          cloudflareWorkersAIUsed: false,
        };
      }
      return runFreeCreditOpenAI(env, input);
    },
  });

  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === "AI") return adapter;
      if (property === "KAIROS_WORKERS_AI_MODEL") {
        return mayUseOpenAI ? String(target.KAIROS_OPENAI_MODEL || DEFAULT_OPENAI_MODEL) : NO_COST_MODEL;
      }
      if (property === "KAIROS_NO_COST_MODE") return "true";
      return Reflect.get(target, property, receiver);
    },
  });
}

async function runFreeCreditOpenAI(env, input) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const instructions = messages.filter((item) => item?.role === "system").map((item) => String(item.content || "")).join("\n\n");
  const userInput = messages.filter((item) => item?.role !== "system").map((item) => ({ role: item?.role || "user", content: String(item?.content || "") }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "X-Client-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        model: String(env.KAIROS_OPENAI_MODEL || DEFAULT_OPENAI_MODEL),
        instructions: instructions || undefined,
        input: userInput.length ? userInput : [{ role: "user", content: "Continue." }],
        max_output_tokens: Math.max(1, Number(input.max_tokens || 4096)),
        store: false,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}.`);
    const text = extractOpenAIText(payload);
    if (!text.trim()) throw new Error("OpenAI returned an empty response.");
    return { response: text, provider: "openai-free-credit-mode", paidApiUsed: false, cloudflareWorkersAIUsed: false };
  } finally {
    clearTimeout(timeout);
  }
}

function deterministicSourcePreservingResponse(input) {
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  const prompt = messages.map((item) => String(item?.content || "")).join("\n\n");
  const sourceMatch = prompt.match(/SOURCE CHAPTER:\s*([\s\S]*?)\n\nRewrite this chapter/i);
  if (!sourceMatch) {
    const error = new Error("The supplied manuscript is below the required production length. No-cost mode will not fabricate, pad, or purchase AI-generated manuscript content. Provide a production-ready manuscript or explicitly enable verified free OpenAI credits.");
    error.code = "no_cost_manuscript_expansion_unavailable";
    throw error;
  }

  const source = cleanSource(sourceMatch[1]);
  if (!source) {
    const error = new Error("The source chapter is empty and cannot be manufactured in no-cost mode.");
    error.code = "no_cost_source_chapter_empty";
    throw error;
  }
  const paragraphs = source.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  const sentences = source.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/g)?.map((value) => value.trim()).filter(Boolean) || [];
  const first = paragraphs[0] || sentences[0] || source.slice(0, 800);
  const second = paragraphs[1] || sentences.slice(1, 4).join(" ") || first;
  const workflow = paragraphs.slice(0, 5).map((value, index) => `${index + 1}. ${truncate(value, 360)}`).join("\n");
  const example = paragraphs.slice(2, 5).join("\n\n") || source.slice(0, 1500);
  const keyTerms = uniqueWords(source).slice(0, 8);

  return `## Core Principle\n\n${truncate(first, 900)}\n\n## Why It Matters\n\n${truncate(second, 900)}\n\n## Prompt Framework\n\nUse the chapter's own terminology and constraints as the authoritative framework. Preserve these source concepts: ${keyTerms.join(", ") || "the supplied chapter principles"}. Do not add unsupported claims.\n\n## Production Workflow\n\n${workflow || "1. Review the supplied chapter.\n2. Identify its required actions.\n3. Apply them in sequence.\n4. Validate the result against the source."}\n\n## Worked Example\n\n${truncate(example, 1800)}\n\n## Common Failure Patterns\n\n- Departing from the supplied chapter's stated objective.\n- Adding facts, guarantees, or requirements that are not present in the source.\n- Skipping validation steps contained in the manuscript.\n- Treating generic output as a substitute for the chapter's specific instructions.\n\n## Practice Lab\n\nSelect one usable method from the source chapter. Apply it to a real task, record the inputs and result, compare the result against the chapter's stated criteria, and revise only where the source supports the revision.\n\n## Action Checklist\n\n- [ ] Confirm the chapter objective.\n- [ ] Preserve the source terminology.\n- [ ] Follow the source sequence.\n- [ ] Test the result.\n- [ ] Remove unsupported additions.\n- [ ] Record the final decision.\n\n## Chapter Summary\n\nThe supplied chapter remains the authority. This no-cost production pass organizes its application without purchasing inference, inventing material, or replacing the original source.`;
}

function cleanSource(value) {
  return String(value || "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function truncate(value, limit) {
  const text = String(value || "").trim();
  return text.length <= limit ? text : `${text.slice(0, limit).replace(/\s+\S*$/, "")}…`;
}

function uniqueWords(value) {
  const stop = new Set(["this", "that", "with", "from", "have", "will", "your", "into", "when", "what", "where", "which", "their", "there", "about", "then", "than", "they", "them", "been", "were", "also", "only", "each", "more", "most", "some", "such", "through", "using"]);
  const counts = new Map();
  for (const word of String(value || "").toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) {
    if (stop.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([word]) => word);
}

async function ensureActiveProjectSource(request, env) {
  if (!env?.KAIROS_PROJECTS) return null;
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/setup$/i);
  if (!match) return null;
  const projectId = match[1];
  const input = await request.clone().json().catch(() => ({}));
  const title = normalizeTitle(input?.publicationTitle || "");
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));

  const direct = await stub.fetch(`https://kairos.internal/registry/manuscripts/${encodeURIComponent(projectId)}/source`);
  if (direct.ok) return null;

  const projectsResponse = await stub.fetch("https://kairos.internal/registry/projects");
  const projects = await projectsResponse.json().catch(() => ({ projects: [] }));
  const candidates = (Array.isArray(projects?.projects) ? projects.projects : [])
    .filter((item) => item?.projectId && item.projectId !== projectId && item?.sourceStored === true)
    .filter((item) => !title || normalizeTitle(item?.title || item?.source?.title || "") === title)
    .sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")));
  if (candidates.length !== 1) return null;

  const sourceProjectId = candidates[0].projectId;
  const metadataResponse = await stub.fetch(`https://kairos.internal/registry/manuscripts/${encodeURIComponent(sourceProjectId)}/source`);
  const textResponse = await stub.fetch(`https://kairos.internal/registry/manuscripts/${encodeURIComponent(sourceProjectId)}/source/text`);
  const fileResponse = await stub.fetch(`https://kairos.internal/registry/manuscripts/${encodeURIComponent(sourceProjectId)}/source/download`);
  if (!metadataResponse.ok || !textResponse.ok || !fileResponse.ok) return null;

  const metadataPayload = await metadataResponse.json().catch(() => null);
  const textPayload = await textResponse.json().catch(() => null);
  const metadata = metadataPayload?.source || textPayload?.source;
  const manuscript = String(textPayload?.manuscript || "");
  if (!metadata || manuscript.trim().length < 50) return null;

  const bytes = await fileResponse.arrayBuffer();
  const filename = String(metadata.filename || "manuscript.txt");
  const contentType = String(metadata.contentType || "text/plain");
  const form = new FormData();
  form.append("file", new File([bytes], filename, { type: contentType }), filename);
  form.append("extractedText", manuscript);
  form.append("title", String(input?.publicationTitle || metadata.title || filename));
  form.append("format", String(metadata.format || "txt"));
  form.append("pages", metadata.pages == null ? "" : String(metadata.pages));
  form.append("checksum", String(metadata.checksum || ""));

  const copyResponse = await stub.fetch(`https://kairos.internal/registry/manuscripts/${encodeURIComponent(projectId)}/source`, { method: "POST", body: form });
  if (!copyResponse.ok) return null;
  const verification = await stub.fetch(`https://kairos.internal/registry/manuscripts/${encodeURIComponent(projectId)}/source`);
  if (!verification.ok) return null;

  const response = await currentRuntime.fetch(request, env, {});
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Source-Reconciled", sourceProjectId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractOpenAIText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

async function executeDraftWithDelivery(request, env, ctx) {
  const input = await request.clone().json().catch(() => ({}));
  const draftResponse = await currentRuntime.fetch(request, env, ctx);
  const draft = await draftResponse.clone().json().catch(() => null);
  if (!draftResponse.ok || draft?.status !== "draft-created-and-verified") return stamp(draftResponse);

  const productId = draft?.result?.id;
  const variantId = draft?.result?.variants?.nodes?.[0]?.id || draft?.result?.variantId || null;
  const projectId = draft?.projectId;
  if (!productId || !projectId) {
    return rollbackAndFail({ request, env, ctx, input, draft, code: "delivery_draft_identity_missing", message: "The verified Shopify draft did not include the product and project identifiers required for customer delivery." });
  }

  const attachRequest = new Request(`${new URL(request.url).origin}/api/customer-delivery/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, productId, variantId, confirmation: "ATTACH CUSTOMER DELIVERY", actor: input?.actor || "Executive" }),
  });
  const attachmentResponse = await attachCustomerDelivery(attachRequest, env);
  const attachment = await attachmentResponse.clone().json().catch(() => null);
  if (!attachmentResponse.ok || attachment?.status !== "attached-and-verified") {
    return rollbackAndFail({ request, env, ctx, input, draft, code: attachment?.error?.code || "customer_delivery_attachment_failed", message: attachment?.error?.message || "Customer delivery could not be attached to the Shopify draft.", attachment });
  }

  return stamp(json({ ...draft, status: "draft-created-delivery-attached-and-verified", customerDelivery: attachment, nextAction: "Review the exact draft product and delivery configuration, then use the governed live-publication approval." }));
}

async function rollbackAndFail({ request, env, ctx, input, draft, code, message, attachment = null }) {
  const rollbackRequest = new Request(`${new URL(request.url).origin}/api/shopify/product-publication/rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ releaseId: input?.releaseId || draft?.releaseId, confirmation: "ROLL BACK PRODUCT DRAFT", actor: "Kairos Delivery Safety Rollback" }),
  });
  const rollbackResponse = await currentRuntime.fetch(rollbackRequest, env, ctx);
  const rollback = await rollbackResponse.clone().json().catch(() => null);
  return stamp(json({
    status: "failed-and-rolled-back",
    build: BUILD,
    error: { code, message },
    customerDelivery: attachment,
    draft: { releaseId: draft?.releaseId || null, productId: draft?.result?.id || null, handle: draft?.result?.handle || draft?.desired?.handle || null },
    rollback: { succeeded: rollbackResponse.ok && rollback?.status === "rolled-back", result: rollback },
  }, 502));
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Customer-Delivery", KAIROS_CUSTOMER_DELIVERY_BUILD);
  headers.set("X-Kairos-Customer-Delivery-Entry", BUILD);
  headers.set("X-Kairos-Publishing-Experience", KAIROS_PUBLISHING_EXPERIENCE_BUILD);
  headers.set("X-Kairos-AI-Provider", "kairos-no-cost-policy");
  headers.set("X-Kairos-Paid-AI-Enabled", "false");
  headers.set("X-Kairos-Cloudflare-Neurons", "0");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Kairos-Customer-Delivery": KAIROS_CUSTOMER_DELIVERY_BUILD,
      "X-Kairos-Customer-Delivery-Entry": BUILD,
      "X-Kairos-AI-Provider": "kairos-no-cost-policy",
      "X-Kairos-Paid-AI-Enabled": "false",
      "X-Kairos-Cloudflare-Neurons": "0",
    },
  });
}
