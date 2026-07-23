import currentRuntime, { KairosProject as CurrentKairosProject } from "./kairos-production-entry-digital-asset-v2-v1.js";
import {
  KAIROS_CUSTOMER_DELIVERY_BUILD,
  attachCustomerDelivery,
  handleCustomerDelivery,
  handleCustomerDeliveryObjectRequest,
} from "./kairos-customer-delivery-v2.js";

const BUILD = "kairos-production-entry-customer-delivery-20260723-2";
const EXECUTE_PATH = "/api/shopify/product-publication/execute";

export class KairosProject extends CurrentKairosProject {
  async fetch(request) {
    const delivery = await handleCustomerDeliveryObjectRequest(this.state, request, this.env);
    if (delivery) return stamp(delivery);
    return stamp(await super.fetch(request));
  }
}

export default {
  async fetch(request, env, ctx) {
    const delivery = await handleCustomerDelivery(request.clone(), env);
    if (delivery) return stamp(delivery);

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === EXECUTE_PATH) {
      return executeDraftWithDelivery(request, env, ctx);
    }

    return stamp(await currentRuntime.fetch(request, env, ctx));
  },

  async scheduled(controller, env, ctx) {
    if (typeof currentRuntime.scheduled === "function") return currentRuntime.scheduled(controller, env, ctx);
  },
};

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
    body: JSON.stringify({
      projectId,
      productId,
      variantId,
      confirmation: "ATTACH CUSTOMER DELIVERY",
      actor: input?.actor || "Executive",
    }),
  });
  const attachmentResponse = await attachCustomerDelivery(attachRequest, env);
  const attachment = await attachmentResponse.clone().json().catch(() => null);

  if (!attachmentResponse.ok || attachment?.status !== "attached-and-verified") {
    return rollbackAndFail({
      request,
      env,
      ctx,
      input,
      draft,
      code: attachment?.error?.code || "customer_delivery_attachment_failed",
      message: attachment?.error?.message || "Customer delivery could not be attached to the Shopify draft.",
      attachment,
    });
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
    body: JSON.stringify({
      releaseId: input?.releaseId || draft?.releaseId,
      confirmation: "ROLL BACK PRODUCT DRAFT",
      actor: "Kairos Delivery Safety Rollback",
    }),
  });
  const rollbackResponse = await currentRuntime.fetch(rollbackRequest, env, ctx);
  const rollback = await rollbackResponse.clone().json().catch(() => null);

  return stamp(json({
    status: "failed-and-rolled-back",
    build: BUILD,
    error: { code, message },
    customerDelivery: attachment,
    draft: {
      releaseId: draft?.releaseId || null,
      productId: draft?.result?.id || null,
      handle: draft?.result?.handle || draft?.desired?.handle || null,
    },
    rollback: {
      succeeded: rollbackResponse.ok && rollback?.status === "rolled-back",
      result: rollback,
    },
  }, 502));
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Customer-Delivery", KAIROS_CUSTOMER_DELIVERY_BUILD);
  headers.set("X-Kairos-Customer-Delivery-Entry", BUILD);
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
    },
  });
}
