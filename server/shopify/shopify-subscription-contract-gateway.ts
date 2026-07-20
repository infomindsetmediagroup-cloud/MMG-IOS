import type {
  MMGShopifyContractStatus,
  MMGShopifySubscriptionContractSnapshot,
  MMGShopifyWebhookMetadata,
} from "./subscription-webhook-reconciliation.js";
import type { MMGShopifySubscriptionContractGateway } from "./subscription-webhook-service.js";

export const MMG_SUBSCRIPTION_CONTRACT_QUERY = `
  query MMGSubscriptionContractReconciliation($contractId: ID!) {
    subscriptionContract(id: $contractId) {
      id
      status
      revisionId
      updatedAt
      nextBillingDate
      currencyCode
      customer { id }
      originOrder { id createdAt }
      billingPolicy { interval intervalCount }
      deliveryPolicy { interval intervalCount }
      lines(first: 10) {
        nodes {
          productId
          variantId
          sellingPlanId
          quantity
          requiresShipping
        }
      }
      orders(first: 10, reverse: true) {
        nodes { id createdAt }
      }
    }
  }
`;

interface GraphQLContractLine {
  productId: string | null;
  variantId: string | null;
  sellingPlanId: string | null;
  quantity: number;
  requiresShipping: boolean;
}

interface GraphQLOrder {
  id: string;
  createdAt: string;
}

interface GraphQLContract {
  id: string;
  status: string;
  revisionId: string | number;
  updatedAt: string;
  nextBillingDate: string | null;
  currencyCode: string;
  customer: { id: string } | null;
  originOrder: GraphQLOrder | null;
  billingPolicy: { interval: string; intervalCount: number };
  deliveryPolicy: { interval: string; intervalCount: number };
  lines: { nodes: GraphQLContractLine[] };
  orders: { nodes: GraphQLOrder[] };
}

interface GraphQLResponse {
  data?: { subscriptionContract?: GraphQLContract | null };
  errors?: Array<{ message?: string }>;
}

export interface MMGShopifySubscriptionContractGatewayDependencies {
  accessTokenForShop(shopDomain: string): Promise<string | null>;
  fetcher?: typeof fetch;
}

const iso = (value: string | null): string | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

const status = (value: string): MMGShopifyContractStatus => {
  if (
    value === "ACTIVE" ||
    value === "PAUSED" ||
    value === "FAILED" ||
    value === "CANCELLED" ||
    value === "EXPIRED"
  ) {
    return value;
  }
  throw new Error("MMG_SHOPIFY_UNSUPPORTED_CONTRACT_STATUS");
};

const selectPeriodStart = (input: {
  contract: GraphQLContract;
  billingOrderId: string | null;
}): string | null => {
  const orders = input.contract.orders.nodes ?? [];
  const chosen = input.billingOrderId
    ? orders.find((order) => order.id === input.billingOrderId)
    : orders[0] ?? input.contract.originOrder;
  return iso(chosen?.createdAt ?? input.contract.originOrder?.createdAt ?? null);
};

export class MMGShopifyAdminSubscriptionContractGateway
  implements MMGShopifySubscriptionContractGateway
{
  readonly #dependencies: MMGShopifySubscriptionContractGatewayDependencies;

  constructor(dependencies: MMGShopifySubscriptionContractGatewayDependencies) {
    this.#dependencies = dependencies;
  }

  async loadContractSnapshot(input: {
    shopDomain: string;
    contractId: string;
    apiVersion: string;
    topic: MMGShopifyWebhookMetadata["topic"];
    billingOrderId: string | null;
  }): Promise<MMGShopifySubscriptionContractSnapshot | null> {
    const token = await this.#dependencies.accessTokenForShop(input.shopDomain);
    if (!token) throw new Error("MMG_SHOPIFY_ADMIN_TOKEN_NOT_AVAILABLE");

    const response = await (this.#dependencies.fetcher ?? fetch)(
      `https://${input.shopDomain}/admin/api/${input.apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: MMG_SUBSCRIPTION_CONTRACT_QUERY,
          variables: { contractId: input.contractId },
        }),
      },
    );

    if (!response.ok) {
      throw new Error("MMG_SHOPIFY_ADMIN_CONTRACT_QUERY_FAILED");
    }

    const body = (await response.json()) as GraphQLResponse;
    if (body.errors?.length) {
      throw new Error("MMG_SHOPIFY_ADMIN_CONTRACT_QUERY_ERROR");
    }
    const contract = body.data?.subscriptionContract;
    if (!contract) return null;

    const lines = contract.lines?.nodes ?? [];
    if (lines.length !== 1) {
      throw new Error("MMG_SHOPIFY_CONTRACT_LINE_COUNT_MISMATCH");
    }
    const line = lines[0];
    if (
      !line ||
      !line.productId ||
      !line.variantId ||
      !line.sellingPlanId ||
      line.requiresShipping
    ) {
      throw new Error("MMG_SHOPIFY_CONTRACT_LINE_INVALID");
    }
    if (!contract.customer || !contract.originOrder) {
      throw new Error("MMG_SHOPIFY_CONTRACT_IDENTITY_INCOMPLETE");
    }

    const currentPeriodStart = selectPeriodStart({
      contract,
      billingOrderId: input.billingOrderId,
    });
    const currentPeriodEnd = iso(contract.nextBillingDate);

    return {
      contractId: contract.id,
      customerId: contract.customer.id,
      originOrderId: contract.originOrder.id,
      revisionId: String(contract.revisionId),
      status: status(contract.status),
      updatedAt: iso(contract.updatedAt) ?? contract.updatedAt,
      currencyCode: contract.currencyCode as "USD",
      nextBillingDate: currentPeriodEnd,
      currentPeriodStart,
      currentPeriodEnd:
        currentPeriodStart && currentPeriodEnd &&
        Date.parse(currentPeriodEnd) > Date.parse(currentPeriodStart)
          ? currentPeriodEnd
          : null,
      billingPolicy: {
        interval: contract.billingPolicy.interval as "MONTH",
        intervalCount: contract.billingPolicy.intervalCount as 1,
      },
      deliveryPolicy: {
        interval: contract.deliveryPolicy.interval as "MONTH",
        intervalCount: contract.deliveryPolicy.intervalCount as 1,
      },
      canonicalLine: {
        productId: line.productId,
        variantId: line.variantId,
        sellingPlanId: line.sellingPlanId,
        quantity: line.quantity,
      },
    };
  }
}
