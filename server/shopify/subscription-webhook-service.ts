import type {
  MMGShopifySubscriptionWebhookRepository,
  MMGShopifySubscriptionReconciliationResult,
} from "./subscription-webhook-repository.js";
import {
  buildMMGShopifySubscriptionReconciliationCommand,
  extractMMGShopifySubscriptionContractId,
  type MMGShopifyBillingAttemptWebhookPayload,
  type MMGShopifyContractWebhookPayload,
  type MMGShopifySubscriptionContractSnapshot,
  type MMGShopifySubscriptionRuntimeMapping,
  type MMGShopifyWebhookMetadata,
} from "./subscription-webhook-reconciliation.js";

export interface MMGShopifySubscriptionContractGateway {
  loadContractSnapshot(input: {
    shopDomain: string;
    contractId: string;
    apiVersion: string;
    topic: MMGShopifyWebhookMetadata["topic"];
    billingOrderId: string | null;
  }): Promise<MMGShopifySubscriptionContractSnapshot | null>;
}

export interface MMGShopifySubscriptionWebhookServiceDependencies {
  repository: MMGShopifySubscriptionWebhookRepository;
  gateway: MMGShopifySubscriptionContractGateway;
  runtimeMapping: MMGShopifySubscriptionRuntimeMapping;
}

export class MMGShopifySubscriptionReconciliationError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean, message?: string) {
    super(message ?? code);
    this.name = "MMGShopifySubscriptionReconciliationError";
    this.code = code;
    this.retryable = retryable;
  }
}

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const numericOrderGid = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return `gid://shopify/Order/${value}`;
  }
  const string = stringValue(value);
  return /^\d+$/.test(string) ? `gid://shopify/Order/${string}` : null;
};

const billingOrderId = (
  payload: MMGShopifyBillingAttemptWebhookPayload | MMGShopifyContractWebhookPayload,
): string | null => {
  const attempt = payload as MMGShopifyBillingAttemptWebhookPayload;
  const direct = stringValue(attempt.admin_graphql_api_order_id);
  return direct || numericOrderGid(attempt.order_id);
};

const assertPayloadSnapshotConsistency = (input: {
  payload: MMGShopifyContractWebhookPayload | MMGShopifyBillingAttemptWebhookPayload;
  snapshot: MMGShopifySubscriptionContractSnapshot;
  topic: MMGShopifyWebhookMetadata["topic"];
}): void => {
  if (!input.topic.startsWith("subscription_contracts/")) return;
  const payload = input.payload as MMGShopifyContractWebhookPayload;
  const customerId = stringValue(payload.admin_graphql_api_customer_id);
  const originOrderId = stringValue(payload.admin_graphql_api_origin_order_id);
  const revisionId = stringValue(payload.revision_id);

  if (customerId && customerId !== input.snapshot.customerId) {
    throw new MMGShopifySubscriptionReconciliationError(
      "MMG_SHOPIFY_PAYLOAD_CUSTOMER_MISMATCH",
      true,
    );
  }
  if (originOrderId && originOrderId !== input.snapshot.originOrderId) {
    throw new MMGShopifySubscriptionReconciliationError(
      "MMG_SHOPIFY_PAYLOAD_ORDER_MISMATCH",
      true,
    );
  }
  if (revisionId && revisionId !== input.snapshot.revisionId) {
    throw new MMGShopifySubscriptionReconciliationError(
      "MMG_SHOPIFY_PAYLOAD_REVISION_MISMATCH",
      true,
    );
  }
};

export const reconcileMMGShopifySubscriptionWebhook = async (input: {
  dependencies: MMGShopifySubscriptionWebhookServiceDependencies;
  metadata: MMGShopifyWebhookMetadata;
  payload:
    | MMGShopifyContractWebhookPayload
    | MMGShopifyBillingAttemptWebhookPayload;
}): Promise<MMGShopifySubscriptionReconciliationResult> => {
  let contractId: string;
  try {
    contractId = extractMMGShopifySubscriptionContractId({
      topic: input.metadata.topic,
      payload: input.payload,
    });
  } catch (error) {
    throw new MMGShopifySubscriptionReconciliationError(
      error instanceof Error ? error.message : "MMG_SHOPIFY_INVALID_CONTRACT_PAYLOAD",
      false,
    );
  }

  const snapshot = await input.dependencies.gateway.loadContractSnapshot({
    shopDomain: input.metadata.shopDomain,
    contractId,
    apiVersion: input.metadata.apiVersion,
    topic: input.metadata.topic,
    billingOrderId: billingOrderId(input.payload),
  });

  if (!snapshot) {
    throw new MMGShopifySubscriptionReconciliationError(
      "MMG_SHOPIFY_SUBSCRIPTION_CONTRACT_NOT_AVAILABLE",
      true,
    );
  }

  assertPayloadSnapshotConsistency({
    payload: input.payload,
    snapshot,
    topic: input.metadata.topic,
  });

  try {
    const command = buildMMGShopifySubscriptionReconciliationCommand({
      metadata: input.metadata,
      payload: input.payload,
      contract: snapshot,
      mapping: input.dependencies.runtimeMapping,
    });
    return await input.dependencies.repository.reconcileSubscription(command);
  } catch (error) {
    if (error instanceof MMGShopifySubscriptionReconciliationError) throw error;
    const code = error instanceof Error
      ? error.message
      : "MMG_SHOPIFY_SUBSCRIPTION_RECONCILIATION_FAILED";
    const retryable = ![
      "MMG_SHOPIFY_NONCANONICAL_SUBSCRIPTION_PRODUCT",
      "MMG_SHOPIFY_NONCANONICAL_SELLING_PLAN",
      "MMG_SHOPIFY_UNMAPPED_SUBSCRIPTION_VARIANT",
      "MMG_SHOPIFY_SUBSCRIPTION_CURRENCY_MISMATCH",
      "MMG_SHOPIFY_SUBSCRIPTION_POLICY_MISMATCH",
      "MMG_SHOPIFY_SUBSCRIPTION_QUANTITY_MISMATCH",
    ].includes(code);
    throw new MMGShopifySubscriptionReconciliationError(code, retryable);
  }
};
