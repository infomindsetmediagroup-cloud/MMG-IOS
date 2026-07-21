import type { MMGSubscriptionPlanCode } from "../knowledge-library/entitlements.js";

export const MMG_COMMERCE_DEPLOYMENT_VERSION = "1.1.0" as const;
export const MMG_SHOPIFY_API_VERSION = "2026-07" as const;

export type MMGCommerceDeploymentEnvironment = "staging" | "production";
export type MMGCommerceDeploymentAction =
  | "plan"
  | "execute"
  | "verify"
  | "publish"
  | "rollback";

export type MMGCommerceDeploymentPhase =
  | "preflight"
  | "application_scopes"
  | "database_migrations"
  | "runtime_routes"
  | "shopify_product"
  | "selling_plan"
  | "asset_registry"
  | "storefront_components"
  | "webhook_release"
  | "scheduler_and_dispatcher"
  | "end_to_end_verification"
  | "publication";

export type MMGCommerceDeploymentStepStatus =
  | "pending"
  | "blocked"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "rolled_back"
  | "not_applicable";

export interface MMGCommerceReleaseApproval {
  approvalId: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  approvedActions: MMGCommerceDeploymentAction[];
  approvedEnvironment: MMGCommerceDeploymentEnvironment;
  releaseCommitSha: string;
}

export interface MMGShopifyRuntimeMapping {
  shopDomain: string;
  apiVersion: typeof MMG_SHOPIFY_API_VERSION;
  productGid: string | null;
  variantGids: Record<MMGSubscriptionPlanCode, string | null>;
  sellingPlanGroupGid: string | null;
  sellingPlanGid: string | null;
  onlineStorePublicationGid: string | null;
  productStatus: "DRAFT" | "ACTIVE" | "ARCHIVED" | null;
  verifiedAt: string | null;
}

export interface MMGCommerceE2EEvidence {
  runId: string;
  completedAt: string;
  environment: MMGCommerceDeploymentEnvironment;
  checks: Record<string, "passed" | "failed" | "not_run">;
  testOrderIdHash: string | null;
  testCustomerReferenceHash: string | null;
}

export interface MMGCommerceDeploymentProbe {
  canonicalShopDomain: string;
  apiVersion: string;
  grantedScopes: string[];
  appliedMigrations: string[];
  routedEndpoints: string[];
  runtimeMapping: MMGShopifyRuntimeMapping | null;
  verifiedSelectableAssetCount: number;
  portalComponents: string[];
  webhookTopics: string[];
  schedulerActive: boolean;
  dispatcherActive: boolean;
  storageSignerActive: boolean;
  stagingRehearsalPassed: boolean;
  e2eEvidence: MMGCommerceE2EEvidence | null;
}

export interface MMGCommerceDeploymentStep {
  phase: MMGCommerceDeploymentPhase;
  status: MMGCommerceDeploymentStepStatus;
  destructive: boolean;
  requiresApproval: boolean;
  reasonCodes: string[];
  summary: string;
}

export interface MMGCommerceDeploymentPlan {
  schemaVersion: typeof MMG_COMMERCE_DEPLOYMENT_VERSION;
  releaseId: string;
  environment: MMGCommerceDeploymentEnvironment;
  releaseCommitSha: string;
  generatedAt: string;
  canonicalShopDomain: string;
  publishIncluded: boolean;
  steps: MMGCommerceDeploymentStep[];
  blockers: string[];
  executable: boolean;
}

export const MMG_REQUIRED_PRODUCTION_SCOPES = Object.freeze([
  "read_products",
  "write_products",
  "read_publications",
  "write_publications",
  "read_themes",
  "write_themes",
  "read_own_subscription_contracts",
  "write_own_subscription_contracts",
]);

export const MMG_REQUIRED_MIGRATIONS = Object.freeze([
  "20260720_001_mmg_knowledge_entitlements",
  "20260720_002_mmg_delivery_window_controller",
  "20260720_003_mmg_thank_you_first_title_handoff",
  "20260720_004_mmg_my_library_delivery",
  "20260720_005_mmg_shopify_subscription_reconciliation",
  "20260720_006_mmg_recommendation_curation_ranking",
  "20260720_007_mmg_live_commerce_deployment_control",
  "20260720_008_mmg_commerce_operations_control",
  "20260720_009_mmg_commerce_operations_integrity",
  "20260721_010_mmg_production_adapters_staging_rehearsal",
]);

export const MMG_REQUIRED_RUNTIME_ENDPOINTS = Object.freeze([
  "/api/knowledge-library/picker",
  "/api/knowledge-library/entitlement",
  "/api/internal/knowledge-library/delivery-windows/run",
  "/api/customer-portal/subscription",
  "/api/customer-portal/my-library",
  "/api/customer-portal/my-library/access",
  "/api/customer-portal/learning-profile",
  "/api/checkout/thank-you/subscription-handoff",
  "/api/shopify/webhooks/subscriptions",
  "/api/internal/commerce/deployment",
  "/api/internal/commerce/operations",
  "/api/admin/commerce/operations",
  "/api/internal/commerce/rehearsal",
  "/api/internal/commerce/rehearsal/adapter",
  "/api/internal/runtime-controls/control",
  "/api/internal/runtime-controls/rollout",
]);

export const MMG_REQUIRED_WEBHOOK_TOPICS = Object.freeze([
  "subscription_contracts/create",
  "subscription_contracts/update",
  "subscription_billing_attempts/success",
  "subscription_billing_attempts/failure",
  "subscription_billing_attempts/challenged",
]);

export const MMG_REQUIRED_PORTAL_COMPONENTS = Object.freeze([
  "mmg-customer-portal-subscription-dashboard",
  "mmg-my-library",
  "mmg-learning-profile",
]);

const identifier = (value: string, code: string): string => {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(normalized)) throw new Error(code);
  return normalized;
};

const validShop = (value: string): string => {
  const shop = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("MMG_DEPLOYMENT_SHOP_DOMAIN_INVALID");
  }
  return shop;
};

const missing = (required: readonly string[], actual: readonly string[]): string[] => {
  const actualSet = new Set(actual);
  return required.filter((value) => !actualSet.has(value));
};

const runtimeMappingComplete = (mapping: MMGShopifyRuntimeMapping | null): boolean =>
  Boolean(
    mapping?.productGid &&
      mapping.variantGids.monthly &&
      mapping.variantGids.biweekly &&
      mapping.variantGids.weekly &&
      mapping.sellingPlanGroupGid &&
      mapping.sellingPlanGid &&
      mapping.onlineStorePublicationGid,
  );

const e2ePassed = (evidence: MMGCommerceE2EEvidence | null): boolean =>
  Boolean(
    evidence &&
      Object.keys(evidence.checks).length > 0 &&
      Object.values(evidence.checks).every((status) => status === "passed"),
  );

const step = (
  phase: MMGCommerceDeploymentPhase,
  ready: boolean,
  summary: string,
  reasonCodes: string[],
  options: { destructive?: boolean; requiresApproval?: boolean } = {},
): MMGCommerceDeploymentStep => ({
  phase,
  status: ready ? "completed" : reasonCodes.length ? "blocked" : "ready",
  destructive: options.destructive ?? false,
  requiresApproval: options.requiresApproval ?? false,
  reasonCodes,
  summary,
});

export const buildMMGCommerceDeploymentPlan = (input: {
  releaseId: string;
  environment: MMGCommerceDeploymentEnvironment;
  releaseCommitSha: string;
  generatedAt: Date;
  probe: MMGCommerceDeploymentProbe;
  includePublication?: boolean;
}): MMGCommerceDeploymentPlan => {
  const releaseId = identifier(input.releaseId, "MMG_DEPLOYMENT_RELEASE_ID_INVALID");
  const releaseCommitSha = input.releaseCommitSha.trim();
  if (!/^[a-f0-9]{40}$/.test(releaseCommitSha)) {
    throw new Error("MMG_DEPLOYMENT_COMMIT_SHA_INVALID");
  }
  const canonicalShopDomain = validShop(input.probe.canonicalShopDomain);
  if (input.probe.apiVersion !== MMG_SHOPIFY_API_VERSION) {
    throw new Error("MMG_DEPLOYMENT_SHOPIFY_API_VERSION_MISMATCH");
  }

  const scopeBlockers = missing(MMG_REQUIRED_PRODUCTION_SCOPES, input.probe.grantedScopes);
  const migrationBlockers = missing(MMG_REQUIRED_MIGRATIONS, input.probe.appliedMigrations);
  const routeBlockers = missing(MMG_REQUIRED_RUNTIME_ENDPOINTS, input.probe.routedEndpoints);
  const webhookBlockers = missing(MMG_REQUIRED_WEBHOOK_TOPICS, input.probe.webhookTopics);
  const componentBlockers = missing(MMG_REQUIRED_PORTAL_COMPONENTS, input.probe.portalComponents);
  const mappingReady = runtimeMappingComplete(input.probe.runtimeMapping);
  const operationalReady = input.probe.schedulerActive && input.probe.dispatcherActive;
  const assetsReady = input.probe.verifiedSelectableAssetCount >= 2;
  const evidenceReady = e2ePassed(input.probe.e2eEvidence);
  const rehearsalReady = input.probe.stagingRehearsalPassed;
  const publishIncluded = input.includePublication === true;
  const publicationReady =
    input.probe.runtimeMapping?.productStatus === "ACTIVE" &&
    evidenceReady &&
    rehearsalReady;

  const steps: MMGCommerceDeploymentStep[] = [
    step(
      "preflight",
      true,
      "Release identity, canonical shop, API version, and contract inputs are valid.",
      [],
    ),
    step(
      "application_scopes",
      scopeBlockers.length === 0,
      "The Shopify app has the product, publication, theme, and protected subscription scopes required by the commerce stack.",
      scopeBlockers.map((scope) => `MISSING_SCOPE:${scope}`),
      { requiresApproval: input.environment === "production" },
    ),
    step(
      "database_migrations",
      migrationBlockers.length === 0,
      "Commerce migrations 001 through 010 are applied in order.",
      migrationBlockers.map((migration) => `MISSING_MIGRATION:${migration}`),
      { destructive: true, requiresApproval: input.environment === "production" },
    ),
    step(
      "runtime_routes",
      routeBlockers.length === 0,
      "All private, webhook, Customer Portal, deployment, operations, rehearsal, and runtime-control routes are available through the deployed Kairos runtime.",
      routeBlockers.map((route) => `MISSING_ROUTE:${route}`),
    ),
    step(
      "shopify_product",
      Boolean(input.probe.runtimeMapping?.productGid),
      "The canonical MMG Knowledge Subscription product and three cadence variants are provisioned as a draft subscription-only product.",
      input.probe.runtimeMapping?.productGid ? [] : ["SHOPIFY_PRODUCT_NOT_PROVISIONED"],
      { destructive: true, requiresApproval: input.environment === "production" },
    ),
    step(
      "selling_plan",
      mappingReady,
      "The shared monthly selling-plan group is attached to Monthly, Bi-weekly, and Weekly variants and runtime GIDs are verified.",
      mappingReady ? [] : ["SHOPIFY_RUNTIME_MAPPING_INCOMPLETE"],
      { destructive: true, requiresApproval: input.environment === "production" },
    ),
    step(
      "asset_registry",
      assetsReady,
      "At least two digital assets pass selection, media, delivery-package, ownership, and secure-file release gates.",
      assetsReady ? [] : ["INSUFFICIENT_VERIFIED_SELECTABLE_ASSETS"],
    ),
    step(
      "storefront_components",
      componentBlockers.length === 0,
      "Subscription Dashboard, My Library, and learning-profile modules are installed additively in the Customer Portal.",
      componentBlockers.map((component) => `MISSING_PORTAL_COMPONENT:${component}`),
      { destructive: true, requiresApproval: input.environment === "production" },
    ),
    step(
      "webhook_release",
      webhookBlockers.length === 0,
      "App-specific subscription webhooks are released on Shopify API version 2026-07.",
      webhookBlockers.map((topic) => `MISSING_WEBHOOK_TOPIC:${topic}`),
      { destructive: true, requiresApproval: input.environment === "production" },
    ),
    step(
      "scheduler_and_dispatcher",
      operationalReady && input.probe.storageSignerActive,
      "The delivery-window scheduler, idempotent dispatcher, acknowledgement path, operations monitoring, and secure storage signer are active.",
      [
        ...(input.probe.schedulerActive ? [] : ["DELIVERY_SCHEDULER_INACTIVE"]),
        ...(input.probe.dispatcherActive ? [] : ["DELIVERY_DISPATCHER_INACTIVE"]),
        ...(input.probe.storageSignerActive ? [] : ["STORAGE_SIGNER_INACTIVE"]),
      ],
      { destructive: true, requiresApproval: input.environment === "production" },
    ),
    step(
      "end_to_end_verification",
      evidenceReady,
      "A controlled checkout-to-My-Library run passed every required customer, billing, entitlement, curation, delivery, and access check.",
      evidenceReady ? [] : ["END_TO_END_EVIDENCE_NOT_PASSED"],
    ),
    publishIncluded
      ? step(
          "publication",
          publicationReady,
          "The product is ACTIVE and published only after fresh end-to-end evidence and a release-bound controlled staging rehearsal pass.",
          [
            ...(input.probe.runtimeMapping?.productStatus === "ACTIVE"
              ? []
              : ["PUBLICATION_NOT_COMPLETED"]),
            ...(evidenceReady ? [] : ["END_TO_END_EVIDENCE_NOT_PASSED"]),
            ...(rehearsalReady ? [] : ["STAGING_REHEARSAL_NOT_PASSED"]),
          ],
          { destructive: true, requiresApproval: true },
        )
      : {
          phase: "publication",
          status: "not_applicable",
          destructive: true,
          requiresApproval: true,
          reasonCodes: [],
          summary:
            "Publication is intentionally excluded from this deployment plan and remains a separate executive-approved action.",
        },
  ];

  const blockers = steps
    .filter((entry) => entry.status === "blocked")
    .flatMap((entry) => entry.reasonCodes);

  return {
    schemaVersion: MMG_COMMERCE_DEPLOYMENT_VERSION,
    releaseId,
    environment: input.environment,
    releaseCommitSha,
    generatedAt: input.generatedAt.toISOString(),
    canonicalShopDomain,
    publishIncluded,
    steps,
    blockers,
    executable:
      blockers.length === 0 &&
      (!publishIncluded || (evidenceReady && rehearsalReady)),
  };
};

export const assertMMGCommerceReleaseApproval = (input: {
  approval: MMGCommerceReleaseApproval | null;
  environment: MMGCommerceDeploymentEnvironment;
  action: MMGCommerceDeploymentAction;
  releaseCommitSha: string;
  now: Date;
}): MMGCommerceReleaseApproval => {
  const approval = input.approval;
  if (!approval) throw new Error("MMG_DEPLOYMENT_APPROVAL_REQUIRED");
  if (approval.approvedEnvironment !== input.environment) {
    throw new Error("MMG_DEPLOYMENT_APPROVAL_ENVIRONMENT_MISMATCH");
  }
  if (!approval.approvedActions.includes(input.action)) {
    throw new Error("MMG_DEPLOYMENT_ACTION_NOT_APPROVED");
  }
  if (approval.releaseCommitSha !== input.releaseCommitSha) {
    throw new Error("MMG_DEPLOYMENT_APPROVAL_COMMIT_MISMATCH");
  }
  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt)) {
    throw new Error("MMG_DEPLOYMENT_APPROVAL_TIME_INVALID");
  }
  if (input.now.getTime() < approvedAt || input.now.getTime() >= expiresAt) {
    throw new Error("MMG_DEPLOYMENT_APPROVAL_EXPIRED");
  }
  return approval;
};
