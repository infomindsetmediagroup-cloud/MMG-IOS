import {
  isMMGShopifySubscriptionWebhookTopic,
  normalizeMMGShopifyShopDomain,
  validateMMGShopifyWebhookMetadata,
  type MMGShopifyBillingAttemptWebhookPayload,
  type MMGShopifyContractWebhookPayload,
  type MMGShopifyWebhookMetadata,
} from "./subscription-webhook-reconciliation.js";
import type { MMGShopifySubscriptionWebhookRepository } from "./subscription-webhook-repository.js";
import {
  MMGShopifySubscriptionReconciliationError,
  reconcileMMGShopifySubscriptionWebhook,
  type MMGShopifySubscriptionWebhookServiceDependencies,
} from "./subscription-webhook-service.js";
import { sha256Hex, verifyShopifyWebhookHmac } from "./shopify-webhook-auth.js";

const MAX_BODY_BYTES = 65_536;

export interface MMGShopifySubscriptionWebhookHttpDependencies
  extends MMGShopifySubscriptionWebhookServiceDependencies {
  clientSecret: string;
  expectedShopDomain: string;
  expectedApiVersion: string;
  now(): Date;
  verifyHmac?(input: {
    rawBody: string;
    providedHmac: string;
    clientSecret: string;
  }): boolean;
}

const responseHeaders = (): Headers =>
  new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });

const json = (body: Record<string, unknown>, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders() });

const failure = (
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  allow?: string,
): Response => {
  const headers = responseHeaders();
  if (allow) headers.set("Allow", allow);
  return new Response(
    JSON.stringify({ ok: false, error: { code, message, retryable } }),
    { status, headers },
  );
};

const header = (request: Request, name: string): string =>
  request.headers.get(name)?.trim() ?? "";

const safePayload = (
  rawBody: string,
): MMGShopifyContractWebhookPayload | MMGShopifyBillingAttemptWebhookPayload => {
  const parsed: unknown = JSON.parse(rawBody);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MMG_SHOPIFY_WEBHOOK_BODY_NOT_OBJECT");
  }
  return parsed as MMGShopifyContractWebhookPayload | MMGShopifyBillingAttemptWebhookPayload;
};

const metadataFromRequest = (
  request: Request,
): MMGShopifyWebhookMetadata => {
  const topic = header(request, "X-Shopify-Topic");
  if (!isMMGShopifySubscriptionWebhookTopic(topic)) {
    throw new Error("MMG_SHOPIFY_UNSUPPORTED_WEBHOOK_TOPIC");
  }
  return validateMMGShopifyWebhookMetadata({
    webhookId: header(request, "X-Shopify-Webhook-Id"),
    eventId: header(request, "X-Shopify-Event-Id") || null,
    topic,
    shopDomain: header(request, "X-Shopify-Shop-Domain"),
    apiVersion: header(request, "X-Shopify-API-Version"),
    triggeredAt: header(request, "X-Shopify-Triggered-At"),
    subscriptionName: header(request, "X-Shopify-Name") || null,
  });
};

const errorCode = (error: unknown): string => {
  if (error instanceof MMGShopifySubscriptionReconciliationError) {
    return error.code;
  }
  if (error instanceof Error && /^MMG_[A-Z0-9_]+$/.test(error.message)) {
    return error.message;
  }
  return "MMG_SHOPIFY_SUBSCRIPTION_WEBHOOK_INTERNAL_ERROR";
};

const errorRetryable = (error: unknown): boolean =>
  error instanceof MMGShopifySubscriptionReconciliationError
    ? error.retryable
    : true;

export const handleMMGShopifySubscriptionWebhookRequest = async (
  request: Request,
  dependencies: MMGShopifySubscriptionWebhookHttpDependencies,
): Promise<Response> => {
  if (request.method !== "POST") {
    return failure(
      405,
      "MMG_SHOPIFY_WEBHOOK_METHOD_NOT_ALLOWED",
      "Only POST is supported by the Shopify subscription webhook endpoint.",
      false,
      "POST",
    );
  }

  const contentLength = Number(header(request, "Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return failure(
      413,
      "MMG_SHOPIFY_WEBHOOK_BODY_TOO_LARGE",
      "The Shopify webhook payload exceeded the accepted size.",
      false,
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return failure(
      400,
      "MMG_SHOPIFY_WEBHOOK_BODY_UNREADABLE",
      "The Shopify webhook body could not be read.",
      false,
    );
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return failure(
      413,
      "MMG_SHOPIFY_WEBHOOK_BODY_TOO_LARGE",
      "The Shopify webhook payload exceeded the accepted size.",
      false,
    );
  }

  const providedHmac = header(request, "X-Shopify-Hmac-Sha256");
  const verify = dependencies.verifyHmac ?? verifyShopifyWebhookHmac;
  if (
    !verify({
      rawBody,
      providedHmac,
      clientSecret: dependencies.clientSecret,
    })
  ) {
    return failure(
      401,
      "MMG_SHOPIFY_WEBHOOK_HMAC_INVALID",
      "The Shopify webhook signature could not be verified.",
      false,
    );
  }

  let metadata: MMGShopifyWebhookMetadata;
  let payload:
    | MMGShopifyContractWebhookPayload
    | MMGShopifyBillingAttemptWebhookPayload;
  try {
    metadata = metadataFromRequest(request);
    payload = safePayload(rawBody);
  } catch (error) {
    return failure(
      400,
      errorCode(error),
      "The verified Shopify webhook metadata or payload is invalid.",
      false,
    );
  }

  let expectedShopDomain: string;
  try {
    expectedShopDomain = normalizeMMGShopifyShopDomain(
      dependencies.expectedShopDomain,
    );
  } catch {
    return failure(
      503,
      "MMG_SHOPIFY_EXPECTED_SHOP_NOT_CONFIGURED",
      "The subscription reconciliation endpoint is not configured.",
      true,
    );
  }
  if (metadata.shopDomain !== expectedShopDomain) {
    return failure(
      403,
      "MMG_SHOPIFY_WEBHOOK_SHOP_NOT_ALLOWED",
      "This Shopify shop is not authorized for MMG subscription reconciliation.",
      false,
    );
  }
  if (metadata.apiVersion !== dependencies.expectedApiVersion) {
    return failure(
      409,
      "MMG_SHOPIFY_WEBHOOK_API_VERSION_MISMATCH",
      "The Shopify webhook API version does not match the deployed reconciliation contract.",
      true,
    );
  }

  const receivedAt = dependencies.now();
  let claim: Awaited<
    ReturnType<MMGShopifySubscriptionWebhookRepository["claimWebhookDelivery"]>
  >;
  try {
    claim = await dependencies.repository.claimWebhookDelivery({
      metadata,
      payloadSha256: sha256Hex(rawBody),
      receivedAt,
    });
  } catch {
    return failure(
      503,
      "MMG_SHOPIFY_WEBHOOK_INBOX_UNAVAILABLE",
      "The Shopify webhook could not be recorded for reconciliation.",
      true,
    );
  }

  if (claim === "duplicate_processed") {
    return json({ ok: true, status: "duplicate_ignored" }, 200);
  }

  try {
    const result = await reconcileMMGShopifySubscriptionWebhook({
      dependencies,
      metadata,
      payload,
    });
    await dependencies.repository.markWebhookProcessed({
      webhookId: metadata.webhookId,
      processedAt: dependencies.now(),
      outcome: {
        entitlementId: result.entitlementId,
        cycleId: result.cycleId,
        cycleCreated: result.cycleCreated,
        orderLinkUpdated: result.orderLinkUpdated,
        staleIgnored: result.staleIgnored,
      },
    });
    return json(
      {
        ok: true,
        status: result.staleIgnored ? "stale_ignored" : "reconciled",
      },
      200,
    );
  } catch (error) {
    const code = errorCode(error);
    const retryable = errorRetryable(error);

    if (!retryable) {
      await dependencies.repository.markWebhookProcessed({
        webhookId: metadata.webhookId,
        processedAt: dependencies.now(),
        outcome: { ignored: true, errorCode: code },
      });
      return json({ ok: true, status: "noncanonical_ignored", code }, 200);
    }

    try {
      await dependencies.repository.markWebhookFailed({
        webhookId: metadata.webhookId,
        failedAt: dependencies.now(),
        errorCode: code,
        retryable: true,
      });
    } catch {
      // Shopify will retry the original verified delivery after a non-2xx response.
    }
    return failure(
      503,
      code,
      "The Shopify subscription event could not be reconciled yet.",
      true,
    );
  }
};
