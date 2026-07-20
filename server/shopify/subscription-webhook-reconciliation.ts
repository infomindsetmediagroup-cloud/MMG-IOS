import {
  MMG_SUBSCRIPTION_PLANS,
  type MMGSubscriptionPlanCode,
} from "../knowledge-library/entitlements.js";

export const MMG_SHOPIFY_SUBSCRIPTION_WEBHOOK_TOPICS = [
  "subscription_contracts/create",
  "subscription_contracts/update",
  "subscription_billing_attempts/success",
  "subscription_billing_attempts/failure",
  "subscription_billing_attempts/challenged",
] as const;

export type MMGShopifySubscriptionWebhookTopic =
  (typeof MMG_SHOPIFY_SUBSCRIPTION_WEBHOOK_TOPICS)[number];

export type MMGShopifyContractStatus =
  | "ACTIVE"
  | "PAUSED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type MMGSubscriptionEntitlementStatus =
  | "pending"
  | "active"
  | "paused"
  | "failed"
  | "canceled"
  | "expired";

export type MMGShopifyBillingAttemptState =
  | "succeeded"
  | "failed"
  | "challenged";

export interface MMGShopifyWebhookMetadata {
  webhookId: string;
  eventId: string | null;
  topic: MMGShopifySubscriptionWebhookTopic;
  shopDomain: string;
  apiVersion: string;
  triggeredAt: string;
  subscriptionName: string | null;
}

export interface MMGShopifySubscriptionRuntimeMapping {
  productGid: string;
  sellingPlanGid: string;
  variantGids: Record<MMGSubscriptionPlanCode, string>;
}

export interface MMGShopifySubscriptionContractSnapshot {
  contractId: string;
  customerId: string;
  originOrderId: string;
  revisionId: string;
  status: MMGShopifyContractStatus;
  updatedAt: string;
  currencyCode: "USD";
  nextBillingDate: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  billingPolicy: {
    interval: "MONTH";
    intervalCount: 1;
  };
  deliveryPolicy: {
    interval: "MONTH";
    intervalCount: 1;
  };
  canonicalLine: {
    productId: string;
    variantId: string;
    sellingPlanId: string;
    quantity: number;
  };
}

export interface MMGShopifyContractWebhookPayload {
  admin_graphql_api_id?: unknown;
  id?: unknown;
  admin_graphql_api_customer_id?: unknown;
  customer_id?: unknown;
  admin_graphql_api_origin_order_id?: unknown;
  origin_order_id?: unknown;
  revision_id?: unknown;
  status?: unknown;
}

export interface MMGShopifyBillingAttemptWebhookPayload {
  idempotency_key?: unknown;
  order_id?: unknown;
  admin_graphql_api_order_id?: unknown;
  subscription_contract_id?: unknown;
  admin_graphql_api_subscription_contract_id?: unknown;
  ready?: unknown;
  error_message?: unknown;
  error_code?: unknown;
}

export interface MMGShopifySubscriptionReconciliationCommand {
  metadata: MMGShopifyWebhookMetadata;
  contract: MMGShopifySubscriptionContractSnapshot;
  planCode: MMGSubscriptionPlanCode;
  entitlementStatus: MMGSubscriptionEntitlementStatus;
  billingAttempt: {
    idempotencyKey: string;
    state: MMGShopifyBillingAttemptState;
    orderId: string | null;
    ready: boolean;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
}

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const GID_PATTERN = /^gid:\/\/shopify\/[A-Za-z][A-Za-z0-9]*\/[A-Za-z0-9_-]+$/;
const API_VERSION_PATTERN = /^20\d{2}-(01|04|07|10)$/;
const DIGITS_PATTERN = /^\d+$/;

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const integerString = (value: unknown): string => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  const parsed = stringValue(value);
  return DIGITS_PATTERN.test(parsed) ? parsed : "";
};

const gidFromNumeric = (resource: string, value: unknown): string => {
  const numeric = integerString(value);
  return numeric ? `gid://shopify/${resource}/${numeric}` : "";
};

const requiredGid = (value: string, resource: string): string => {
  if (!GID_PATTERN.test(value) || !value.startsWith(`gid://shopify/${resource}/`)) {
    throw new Error(`MMG_SHOPIFY_INVALID_${resource.toUpperCase()}_GID`);
  }
  return value;
};

const requiredDate = (value: string, code: string): string => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return new Date(parsed).toISOString();
};

export const normalizeMMGShopifyShopDomain = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!SHOP_DOMAIN_PATTERN.test(normalized)) {
    throw new Error("MMG_SHOPIFY_INVALID_SHOP_DOMAIN");
  }
  return normalized;
};

export const isMMGShopifySubscriptionWebhookTopic = (
  value: string,
): value is MMGShopifySubscriptionWebhookTopic =>
  MMG_SHOPIFY_SUBSCRIPTION_WEBHOOK_TOPICS.includes(
    value as MMGShopifySubscriptionWebhookTopic,
  );

export const validateMMGShopifyWebhookMetadata = (
  metadata: MMGShopifyWebhookMetadata,
): MMGShopifyWebhookMetadata => {
  if (metadata.webhookId.trim().length < 8 || metadata.webhookId.length > 128) {
    throw new Error("MMG_SHOPIFY_INVALID_WEBHOOK_ID");
  }
  if (metadata.eventId && metadata.eventId.length > 128) {
    throw new Error("MMG_SHOPIFY_INVALID_EVENT_ID");
  }
  if (!isMMGShopifySubscriptionWebhookTopic(metadata.topic)) {
    throw new Error("MMG_SHOPIFY_UNSUPPORTED_WEBHOOK_TOPIC");
  }
  if (!API_VERSION_PATTERN.test(metadata.apiVersion)) {
    throw new Error("MMG_SHOPIFY_INVALID_WEBHOOK_API_VERSION");
  }

  return {
    ...metadata,
    shopDomain: normalizeMMGShopifyShopDomain(metadata.shopDomain),
    triggeredAt: requiredDate(
      metadata.triggeredAt,
      "MMG_SHOPIFY_INVALID_TRIGGERED_AT",
    ),
  };
};

export const extractMMGShopifySubscriptionContractId = (input: {
  topic: MMGShopifySubscriptionWebhookTopic;
  payload:
    | MMGShopifyContractWebhookPayload
    | MMGShopifyBillingAttemptWebhookPayload;
}): string => {
  const isContractTopic = input.topic.startsWith("subscription_contracts/");
  const payload = input.payload as Record<string, unknown>;
  const direct = stringValue(
    isContractTopic
      ? payload.admin_graphql_api_id
      : payload.admin_graphql_api_subscription_contract_id,
  );
  const fallback = gidFromNumeric(
    "SubscriptionContract",
    isContractTopic ? payload.id : payload.subscription_contract_id,
  );
  return requiredGid(direct || fallback, "SubscriptionContract");
};

export const mapMMGShopifyContractStatus = (
  status: MMGShopifyContractStatus,
): MMGSubscriptionEntitlementStatus => {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "PAUSED":
      return "paused";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "canceled";
    case "EXPIRED":
      return "expired";
  }
};

export const resolveMMGSubscriptionPlanCode = (input: {
  contract: MMGShopifySubscriptionContractSnapshot;
  mapping: MMGShopifySubscriptionRuntimeMapping;
}): MMGSubscriptionPlanCode => {
  const planCode = (Object.entries(input.mapping.variantGids) as Array<
    [MMGSubscriptionPlanCode, string]
  >).find(([, variantId]) => variantId === input.contract.canonicalLine.variantId)?.[0];

  if (!planCode) throw new Error("MMG_SHOPIFY_UNMAPPED_SUBSCRIPTION_VARIANT");
  return planCode;
};

export const validateMMGShopifySubscriptionContract = (input: {
  contract: MMGShopifySubscriptionContractSnapshot;
  mapping: MMGShopifySubscriptionRuntimeMapping;
  expectedShopDomain: string;
}): MMGSubscriptionPlanCode => {
  const { contract, mapping } = input;
  normalizeMMGShopifyShopDomain(input.expectedShopDomain);
  requiredGid(contract.contractId, "SubscriptionContract");
  requiredGid(contract.customerId, "Customer");
  requiredGid(contract.originOrderId, "Order");
  requiredGid(contract.canonicalLine.productId, "Product");
  requiredGid(contract.canonicalLine.variantId, "ProductVariant");
  requiredGid(contract.canonicalLine.sellingPlanId, "SellingPlan");

  if (!DIGITS_PATTERN.test(contract.revisionId)) {
    throw new Error("MMG_SHOPIFY_INVALID_CONTRACT_REVISION");
  }
  requiredDate(contract.updatedAt, "MMG_SHOPIFY_INVALID_CONTRACT_UPDATED_AT");
  if (contract.currentPeriodStart) {
    requiredDate(contract.currentPeriodStart, "MMG_SHOPIFY_INVALID_PERIOD_START");
  }
  if (contract.currentPeriodEnd) {
    requiredDate(contract.currentPeriodEnd, "MMG_SHOPIFY_INVALID_PERIOD_END");
  }
  if (
    contract.currentPeriodStart &&
    contract.currentPeriodEnd &&
    Date.parse(contract.currentPeriodEnd) <= Date.parse(contract.currentPeriodStart)
  ) {
    throw new Error("MMG_SHOPIFY_INVALID_BILLING_PERIOD");
  }
  if (contract.currencyCode !== "USD") {
    throw new Error("MMG_SHOPIFY_SUBSCRIPTION_CURRENCY_MISMATCH");
  }
  if (
    contract.billingPolicy.interval !== "MONTH" ||
    contract.billingPolicy.intervalCount !== 1 ||
    contract.deliveryPolicy.interval !== "MONTH" ||
    contract.deliveryPolicy.intervalCount !== 1
  ) {
    throw new Error("MMG_SHOPIFY_SUBSCRIPTION_POLICY_MISMATCH");
  }
  if (contract.canonicalLine.productId !== mapping.productGid) {
    throw new Error("MMG_SHOPIFY_NONCANONICAL_SUBSCRIPTION_PRODUCT");
  }
  if (contract.canonicalLine.sellingPlanId !== mapping.sellingPlanGid) {
    throw new Error("MMG_SHOPIFY_NONCANONICAL_SELLING_PLAN");
  }
  if (contract.canonicalLine.quantity !== 1) {
    throw new Error("MMG_SHOPIFY_SUBSCRIPTION_QUANTITY_MISMATCH");
  }

  return resolveMMGSubscriptionPlanCode({ contract, mapping });
};

const billingAttemptStateForTopic = (
  topic: MMGShopifySubscriptionWebhookTopic,
): MMGShopifyBillingAttemptState | null => {
  switch (topic) {
    case "subscription_billing_attempts/success":
      return "succeeded";
    case "subscription_billing_attempts/failure":
      return "failed";
    case "subscription_billing_attempts/challenged":
      return "challenged";
    default:
      return null;
  }
};

const optionalOrderGid = (payload: MMGShopifyBillingAttemptWebhookPayload): string | null => {
  const direct = stringValue(payload.admin_graphql_api_order_id);
  const fallback = gidFromNumeric("Order", payload.order_id);
  const candidate = direct || fallback;
  return candidate ? requiredGid(candidate, "Order") : null;
};

export const buildMMGShopifySubscriptionReconciliationCommand = (input: {
  metadata: MMGShopifyWebhookMetadata;
  payload:
    | MMGShopifyContractWebhookPayload
    | MMGShopifyBillingAttemptWebhookPayload;
  contract: MMGShopifySubscriptionContractSnapshot;
  mapping: MMGShopifySubscriptionRuntimeMapping;
}): MMGShopifySubscriptionReconciliationCommand => {
  const metadata = validateMMGShopifyWebhookMetadata(input.metadata);
  const planCode = validateMMGShopifySubscriptionContract({
    contract: input.contract,
    mapping: input.mapping,
    expectedShopDomain: metadata.shopDomain,
  });
  const extractedContractId = extractMMGShopifySubscriptionContractId({
    topic: metadata.topic,
    payload: input.payload,
  });
  if (extractedContractId !== input.contract.contractId) {
    throw new Error("MMG_SHOPIFY_WEBHOOK_CONTRACT_MISMATCH");
  }

  const attemptState = billingAttemptStateForTopic(metadata.topic);
  let billingAttempt: MMGShopifySubscriptionReconciliationCommand["billingAttempt"] = null;
  if (attemptState) {
    const payload = input.payload as MMGShopifyBillingAttemptWebhookPayload;
    const idempotencyKey = stringValue(payload.idempotency_key);
    if (idempotencyKey.length < 8 || idempotencyKey.length > 255) {
      throw new Error("MMG_SHOPIFY_INVALID_BILLING_IDEMPOTENCY_KEY");
    }
    billingAttempt = {
      idempotencyKey,
      state: attemptState,
      orderId: optionalOrderGid(payload),
      ready: payload.ready === true,
      errorCode: stringValue(payload.error_code) || null,
      errorMessage: stringValue(payload.error_message) || null,
    };
  }

  const plan = MMG_SUBSCRIPTION_PLANS[planCode];
  if (
    plan.assetsPerBillingCycle !==
    plan.packagesPerBillingCycle * plan.assetsPerPackage
  ) {
    throw new Error("MMG_SUBSCRIPTION_PLAN_CONTRACT_INVALID");
  }

  return {
    metadata,
    contract: input.contract,
    planCode,
    entitlementStatus: mapMMGShopifyContractStatus(input.contract.status),
    billingAttempt,
  };
};
