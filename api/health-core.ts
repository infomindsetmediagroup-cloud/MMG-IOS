export interface HealthEnvironment {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  KAIROS_RUNTIME_TOKEN?: string;
  SHOPIFY_STORE_DOMAIN?: string;
  SHOPIFY_ADMIN_ACCESS_TOKEN?: string;
}

export interface KairosHealthResponse {
  service: "kairos-runtime";
  status: "ready" | "degraded";
  configured: {
    providerCredential: boolean;
    providerModel: boolean;
    gatewayCredential: boolean;
  };
  capabilities: {
    shopifyHomepageAudit: boolean;
  };
  timestamp: string;
}

export function buildHealthResponse(
  environment: HealthEnvironment,
  now: Date = new Date(),
): KairosHealthResponse {
  const configured = {
    providerCredential: hasValue(environment.OPENAI_API_KEY),
    providerModel: hasValue(environment.OPENAI_MODEL),
    gatewayCredential: hasValue(environment.KAIROS_RUNTIME_TOKEN),
  };

  return {
    service: "kairos-runtime",
    status: Object.values(configured).every(Boolean) ? "ready" : "degraded",
    configured,
    capabilities: {
      shopifyHomepageAudit:
        hasValue(environment.SHOPIFY_STORE_DOMAIN) &&
        hasValue(environment.SHOPIFY_ADMIN_ACCESS_TOKEN),
    },
    timestamp: now.toISOString(),
  };
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}
