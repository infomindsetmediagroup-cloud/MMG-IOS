import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): string =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

const contract = JSON.parse(
  read("registry/customer-portal/mmg-my-library-delivery-contract-v1.json"),
) as {
  contract_id: string;
  version: string;
  status: string;
  canonical_surface: Record<string, unknown>;
  endpoint_contract: {
    library_endpoint: Record<string, unknown>;
    access_endpoint: Record<string, unknown>;
  };
  identity_contract: Record<string, unknown>;
  delivery_contract: Record<string, unknown>;
  secure_access_contract: Record<string, unknown>;
  privacy_contract: string[];
  release_gates: string[];
  integration_sequence: Record<string, unknown>;
};

const migration = read(
  "database/migrations/20260720_004_mmg_my_library_delivery.sql",
);
const liquid = read("shopify/snippets/mmg-my-library.liquid");
const javascript = read("shopify/assets/mmg-my-library.js");
const stylesheet = read("shopify/assets/mmg-my-library.css");
const service = read("server/customer-portal/my-library-service.ts");
const repository = read("server/customer-portal/my-library-repository.ts");
const http = read("server/customer-portal/my-library-http.ts");

describe("MMG My Library delivery interface contract", () => {
  it("is the approved staged My Library authority", () => {
    expect(contract.contract_id).toBe("mmg-my-library-delivery-interface-v1");
    expect(contract.version).toBe("1.0.0");
    expect(contract.status).toBe("approved_for_staging");
    expect(contract.canonical_surface).toEqual(
      expect.objectContaining({
        route: "/pages/customer-portal#my-library",
        storefront_component: "shopify/snippets/mmg-my-library.liquid",
        additive_to_existing_customer_portal: true,
      }),
    );
  });

  it("locks authenticated private GET and protected POST endpoints", () => {
    expect(contract.endpoint_contract.library_endpoint).toEqual(
      expect.objectContaining({
        method: "GET",
        path: "/api/customer-portal/my-library",
        cache_control: "no-store, private",
      }),
    );
    expect(contract.endpoint_contract.access_endpoint).toEqual(
      expect.objectContaining({
        method: "POST",
        path: "/api/customer-portal/my-library/access",
        same_origin_required: true,
        csrf_required: true,
        maximum_body_bytes: 4096,
      }),
    );
    expect(http).toContain("validateSameOrigin");
    expect(http).toContain("validateCsrf");
    expect(http).toContain("MAX_BODY_BYTES = 4096");
    expect(http).toContain('"Cache-Control": "no-store, private"');
  });

  it("uses one item per asset ID and durable active ownership", () => {
    expect(contract.identity_contract).toEqual(
      expect.objectContaining({
        canonical_asset_key: "mmg.asset_id",
        customer_facing_uniqueness: "one item per asset_id",
        browser_ownership_authoritative: false,
      }),
    );
    expect(repository).toContain("mmg_ownership_grants");
    expect(repository).toContain("ownership.status = 'active'");
    expect(repository).toContain("ownership.revoked_at IS NULL");
  });

  it("creates secure delivery-file and access-audit persistence", () => {
    expect(contract.delivery_contract).toEqual(
      expect.objectContaining({
        delivery_file_table: "mmg_asset_delivery_files",
        access_request_table: "mmg_library_access_requests",
        access_event_table: "mmg_library_access_events",
      }),
    );
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS mmg_asset_delivery_files");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS mmg_library_access_requests");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS mmg_library_access_events");
    expect(migration).toContain("mmg_asset_delivery_files_primary_active_idx");
    expect(migration).not.toMatch(/signed_url\s+text/i);
    expect(migration).not.toMatch(/public_url\s+text/i);
  });

  it("issues short-lived HTTPS access without exposing object keys", () => {
    expect(contract.secure_access_contract).toEqual(
      expect.objectContaining({
        default_ttl_seconds: 300,
        minimum_ttl_seconds: 60,
        maximum_ttl_seconds: 600,
        https_required: true,
        permanent_storage_urls_exposed: false,
        storage_object_keys_exposed: false,
        request_id_required: true,
      }),
    );
    expect(service).toContain('parsed.protocol === "https:"');
    expect(service).toContain("Math.min(600");
    expect(service).toContain("Math.max(60");
    expect(service).toContain('disposition: accessKind === "read" ? "inline" : "attachment"');
  });

  it("renders a safe responsive Customer Portal interface", () => {
    expect(liquid).toContain("<mmg-my-library");
    expect(liquid).toContain("data-mmg-library-card-template");
    expect(liquid).toContain("data-csrf-token");
    expect(javascript).not.toContain("innerHTML");
    expect(javascript).toContain("textContent");
    expect(javascript).toContain("window.location.assign");
    expect(stylesheet).not.toContain("100vw");
    expect(stylesheet).not.toContain("#MainContent");
    expect(stylesheet).toContain("object-fit: contain");
    expect(stylesheet).toContain("prefers-reduced-motion");
  });

  it("keeps private implementation data outside customer-facing output", () => {
    const privacy = contract.privacy_contract.join(" ");
    expect(privacy).toContain("Do not expose customer IDs");
    expect(privacy).toContain("Do not expose ownership-grant IDs");
    expect(privacy).toContain("Do not expose storage providers or object keys");
    expect(liquid).not.toContain("storage_object_key");
    expect(javascript).not.toContain("storageObjectKey");
    expect(javascript).not.toContain("customerId");
  });

  it("locks webhook reconciliation as the next dependency", () => {
    expect(contract.integration_sequence).toEqual({
      previous_component: "Thank-you page first-title handoff",
      current_component: "My Library delivery interface",
      next_component: "Shopify subscription webhook reconciliation",
      subsequent_components: [
        "Kairos recommendation and curation ranking",
        "Live Shopify provisioning and end-to-end deployment",
      ],
    });
    expect(contract.release_gates.length).toBeGreaterThanOrEqual(10);
  });
});
