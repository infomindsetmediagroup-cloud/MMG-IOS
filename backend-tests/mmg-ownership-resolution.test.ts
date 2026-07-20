import { describe, expect, it } from "vitest";
import {
  buildMMGOwnershipSnapshot,
  isMMGOwnershipGrantActive,
  resolveMMGOwnedAssetIds,
  type MMGOwnershipGrantRecord,
} from "../server/knowledge-library/ownership.js";

const grant = (
  overrides: Partial<MMGOwnershipGrantRecord> = {},
): MMGOwnershipGrantRecord => ({
  id: "grant-1",
  customerId: "customer-1",
  assetId: "asset-1",
  source: "one_time_purchase",
  sourceReference: "order-1",
  status: "active",
  grantedAt: "2026-07-01T00:00:00.000Z",
  revokedAt: null,
  ...overrides,
});

const asOf = new Date("2026-07-20T00:00:00.000Z");

describe("MMG ownership resolution", () => {
  it("recognizes active non-revoked grants", () => {
    expect(isMMGOwnershipGrantActive(grant(), asOf)).toBe(true);
    expect(isMMGOwnershipGrantActive(grant({ status: "pending" }), asOf)).toBe(
      false,
    );
    expect(isMMGOwnershipGrantActive(grant({ status: "revoked" }), asOf)).toBe(
      false,
    );
    expect(
      isMMGOwnershipGrantActive(
        grant({ revokedAt: "2026-07-19T00:00:00.000Z" }),
        asOf,
      ),
    ).toBe(false);
    expect(
      isMMGOwnershipGrantActive(
        grant({ grantedAt: "2026-07-21T00:00:00.000Z" }),
        asOf,
      ),
    ).toBe(false);
  });

  it("supports every approved ownership source", () => {
    const sources: MMGOwnershipGrantRecord["source"][] = [
      "one_time_purchase",
      "subscription_delivery",
      "bonus",
      "administrative",
    ];
    const snapshot = buildMMGOwnershipSnapshot({
      customerId: "customer-1",
      asOf,
      grants: sources.map((source, index) =>
        grant({
          id: `grant-${index}`,
          assetId: `asset-${index}`,
          source,
          sourceReference: `source-${index}`,
        }),
      ),
    });

    expect(snapshot.totalOwnedAssets).toBe(4);
    expect(snapshot.assets.flatMap((asset) => asset.sources).sort()).toEqual(
      [...sources].sort(),
    );
  });

  it("deduplicates multiple active grant records into one customer-facing asset", () => {
    const snapshot = buildMMGOwnershipSnapshot({
      customerId: "customer-1",
      asOf,
      grants: [
        grant({ id: "grant-1", source: "one_time_purchase" }),
        grant({
          id: "grant-2",
          source: "bonus",
          sourceReference: "bonus-1",
          grantedAt: "2026-07-05T00:00:00.000Z",
        }),
      ],
    });

    expect(snapshot.totalOwnedAssets).toBe(1);
    expect(snapshot.ownedAssetIds).toEqual(["asset-1"]);
    expect(snapshot.assets[0]?.activeGrantIds).toEqual(["grant-1", "grant-2"]);
    expect(snapshot.assets[0]?.sources).toEqual(["bonus", "one_time_purchase"]);
    expect(snapshot.assets[0]?.firstGrantedAt).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(snapshot.assets[0]?.latestGrantedAt).toBe(
      "2026-07-05T00:00:00.000Z",
    );
  });

  it("ignores grants belonging to another customer", () => {
    const snapshot = buildMMGOwnershipSnapshot({
      customerId: "customer-1",
      asOf,
      grants: [grant(), grant({ id: "other", customerId: "customer-2" })],
    });

    expect(snapshot.totalOwnedAssets).toBe(1);
  });

  it("returns the canonical owned-asset set used by picker exclusion", () => {
    const owned = resolveMMGOwnedAssetIds({
      customerId: "customer-1",
      asOf,
      grants: [grant(), grant({ id: "grant-2", assetId: "asset-2" })],
    });

    expect(owned.has("asset-1")).toBe(true);
    expect(owned.has("asset-2")).toBe(true);
    expect(owned.has("asset-3")).toBe(false);
  });
});
