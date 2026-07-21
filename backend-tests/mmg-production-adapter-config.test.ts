import { describe, expect, it } from "vitest";
import {
  parseMMGCommerceProductionAdapterConfig,
  redactMMGCommerceProductionAdapterConfig,
} from "../server/operations/production-adapter-config.js";

describe("MMG production adapter configuration", () => {
  it("parses staging configuration and returns only redacted inspection data", () => {
    const config = parseMMGCommerceProductionAdapterConfig({
      MMG_COMMERCE_ENVIRONMENT: "staging",
      MMG_COMMERCE_RELEASE_ID: "release-staging-12345678",
      MMG_COMMERCE_RUNTIME_ORIGIN: "https://staging.example.com",
      MMG_COMMERCE_INTERNAL_TOKEN: "x".repeat(48),
      MMG_COMMERCE_ALERT_DESTINATIONS:
        "operations_chat=https://alerts.example.com/chat",
    });
    expect(config.routeProbePaths).toContain("/api/internal/commerce/operations");
    expect(config.alertDestinations.operations_chat).toBe(
      "https://alerts.example.com/chat",
    );
    const redacted = redactMMGCommerceProductionAdapterConfig(config);
    expect(redacted).not.toHaveProperty("internalToken");
    expect(redacted.internalTokenConfigured).toBe(true);
  });

  it("requires HTTPS for production runtime and alert destinations", () => {
    expect(() =>
      parseMMGCommerceProductionAdapterConfig({
        MMG_COMMERCE_ENVIRONMENT: "production",
        MMG_COMMERCE_RELEASE_ID: "release-production-12345678",
        MMG_COMMERCE_RUNTIME_ORIGIN: "http://runtime.example.com",
        MMG_COMMERCE_INTERNAL_TOKEN: "x".repeat(48),
      }),
    ).toThrow("MMG_PRODUCTION_RUNTIME_HTTPS_REQUIRED");

    expect(() =>
      parseMMGCommerceProductionAdapterConfig({
        MMG_COMMERCE_ENVIRONMENT: "staging",
        MMG_COMMERCE_RELEASE_ID: "release-staging-12345678",
        MMG_COMMERCE_RUNTIME_ORIGIN: "https://runtime.example.com",
        MMG_COMMERCE_INTERNAL_TOKEN: "x".repeat(48),
        MMG_COMMERCE_ALERT_DESTINATIONS:
          "operations_chat=http://alerts.example.com/chat",
      }),
    ).toThrow("MMG_PRODUCTION_ALERT_HTTPS_REQUIRED");
  });

  it("permits local HTTP only for staging development", () => {
    const config = parseMMGCommerceProductionAdapterConfig({
      MMG_COMMERCE_ENVIRONMENT: "staging",
      MMG_COMMERCE_RELEASE_ID: "release-staging-12345678",
      MMG_COMMERCE_RUNTIME_ORIGIN: "http://localhost:8787",
      MMG_COMMERCE_INTERNAL_TOKEN: "x".repeat(48),
    });
    expect(config.runtimeOrigin).toBe("http://localhost:8787");
  });
});
