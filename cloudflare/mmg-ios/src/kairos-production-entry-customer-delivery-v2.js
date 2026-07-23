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

const BUILD = "kairos-production-entry-customer-delivery-20260723-4-zero-neuron";
const EXECUTE_PATH = "/api/shopify/product-publication/execute";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5";

export class KairosProject extends CurrentKairosProject {
  async fetch(request) {
    const delivery = await handleCustomerDeliveryObjectRequest(this.state, request, this.env);
    if (delivery) return stamp(delivery);
    return stamp(await super.fetch(request));
  }
}

export default {
  async fetch(request, env, ctx) {
    const zeroNeuronEnv = withOpenAICompatibility(env);
    const delivery = await handleCustomerDelivery(request.clone(), zeroNeuronEnv);
    if (delivery) return stamp(delivery);

    const experience = await handlePublishingExperience(request.clone(), zeroNeuronEnv);
    if (experience) return stamp(experience);

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === EXECUTE_PATH) {
      return executeDraftWithDelivery(request, zeroNeuronEnv, ctx);
    }

    return stamp(await currentRuntime.fetch(request, zeroNeuronEnv, ctx));
  },

  async scheduled(controller, env, ctx) {
    if (typeof currentRuntime.scheduled === "function") return currentRuntime.scheduled(controller, withOpenAICompatibility(env), ctx);
  },
};

function withOpenAICompatibility(env) {
  if (!env) return env;
  const adapter = Object.freeze({
    async run(_cloudflareModel, input = {}) {
      if (!env.OPENAI_API_KEY) {
        const error = new Error("OPENAI_API_KEY is required for the zero-neuron Kairos writing runtime.");
        error.code = "openai_api_key_required";
        throw error;
      }
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
        return { response: text, provider: "openai-responses-api", cloudflareWorkersAIUsed: false };
      } finally {
        clearTimeout(timeout);
      }
    },
  });
  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === "AI") return adapter;
      if (property === "KAIROS_WORKERS_AI_MODEL") return String(target.KAIROS_OPENAI_MODEL || DEFAULT_OPENAI_MODEL);
      return Reflect.get(target, property, receiver);
    },
  });
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

  return stamp(json({
    ...draft,
    status: "draft-created-delivery-attached-and-verified",
    customerDelivery: attachment,
    nextAction: "Review the exact draft product and delivery configuration, then use the governed live-publication approval.",
  }));
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
  headers.set("X-Kairos-AI-Provider", "openai-responses-api");
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
      "X-Kairos-AI-Provider": "openai-responses-api",
      "X-Kairos-Cloudflare-Neurons": "0",
    },
  });
}
