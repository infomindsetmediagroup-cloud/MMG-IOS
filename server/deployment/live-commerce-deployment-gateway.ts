import type {
  MMGCommerceDeploymentGateway,
} from "./live-commerce-deployment-service.js";
import type {
  MMGCommerceDeploymentEnvironment,
  MMGCommerceDeploymentPhase,
  MMGCommerceDeploymentProbe,
  MMGCommerceE2EEvidence,
  MMGCommerceReleaseApproval,
  MMGShopifyRuntimeMapping,
} from "./live-commerce-deployment.js";

export interface MMGApplicationReleaseAdapter {
  inspectScopes(): Promise<string[]>;
  releaseAppConfiguration(input: {
    environment: MMGCommerceDeploymentEnvironment;
    releaseCommitSha: string;
    includeScopes: boolean;
    includeWebhooks: boolean;
  }): Promise<{ grantedScopes: string[]; webhookTopics: string[]; versionId: string }>;
  rollbackAppConfiguration(input: {
    environment: MMGCommerceDeploymentEnvironment;
    releaseCommitSha: string;
  }): Promise<{ versionId: string }>;
  inspectWebhookTopics(): Promise<string[]>;
}

export interface MMGDatabaseMigrationAdapter {
  inspectAppliedMigrations(): Promise<string[]>;
  applyCommerceMigrations(input: {
    through: "20260720_007_mmg_live_commerce_deployment_control";
  }): Promise<{ applied: string[] }>;
}

export interface MMGRuntimeReleaseAdapter {
  inspectRoutedEndpoints(): Promise<string[]>;
  deployCommerceRoutes(input: {
    releaseCommitSha: string;
    environment: MMGCommerceDeploymentEnvironment;
  }): Promise<{ deploymentId: string; routedEndpoints: string[] }>;
  rollbackCommerceRoutes(input: {
    releaseCommitSha: string;
    environment: MMGCommerceDeploymentEnvironment;
  }): Promise<{ deploymentId: string }>;
}

export interface MMGShopifyProvisioningAdapter {
  inspectRuntimeMapping(): Promise<MMGShopifyRuntimeMapping | null>;
  provisionDraftProduct(input: {
    environment: MMGCommerceDeploymentEnvironment;
    releaseCommitSha: string;
  }): Promise<MMGShopifyRuntimeMapping>;
  provisionSellingPlan(input: {
    environment: MMGCommerceDeploymentEnvironment;
    releaseCommitSha: string;
    mapping: MMGShopifyRuntimeMapping;
  }): Promise<MMGShopifyRuntimeMapping>;
  activateAndPublish(input: {
    environment: MMGCommerceDeploymentEnvironment;
    releaseCommitSha: string;
    mapping: MMGShopifyRuntimeMapping;
  }): Promise<MMGShopifyRuntimeMapping>;
  returnToDraftOrUnpublish(input: {
    environment: MMGCommerceDeploymentEnvironment;
    releaseCommitSha: string;
    mapping: MMGShopifyRuntimeMapping;
  }): Promise<MMGShopifyRuntimeMapping>;
}

export interface MMGAssetReleaseAdapter {
  inspectVerifiedSelectableAssetCount(): Promise<number>;
  synchronizeAndVerifyAssets(): Promise<{ verifiedSelectableAssetCount: number }>;
}

export interface MMGStorefrontReleaseAdapter {
  inspectInstalledPortalComponents(): Promise<string[]>;
  installPortalComponents(input: {
    environment: MMGCommerceDeploymentEnvironment;
    releaseCommitSha: string;
  }): Promise<{ installedComponents: string[]; themeId: string }>;
  rollbackPortalComponents(input: {
    environment: MMGCommerceDeploymentEnvironment;
    releaseCommitSha: string;
  }): Promise<{ themeId: string }>;
}

export interface MMGCommerceOperationsAdapter {
  inspect(): Promise<{
    schedulerActive: boolean;
    dispatcherActive: boolean;
    storageSignerActive: boolean;
  }>;
  activate(): Promise<{
    schedulerActive: boolean;
    dispatcherActive: boolean;
    storageSignerActive: boolean;
  }>;
  deactivate(): Promise<void>;
}

export interface MMGCommerceVerificationAdapter {
  inspectLatestEvidence(input: {
    releaseId: string;
    environment: MMGCommerceDeploymentEnvironment;
  }): Promise<MMGCommerceE2EEvidence | null>;
  verify(input: {
    releaseId: string;
    environment: MMGCommerceDeploymentEnvironment;
    occurredAt: Date;
  }): Promise<MMGCommerceE2EEvidence>;
}

export interface MMGCompositeCommerceDeploymentDependencies {
  canonicalShopDomain: string;
  apiVersion: string;
  app: MMGApplicationReleaseAdapter;
  database: MMGDatabaseMigrationAdapter;
  runtime: MMGRuntimeReleaseAdapter;
  shopify: MMGShopifyProvisioningAdapter;
  assets: MMGAssetReleaseAdapter;
  storefront: MMGStorefrontReleaseAdapter;
  operations: MMGCommerceOperationsAdapter;
  verification: MMGCommerceVerificationAdapter;
}

const result = (
  resultValue: Record<string, unknown>,
  extra: {
    runtimeMapping?: MMGShopifyRuntimeMapping;
    e2eEvidence?: MMGCommerceE2EEvidence;
  } = {},
) => ({ status: "completed" as const, result: resultValue, ...extra });

export class MMGCompositeCommerceDeploymentGateway
  implements MMGCommerceDeploymentGateway
{
  readonly #dependencies: MMGCompositeCommerceDeploymentDependencies;

  constructor(dependencies: MMGCompositeCommerceDeploymentDependencies) {
    this.#dependencies = dependencies;
  }

  async probe(input: {
    releaseId: string;
    environment: MMGCommerceDeploymentEnvironment;
  }): Promise<MMGCommerceDeploymentProbe> {
    const [
      grantedScopes,
      appliedMigrations,
      routedEndpoints,
      runtimeMapping,
      verifiedSelectableAssetCount,
      portalComponents,
      webhookTopics,
      operations,
      e2eEvidence,
    ] = await Promise.all([
      this.#dependencies.app.inspectScopes(),
      this.#dependencies.database.inspectAppliedMigrations(),
      this.#dependencies.runtime.inspectRoutedEndpoints(),
      this.#dependencies.shopify.inspectRuntimeMapping(),
      this.#dependencies.assets.inspectVerifiedSelectableAssetCount(),
      this.#dependencies.storefront.inspectInstalledPortalComponents(),
      this.#dependencies.app.inspectWebhookTopics(),
      this.#dependencies.operations.inspect(),
      this.#dependencies.verification.inspectLatestEvidence(input),
    ]);
    return {
      canonicalShopDomain: this.#dependencies.canonicalShopDomain,
      apiVersion: this.#dependencies.apiVersion,
      grantedScopes,
      appliedMigrations,
      routedEndpoints,
      runtimeMapping,
      verifiedSelectableAssetCount,
      portalComponents,
      webhookTopics,
      ...operations,
      e2eEvidence,
    };
  }

  async applyPhase(input: {
    releaseId: string;
    environment: MMGCommerceDeploymentEnvironment;
    phase: MMGCommerceDeploymentPhase;
    releaseCommitSha: string;
    approval: MMGCommerceReleaseApproval | null;
    occurredAt: Date;
  }) {
    switch (input.phase) {
      case "preflight":
        return result({ verified: true });
      case "application_scopes": {
        const released = await this.#dependencies.app.releaseAppConfiguration({
          environment: input.environment,
          releaseCommitSha: input.releaseCommitSha,
          includeScopes: true,
          includeWebhooks: false,
        });
        return result(released);
      }
      case "database_migrations":
        return result(
          await this.#dependencies.database.applyCommerceMigrations({
            through: "20260720_007_mmg_live_commerce_deployment_control",
          }),
        );
      case "runtime_routes":
        return result(
          await this.#dependencies.runtime.deployCommerceRoutes({
            releaseCommitSha: input.releaseCommitSha,
            environment: input.environment,
          }),
        );
      case "shopify_product": {
        const mapping = await this.#dependencies.shopify.provisionDraftProduct({
          environment: input.environment,
          releaseCommitSha: input.releaseCommitSha,
        });
        return result({ productGid: mapping.productGid, productStatus: mapping.productStatus }, { runtimeMapping: mapping });
      }
      case "selling_plan": {
        const mapping = await this.#dependencies.shopify.inspectRuntimeMapping();
        if (!mapping) throw new Error("MMG_DEPLOYMENT_SHOPIFY_MAPPING_REQUIRED");
        const updated = await this.#dependencies.shopify.provisionSellingPlan({
          environment: input.environment,
          releaseCommitSha: input.releaseCommitSha,
          mapping,
        });
        return result({ sellingPlanGroupGid: updated.sellingPlanGroupGid }, { runtimeMapping: updated });
      }
      case "asset_registry":
        return result(await this.#dependencies.assets.synchronizeAndVerifyAssets());
      case "storefront_components":
        return result(
          await this.#dependencies.storefront.installPortalComponents({
            environment: input.environment,
            releaseCommitSha: input.releaseCommitSha,
          }),
        );
      case "webhook_release":
        return result(
          await this.#dependencies.app.releaseAppConfiguration({
            environment: input.environment,
            releaseCommitSha: input.releaseCommitSha,
            includeScopes: false,
            includeWebhooks: true,
          }),
        );
      case "scheduler_and_dispatcher":
        return result(await this.#dependencies.operations.activate());
      case "end_to_end_verification": {
        const evidence = await this.#dependencies.verification.verify({
          releaseId: input.releaseId,
          environment: input.environment,
          occurredAt: input.occurredAt,
        });
        return result({ runId: evidence.runId, checks: evidence.checks }, { e2eEvidence: evidence });
      }
      case "publication": {
        if (!input.approval) throw new Error("MMG_DEPLOYMENT_PUBLICATION_APPROVAL_REQUIRED");
        const mapping = await this.#dependencies.shopify.inspectRuntimeMapping();
        if (!mapping) throw new Error("MMG_DEPLOYMENT_SHOPIFY_MAPPING_REQUIRED");
        const published = await this.#dependencies.shopify.activateAndPublish({
          environment: input.environment,
          releaseCommitSha: input.releaseCommitSha,
          mapping,
        });
        return result({ productGid: published.productGid, productStatus: published.productStatus }, { runtimeMapping: published });
      }
    }
  }

  async rollbackPhase(input: {
    releaseId: string;
    environment: MMGCommerceDeploymentEnvironment;
    phase: MMGCommerceDeploymentPhase;
    releaseCommitSha: string;
    approval: MMGCommerceReleaseApproval | null;
    occurredAt: Date;
  }) {
    switch (input.phase) {
      case "publication":
      case "selling_plan":
      case "shopify_product": {
        const mapping = await this.#dependencies.shopify.inspectRuntimeMapping();
        if (!mapping) return { status: "not_applicable" as const, result: {} };
        const reverted = await this.#dependencies.shopify.returnToDraftOrUnpublish({
          environment: input.environment,
          releaseCommitSha: input.releaseCommitSha,
          mapping,
        });
        return { status: "rolled_back" as const, result: { productStatus: reverted.productStatus } };
      }
      case "scheduler_and_dispatcher":
        await this.#dependencies.operations.deactivate();
        return { status: "rolled_back" as const, result: { operationsActive: false } };
      case "webhook_release":
      case "application_scopes":
        return {
          status: "rolled_back" as const,
          result: await this.#dependencies.app.rollbackAppConfiguration({
            environment: input.environment,
            releaseCommitSha: input.releaseCommitSha,
          }),
        };
      case "runtime_routes":
        return {
          status: "rolled_back" as const,
          result: await this.#dependencies.runtime.rollbackCommerceRoutes({
            environment: input.environment,
            releaseCommitSha: input.releaseCommitSha,
          }),
        };
      case "storefront_components":
        return {
          status: "rolled_back" as const,
          result: await this.#dependencies.storefront.rollbackPortalComponents({
            environment: input.environment,
            releaseCommitSha: input.releaseCommitSha,
          }),
        };
      case "database_migrations":
        return {
          status: "not_applicable" as const,
          result: { policy: "forward_repair_migration_required" },
        };
      case "asset_registry":
      case "end_to_end_verification":
      case "preflight":
        return { status: "not_applicable" as const, result: {} };
    }
  }
}
