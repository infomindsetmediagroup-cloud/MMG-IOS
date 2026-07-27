import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const store = readFileSync("cloudflare/mmg-ios/src/kairos-runtime-project-store-v1.js", "utf8");
const gateway = readFileSync("cloudflare/mmg-ios/src/kairos-governance-effectiveness-verification-store-v1.js", "utf8");

describe("Kairos runtime project store", () => {
  it("provides authenticated collection, item, event, and export routes", () => {
    expect(store).toContain("/api\\/kairos\\/runtime\\/projects");
    expect(store).toContain("EVENT_ROUTE");
    expect(store).toContain("AUTH_REQUIRED");
    expect(store).toContain('operation: "export"');
  });

  it("persists bounded runtime records in the canonical Durable Object boundary", () => {
    expect(store).toContain('state.storage.get("kairos-runtime-projects:records")');
    expect(store).toContain('state.storage.put("kairos-runtime-projects:records"');
    expect(store).toContain("records.slice(-MAX_RECORDS)");
    expect(store).toContain('idFromName("mmg-production-project-registry")');
  });

  it("records creation and transitions without granting execution authority", () => {
    expect(store).toContain('type: "project_created"');
    expect(store).toContain("transitionKairosRuntimeProject");
    expect(store).toContain("deploymentExecutionIncluded: false");
    expect(store).toContain("commerceMutationIncluded: false");
    expect(store).toContain("externalPublicationIncluded: false");
  });

  it("is integrated through the canonical governance gateway", () => {
    expect(gateway).toContain("handleKairosRuntimeProjectAPI");
    expect(gateway).toContain("handleKairosRuntimeProjectObjectRequest");
    expect(gateway).toContain("X-Kairos-Runtime-Project");
    expect(gateway).toContain("KAIROS_RUNTIME_PROJECT_STORE_BUILD");
  });
});
