export interface HealthEnvironment {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  KAIROS_RUNTIME_TOKEN?: string;
}

export interface KairosHealthResponse {
  service: "kairos-runtime";
  status: "ready" | "degraded";
  configured: {
    providerCredential: boolean;
    providerModel: boolean;
    gatewayCredential: boolean;
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
    timestamp: now.toISOString(),
  };
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}
