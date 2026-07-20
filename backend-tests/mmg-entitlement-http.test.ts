import { describe, expect, it } from "vitest";
import { handleMMGEntitlementRequest } from "../server/knowledge-library/entitlement-http.js";
import type { MMGEntitlementCounterSnapshot } from "../server/knowledge-library/entitlements.js";
import type { MMGOwnershipSnapshot } from "../server/knowledge-library/ownership.js";
import type { MMGEntitlementOwnershipRepository } from "../server/knowledge-library/persistence.js";
import type { MMGPickerState } from "../server/knowledge-library/picker.js";
import type { MMGPickerPrincipal } from "../server/knowledge-library/picker-service.js";

const principal: MMGPickerPrincipal = {
  customerId: "customer-1",
  sessionId: "session-1",
};

const counter: MMGEntitlementCounterSnapshot = {
  schemaVersion: "1.0.0",
  plan: {
    code: "monthly",
    displayName: "Monthly",
    monthlyPrice: 14.95,
    packagesPerBillingCycle: 1,
    assetsPerPackage: 2,
    assetsPerBillingCycle: 2,
  },
  cycle: {
    id: "cycle-1",
    status: "active",
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-01T00:00:00.000Z",
    version: 1,
  },
  packages: { total: 1, opened: 1, confirmed: 0, remaining: 1 },
  assets: {
    totalUnits: 2,
    selectedUnits: 1,
    reservedUnits: 0,
    confirmedUnits: 0,
    deliveredUnits: 0,
    committedUnits: 1,
    remainingUnits: 1,
  },
  currentWindow: {
    id: "window-1",
    packageSequence: 1,
    type: "first_package",
    status: "open",
    totalUnits: 2,
    selectedUnits: 1,
    reservedUnits: 0,
    confirmedUnits: 0,
    remainingUnits: 1,
    targetAssetCount: 2,
    selectedAssetCount: 1,
    version: 2,
    opensAt: "2026-07-01T00:00:00.000Z",
    closesAt: "2026-07-03T00:00:00.000Z",
    confirmedAt: null,
  },
};

const ownership: MMGOwnershipSnapshot = {
  schemaVersion: "1.0.0",
  customerId: "customer-1",
  totalOwnedAssets: 3,
  ownedAssetIds: ["asset-1", "asset-2", "asset-3"],
  assets: [],
};

class Repository implements MMGEntitlementOwnershipRepository {
  counter: MMGEntitlementCounterSnapshot | null = counter;

  async load(): Promise<MMGPickerState | null> {
    return null;
  }

  async save(): Promise<"saved" | "version_conflict"> {
    return "saved";
  }

  async getEntitlementCounter(): Promise<MMGEntitlementCounterSnapshot | null> {
    return this.counter;
  }

  async getOwnershipSnapshot(): Promise<MMGOwnershipSnapshot> {
    return ownership;
  }
}

const dependencies = (
  repository: Repository,
  authenticated = true,
) => ({
  repository,
  authenticate: async () => (authenticated ? principal : null),
  now: () => new Date("2026-07-20T00:00:00.000Z"),
});

describe("MMG entitlement HTTP handler", () => {
  it("rejects unsupported methods", async () => {
    const response = await handleMMGEntitlementRequest(
      new Request("https://example.com/api/knowledge-library/entitlement", {
        method: "POST",
      }),
      dependencies(new Repository()),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("requires an authenticated server session", async () => {
    const response = await handleMMGEntitlementRequest(
      new Request("https://example.com/api/knowledge-library/entitlement"),
      dependencies(new Repository(), false),
    );
    const body = (await response.json()) as {
      ok: boolean;
      error: { code: string };
    };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("ENTITLEMENT_AUTHENTICATION_REQUIRED");
  });

  it("returns the authorized counter and ownership total as private no-store data", async () => {
    const response = await handleMMGEntitlementRequest(
      new Request("https://example.com/api/knowledge-library/entitlement"),
      dependencies(new Repository()),
    );
    const body = (await response.json()) as {
      ok: true;
      dashboard: {
        schemaVersion: string;
        counter: MMGEntitlementCounterSnapshot;
        ownership: { totalOwnedAssets: number };
      };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body.ok).toBe(true);
    expect(body.dashboard.schemaVersion).toBe("1.0.0");
    expect(body.dashboard.counter.assets.remainingUnits).toBe(1);
    expect(body.dashboard.ownership.totalOwnedAssets).toBe(3);
  });

  it("returns 404 when no active entitlement cycle exists", async () => {
    const repository = new Repository();
    repository.counter = null;

    const response = await handleMMGEntitlementRequest(
      new Request("https://example.com/api/knowledge-library/entitlement"),
      dependencies(repository),
    );
    const body = (await response.json()) as {
      ok: false;
      error: { code: string };
    };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("ENTITLEMENT_NOT_FOUND");
  });

  it("does not leak repository errors", async () => {
    const repository = new Repository();
    repository.getEntitlementCounter = async () => {
      throw new Error("database password and internal host");
    };

    const response = await handleMMGEntitlementRequest(
      new Request("https://example.com/api/knowledge-library/entitlement"),
      dependencies(repository),
    );
    const body = (await response.json()) as {
      ok: false;
      error: { code: string; message: string; retryable: boolean };
    };

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("ENTITLEMENT_INTERNAL_ERROR");
    expect(body.error.retryable).toBe(true);
    expect(body.error.message).not.toContain("database password");
  });
});
