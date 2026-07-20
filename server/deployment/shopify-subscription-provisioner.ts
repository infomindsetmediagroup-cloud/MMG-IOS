import {
  MMG_SHOPIFY_API_VERSION,
  type MMGShopifyRuntimeMapping,
} from "./live-commerce-deployment.js";

export type MMGShopifyProvisioningMode = "inspect" | "dry_run" | "execute";

export interface MMGShopifyGraphQLRequest {
  operationName: string;
  query: string;
  variables: Record<string, unknown>;
}

export interface MMGShopifyGraphQLClient {
  request<T>(request: MMGShopifyGraphQLRequest): Promise<T>;
}

export interface MMGShopifyProvisioningOperation {
  sequence: number;
  code: string;
  mutation: string | null;
  destructive: boolean;
  requiresRuntimeValues: string[];
  purpose: string;
  variables: Record<string, unknown>;
}

export interface MMGShopifySubscriptionProvisioningPlan {
  schemaVersion: "1.0.0";
  apiVersion: typeof MMG_SHOPIFY_API_VERSION;
  shopDomain: string;
  mode: MMGShopifyProvisioningMode;
  productHandle: "mmg-knowledge-subscription";
  productTitle: "MMG Knowledge Subscription™";
  keepDraft: boolean;
  operations: MMGShopifyProvisioningOperation[];
}

export const MMG_SUBSCRIPTION_PRODUCT_INSPECTION_QUERY = `#graphql
  query MMGSubscriptionProductInspection($query: String!) {
    products(first: 2, query: $query) {
      nodes {
        id
        title
        handle
        status
        requiresSellingPlan
        productType
        vendor
        options {
          id
          name
          optionValues { id name hasVariants }
        }
        variants(first: 10) {
          nodes {
            id
            title
            sku
            price
            taxable
            selectedOptions { name value }
            inventoryItem { tracked requiresShipping }
            metafields(first: 10, namespace: "mmg") {
              nodes { namespace key type value }
            }
          }
        }
        sellingPlanGroups(first: 10) {
          nodes {
            id
            name
            merchantCode
            sellingPlans(first: 10) { nodes { id name category } }
          }
        }
        metafields(first: 20, namespace: "mmg") {
          nodes { namespace key type value }
        }
      }
    }
    publications(first: 20) {
      nodes { id name catalogType }
    }
  }
`;

export const MMG_SUBSCRIPTION_PRODUCT_CREATE_MUTATION = `#graphql
  mutation MMGSubscriptionProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id
        handle
        status
        requiresSellingPlan
        options { id name optionValues { id name hasVariants } }
        variants(first: 10) { nodes { id title selectedOptions { name value } } }
      }
      userErrors { field message }
    }
  }
`;

export const MMG_SUBSCRIPTION_VARIANTS_UPDATE_MUTATION = `#graphql
  mutation MMGSubscriptionVariantsUpdate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id title sku price selectedOptions { name value } }
      userErrors { field message }
    }
  }
`;

export const MMG_SUBSCRIPTION_VARIANTS_CREATE_MUTATION = `#graphql
  mutation MMGSubscriptionVariantsCreate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id title sku price selectedOptions { name value } }
      userErrors { field message }
    }
  }
`;

export const MMG_SUBSCRIPTION_SELLING_PLAN_CREATE_MUTATION = `#graphql
  mutation MMGSubscriptionSellingPlanCreate(
    $input: SellingPlanGroupInput!
    $resources: SellingPlanGroupResourceInput
  ) {
    sellingPlanGroupCreate(input: $input, resources: $resources) {
      sellingPlanGroup {
        id
        name
        merchantCode
        sellingPlans(first: 10) { nodes { id name category } }
      }
      userErrors { field message }
    }
  }
`;

export const MMG_SUBSCRIPTION_METAFIELDS_SET_MUTATION = `#graphql
  mutation MMGSubscriptionMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key type value ownerType }
      userErrors { field message code }
    }
  }
`;

export const MMG_SUBSCRIPTION_PRODUCT_ACTIVATE_MUTATION = `#graphql
  mutation MMGSubscriptionProductActivate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id status requiresSellingPlan }
      userErrors { field message }
    }
  }
`;

export const MMG_SUBSCRIPTION_PRODUCT_PUBLISH_MUTATION = `#graphql
  mutation MMGSubscriptionProductPublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable {
        availablePublicationsCount { count }
        resourcePublicationsCount { count }
      }
      userErrors { field message }
    }
  }
`;

const shopDomain = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
    throw new Error("MMG_SHOPIFY_PROVISIONING_SHOP_INVALID");
  }
  return normalized;
};

const variantInput = (input: {
  id?: string;
  optionValue: "Monthly" | "Bi-weekly" | "Weekly";
  sku: string;
  price: string;
  planCode: "monthly" | "biweekly" | "weekly";
  packages: number;
  assets: number;
}): Record<string, unknown> => ({
  ...(input.id ? { id: input.id } : {}),
  optionValues: [{ optionName: "Delivery cadence", name: input.optionValue }],
  price: input.price,
  taxable: false,
  inventoryItem: {
    sku: input.sku,
    tracked: false,
    requiresShipping: false,
  },
  metafields: [
    {
      namespace: "mmg",
      key: "subscription_plan_code",
      type: "single_line_text_field",
      value: input.planCode,
    },
    {
      namespace: "mmg",
      key: "packages_per_billing_cycle",
      type: "number_integer",
      value: String(input.packages),
    },
    {
      namespace: "mmg",
      key: "assets_per_package",
      type: "number_integer",
      value: "2",
    },
    {
      namespace: "mmg",
      key: "assets_per_billing_cycle",
      type: "number_integer",
      value: String(input.assets),
    },
    {
      namespace: "mmg",
      key: "entitlement_units",
      type: "number_integer",
      value: String(input.assets),
    },
  ],
});

export const buildMMGShopifySubscriptionProvisioningPlan = (input: {
  shopDomain: string;
  mode: MMGShopifyProvisioningMode;
  existingMapping?: MMGShopifyRuntimeMapping | null;
}): MMGShopifySubscriptionProvisioningPlan => {
  const shop = shopDomain(input.shopDomain);
  const existing = input.existingMapping ?? null;
  const operations: MMGShopifyProvisioningOperation[] = [
    {
      sequence: 1,
      code: "INSPECT_CANONICAL_PRODUCT",
      mutation: null,
      destructive: false,
      requiresRuntimeValues: [],
      purpose:
        "Find the canonical product by exact handle, detect duplicates, inspect variants, selling plans, metafields, and the Online Store publication.",
      variables: { query: "handle:mmg-knowledge-subscription" },
    },
    {
      sequence: 2,
      code: "CREATE_DRAFT_SUBSCRIPTION_PRODUCT",
      mutation: "productCreate",
      destructive: true,
      requiresRuntimeValues: [],
      purpose:
        "Create the canonical subscription-only product as DRAFT with the complete Delivery cadence option. Never publish during provisioning.",
      variables: {
        product: {
          title: "MMG Knowledge Subscription™",
          handle: "mmg-knowledge-subscription",
          vendor: "Mindset Media Group™",
          productType: "Subscription",
          status: "DRAFT",
          requiresSellingPlan: true,
          productOptions: [
            {
              name: "Delivery cadence",
              values: [
                { name: "Monthly" },
                { name: "Bi-weekly" },
                { name: "Weekly" },
              ],
            },
          ],
          metafields: [
            {
              namespace: "mmg",
              key: "product_type",
              type: "single_line_text_field",
              value: "subscription",
            },
            {
              namespace: "mmg",
              key: "asset_status",
              type: "single_line_text_field",
              value: "approved",
            },
            {
              namespace: "mmg",
              key: "customer_destination",
              type: "single_line_text_field",
              value: "subscription_dashboard_and_my_library",
            },
            {
              namespace: "mmg",
              key: "first_selection_count",
              type: "number_integer",
              value: "2",
            },
            {
              namespace: "mmg",
              key: "review_window_min_hours",
              type: "number_integer",
              value: "24",
            },
            {
              namespace: "mmg",
              key: "review_window_max_hours",
              type: "number_integer",
              value: "48",
            },
          ],
        },
      },
    },
    {
      sequence: 3,
      code: "CONFIGURE_MONTHLY_VARIANT",
      mutation: "productVariantsBulkUpdate",
      destructive: true,
      requiresRuntimeValues: ["productGid", "monthlyVariantGid"],
      purpose:
        "Configure the initial Monthly variant with the exact SKU, price, digital fulfillment flags, and private MMG entitlement metadata.",
      variables: {
        productId: existing?.productGid ?? "${productGid}",
        variants: [
          variantInput({
            id: existing?.variantGids.monthly ?? "${monthlyVariantGid}",
            optionValue: "Monthly",
            sku: "MMG-KS-MONTHLY",
            price: "14.95",
            planCode: "monthly",
            packages: 1,
            assets: 2,
          }),
        ],
      },
    },
    {
      sequence: 4,
      code: "CREATE_BIWEEKLY_AND_WEEKLY_VARIANTS",
      mutation: "productVariantsBulkCreate",
      destructive: true,
      requiresRuntimeValues: ["productGid"],
      purpose:
        "Create the Bi-weekly and Weekly variants with exact locked prices and capacity metadata.",
      variables: {
        productId: existing?.productGid ?? "${productGid}",
        variants: [
          variantInput({
            optionValue: "Bi-weekly",
            sku: "MMG-KS-BIWEEKLY",
            price: "24.95",
            planCode: "biweekly",
            packages: 2,
            assets: 4,
          }),
          variantInput({
            optionValue: "Weekly",
            sku: "MMG-KS-WEEKLY",
            price: "39.95",
            planCode: "weekly",
            packages: 4,
            assets: 8,
          }),
        ],
      },
    },
    {
      sequence: 5,
      code: "CREATE_SHARED_MONTHLY_SELLING_PLAN",
      mutation: "sellingPlanGroupCreate",
      destructive: true,
      requiresRuntimeValues: [
        "monthlyVariantGid",
        "biweeklyVariantGid",
        "weeklyVariantGid",
      ],
      purpose:
        "Create one shared monthly selling plan and associate all three cadence variants. Shopify bills monthly; Kairos owns package timing.",
      variables: {
        input: {
          name: "MMG Knowledge Subscription",
          merchantCode: "mmg-knowledge-subscription-monthly-billing",
          options: ["Billing frequency"],
          position: 1,
          sellingPlansToCreate: [
            {
              name: "Billed monthly",
              options: ["Monthly billing"],
              position: 1,
              category: "SUBSCRIPTION",
              billingPolicy: {
                recurring: { interval: "MONTH", intervalCount: 1 },
              },
              deliveryPolicy: {
                recurring: { interval: "MONTH", intervalCount: 1 },
              },
              inventoryPolicy: { reserve: "ON_SALE" },
              pricingPolicies: [],
            },
          ],
        },
        resources: {
          productIds: [],
          productVariantIds: [
            "${monthlyVariantGid}",
            "${biweeklyVariantGid}",
            "${weeklyVariantGid}",
          ],
        },
      },
    },
    {
      sequence: 6,
      code: "VERIFY_DRAFT_RUNTIME_MAPPING",
      mutation: null,
      destructive: false,
      requiresRuntimeValues: [],
      purpose:
        "Reload Shopify and verify exact title, handle, option, SKUs, prices, selling-plan association, nonshipping flags, metafields, and unique runtime GIDs while the product remains DRAFT.",
      variables: { query: "handle:mmg-knowledge-subscription" },
    },
  ];

  return {
    schemaVersion: "1.0.0",
    apiVersion: MMG_SHOPIFY_API_VERSION,
    shopDomain: shop,
    mode: input.mode,
    productHandle: "mmg-knowledge-subscription",
    productTitle: "MMG Knowledge Subscription™",
    keepDraft: true,
    operations,
  };
};

export const assertMMGShopifyRuntimeMapping = (
  mapping: MMGShopifyRuntimeMapping,
): MMGShopifyRuntimeMapping => {
  if (mapping.apiVersion !== MMG_SHOPIFY_API_VERSION) {
    throw new Error("MMG_SHOPIFY_RUNTIME_API_VERSION_MISMATCH");
  }
  shopDomain(mapping.shopDomain);
  const gids = [
    mapping.productGid,
    mapping.variantGids.monthly,
    mapping.variantGids.biweekly,
    mapping.variantGids.weekly,
    mapping.sellingPlanGroupGid,
    mapping.sellingPlanGid,
    mapping.onlineStorePublicationGid,
  ];
  if (gids.some((gid) => !gid || !gid.startsWith("gid://shopify/"))) {
    throw new Error("MMG_SHOPIFY_RUNTIME_MAPPING_INCOMPLETE");
  }
  if (new Set(gids).size !== gids.length) {
    throw new Error("MMG_SHOPIFY_RUNTIME_MAPPING_DUPLICATE_GID");
  }
  return mapping;
};
