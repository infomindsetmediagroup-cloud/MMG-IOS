export interface HealthEnvironment {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  KAIROS_RUNTIME_TOKEN?: string;
  SHOPIFY_SHOP_DOMAIN?: string;
  SHOPIFY_CLIENT_ID?: string;
  SHOPIFY_CLIENT_SECRET?: string;
}

export interface KairosHealthResponse {
  service: "kairos-runtime";
  status: "ready" | "degraded";
  configured: {
    providerCredential: boolean;
    providerModel: boolean;
    gatewayCredential: boolean;
    shopifyShopDomain: boolean;
    shopifyClientId: boolean;
    shopifyClientSecret: boolean;
    shopifyThemeInspection: boolean;
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
    shopifyShopDomain: hasValue(environment.SHOPIFY_SHOP_DOMAIN),
    shopifyClientId: hasValue(environment.SHOPIFY_CLIENT_ID),
    shopifyClientSecret: hasValue(environment.SHOPIFY_CLIENT_SECRET),
    shopifyThemeInspection:
      hasValue(environment.SHOPIFY_SHOP_DOMAIN) &&
      hasValue(environment.SHOPIFY_CLIENT_ID) &&
      hasValue(environment.SHOPIFY_CLIENT_SECRET),
  };

  return {
    service: "kairos-runtime",
    status:
      configured.providerCredential && configured.providerModel && configured.gatewayCredential
        ? "ready"
        : "degraded",
    configured,
    timestamp: now.toISOString(),
  };
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}
