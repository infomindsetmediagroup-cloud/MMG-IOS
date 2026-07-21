import type { MMGCommerceAlertChannel } from "./commerce-alert-routing.js";
import type { MMGCommerceOperationsEnvironment } from "./commerce-operations-control.js";

export const MMG_PRODUCTION_ADAPTER_VERSION = "1.0.0" as const;

export interface MMGCommerceProductionAdapterConfig {
  schemaVersion: typeof MMG_PRODUCTION_ADAPTER_VERSION;
  environment: MMGCommerceOperationsEnvironment;
  releaseId: string;
  runtimeOrigin: string;
  internalToken: string;
  requestTimeoutMs: number;
  routeProbePaths: string[];
  alertDestinations: Partial<Record<MMGCommerceAlertChannel, string>>;
}

export interface MMGCommerceProductionAdapterEnvironment {
  MMG_COMMERCE_ENVIRONMENT?: string;
  MMG_COMMERCE_RELEASE_ID?: string;
  MMG_COMMERCE_RUNTIME_ORIGIN?: string;
  MMG_COMMERCE_INTERNAL_TOKEN?: string;
  MMG_COMMERCE_REQUEST_TIMEOUT_MS?: string;
  MMG_COMMERCE_ROUTE_PROBE_PATHS?: string;
  MMG_COMMERCE_ALERT_DESTINATIONS?: string;
}

const identifier = (value: string | undefined, code: string): string => {
  const normalized = String(value ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(normalized)) throw new Error(code);
  return normalized;
};

const origin = (value: string | undefined, environment: MMGCommerceOperationsEnvironment): string => {
  const normalized = String(value ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("MMG_PRODUCTION_RUNTIME_ORIGIN_INVALID");
  }
  const localStaging =
    environment === "staging" &&
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localStaging) {
    throw new Error("MMG_PRODUCTION_RUNTIME_HTTPS_REQUIRED");
  }
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
};

const paths = (value: string | undefined): string[] => {
  const defaults = [
    "/api/internal/commerce/deployment",
    "/api/internal/commerce/operations",
    "/api/admin/commerce/operations",
    "/api/internal/commerce/staging-integration",
    "/api/internal/commerce/rehearsal",
    "/api/internal/commerce/rehearsal/adapter",
    "/api/internal/runtime-controls/control",
    "/api/internal/runtime-controls/rollout",
    "/api/knowledge-library/picker",
    "/api/knowledge-library/entitlement",
    "/api/internal/knowledge-library/delivery-windows/run",
    "/api/customer-portal/subscription",
    "/api/customer-portal/my-library",
    "/api/customer-portal/my-library/access",
    "/api/customer-portal/learning-profile",
    "/api/checkout/thank-you/subscription-handoff",
    "/api/shopify/webhooks/subscriptions",
  ];
  const entries = String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const resolved = entries.length > 0 ? entries : defaults;
  if (resolved.some((entry) => !/^\/api\/[a-z0-9/_-]+$/i.test(entry))) {
    throw new Error("MMG_PRODUCTION_ROUTE_PROBE_PATH_INVALID");
  }
  return [...new Set(resolved)];
};

const alertDestinations = (
  value: string | undefined,
): Partial<Record<MMGCommerceAlertChannel, string>> => {
  const allowed = new Set<MMGCommerceAlertChannel>([
    "on_call_pager",
    "operations_email",
    "operations_chat",
    "executive_briefing",
  ]);
  const result: Partial<Record<MMGCommerceAlertChannel, string>> = {};
  for (const entry of String(value ?? "").split(",")) {
    if (!entry.trim()) continue;
    const separator = entry.indexOf("=");
    if (separator < 1) throw new Error("MMG_PRODUCTION_ALERT_DESTINATION_INVALID");
    const channel = entry.slice(0, separator).trim() as MMGCommerceAlertChannel;
    const endpoint = entry.slice(separator + 1).trim();
    if (!allowed.has(channel)) throw new Error("MMG_PRODUCTION_ALERT_CHANNEL_INVALID");
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new Error("MMG_PRODUCTION_ALERT_DESTINATION_INVALID");
    }
    if (parsed.protocol !== "https:") throw new Error("MMG_PRODUCTION_ALERT_HTTPS_REQUIRED");
    result[channel] = parsed.toString();
  }
  return result;
};

export const parseMMGCommerceProductionAdapterConfig = (
  environmentValues: MMGCommerceProductionAdapterEnvironment,
): MMGCommerceProductionAdapterConfig => {
  const environment = String(environmentValues.MMG_COMMERCE_ENVIRONMENT ?? "").trim();
  if (environment !== "staging" && environment !== "production") {
    throw new Error("MMG_PRODUCTION_ENVIRONMENT_INVALID");
  }
  const timeout = Number(environmentValues.MMG_COMMERCE_REQUEST_TIMEOUT_MS ?? "8000");
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) {
    throw new Error("MMG_PRODUCTION_REQUEST_TIMEOUT_INVALID");
  }
  const internalToken = String(environmentValues.MMG_COMMERCE_INTERNAL_TOKEN ?? "").trim();
  if (internalToken.length < 32) throw new Error("MMG_PRODUCTION_INTERNAL_TOKEN_INVALID");
  return {
    schemaVersion: MMG_PRODUCTION_ADAPTER_VERSION,
    environment,
    releaseId: identifier(
      environmentValues.MMG_COMMERCE_RELEASE_ID,
      "MMG_PRODUCTION_RELEASE_ID_INVALID",
    ),
    runtimeOrigin: origin(environmentValues.MMG_COMMERCE_RUNTIME_ORIGIN, environment),
    internalToken,
    requestTimeoutMs: timeout,
    routeProbePaths: paths(environmentValues.MMG_COMMERCE_ROUTE_PROBE_PATHS),
    alertDestinations: alertDestinations(
      environmentValues.MMG_COMMERCE_ALERT_DESTINATIONS,
    ),
  };
};

export const redactMMGCommerceProductionAdapterConfig = (
  config: MMGCommerceProductionAdapterConfig,
) => ({
  schemaVersion: config.schemaVersion,
  environment: config.environment,
  releaseId: config.releaseId,
  runtimeOrigin: config.runtimeOrigin,
  requestTimeoutMs: config.requestTimeoutMs,
  routeProbePaths: [...config.routeProbePaths],
  alertChannels: Object.keys(config.alertDestinations).sort(),
  internalTokenConfigured: config.internalToken.length >= 32,
});
