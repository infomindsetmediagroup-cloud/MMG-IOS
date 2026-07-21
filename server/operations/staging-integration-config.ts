import {
  parseMMGCommerceProductionAdapterConfig,
  type MMGCommerceProductionAdapterConfig,
  type MMGCommerceProductionAdapterEnvironment,
} from "./production-adapter-config.js";
import type { MMGStagingIntegrationTokens } from "./staging-integration-runtime.js";

export interface MMGStagingIntegrationEnvironment
  extends MMGCommerceProductionAdapterEnvironment {
  MMG_COMMERCE_STAGING_OPERATIONS_TOKEN?: string;
  MMG_COMMERCE_STAGING_REHEARSAL_TOKEN?: string;
  MMG_COMMERCE_STAGING_REHEARSAL_ADAPTER_TOKEN?: string;
  MMG_COMMERCE_STAGING_RUNTIME_CONTROL_TOKEN?: string;
  MMG_COMMERCE_STAGING_INTEGRATION_TOKEN?: string;
}

export interface MMGStagingIntegrationRuntimeConfig {
  config: MMGCommerceProductionAdapterConfig;
  tokens: MMGStagingIntegrationTokens;
}

const secret = (value: string | undefined, code: string): string => {
  const normalized = String(value ?? "").trim();
  if (normalized.length < 32) throw new Error(code);
  return normalized;
};

export const parseMMGStagingIntegrationTokens = (
  environment: MMGStagingIntegrationEnvironment,
): MMGStagingIntegrationTokens => {
  const tokens = {
    operations: secret(
      environment.MMG_COMMERCE_STAGING_OPERATIONS_TOKEN,
      "MMG_STAGING_OPERATIONS_TOKEN_INVALID",
    ),
    rehearsal: secret(
      environment.MMG_COMMERCE_STAGING_REHEARSAL_TOKEN,
      "MMG_STAGING_REHEARSAL_TOKEN_INVALID",
    ),
    rehearsalAdapter: secret(
      environment.MMG_COMMERCE_STAGING_REHEARSAL_ADAPTER_TOKEN,
      "MMG_STAGING_REHEARSAL_ADAPTER_TOKEN_INVALID",
    ),
    runtimeControl: secret(
      environment.MMG_COMMERCE_STAGING_RUNTIME_CONTROL_TOKEN,
      "MMG_STAGING_RUNTIME_CONTROL_TOKEN_INVALID",
    ),
    integration: secret(
      environment.MMG_COMMERCE_STAGING_INTEGRATION_TOKEN,
      "MMG_STAGING_INTEGRATION_TOKEN_INVALID",
    ),
  };
  if (new Set(Object.values(tokens)).size !== 5) {
    throw new Error("MMG_STAGING_INTEGRATION_TOKENS_MUST_BE_DISTINCT");
  }
  return tokens;
};

export const parseMMGStagingIntegrationRuntimeConfig = (
  environment: MMGStagingIntegrationEnvironment,
): MMGStagingIntegrationRuntimeConfig => {
  const tokens = parseMMGStagingIntegrationTokens(environment);
  const config = parseMMGCommerceProductionAdapterConfig({
    ...environment,
    MMG_COMMERCE_ENVIRONMENT: "staging",
    MMG_COMMERCE_INTERNAL_TOKEN: tokens.operations,
  });
  if (config.environment !== "staging") {
    throw new Error("MMG_STAGING_INTEGRATION_RUNTIME_STAGING_ONLY");
  }
  return { config, tokens };
};

export const redactMMGStagingIntegrationTokens = (
  tokens: MMGStagingIntegrationTokens,
) => ({
  operationsConfigured: tokens.operations.length >= 32,
  rehearsalConfigured: tokens.rehearsal.length >= 32,
  rehearsalAdapterConfigured: tokens.rehearsalAdapter.length >= 32,
  runtimeControlConfigured: tokens.runtimeControl.length >= 32,
  integrationConfigured: tokens.integration.length >= 32,
  distinctCredentials: new Set(Object.values(tokens)).size === 5,
});
