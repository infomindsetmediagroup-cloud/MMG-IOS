import { describe, expect, it } from "vitest";
import {
  MMG_SUBSCRIPTION_PLANS,
  buildMMGEntitlementCounter,
  type MMGEntitlementCycleInput,
  type MMGEntitlementWindowInput,
} from "../server/knowledge-library/entitlements.js";

const cycle = (
  planCode: keyof typeof MMG_SUBSCRIPTION_PLANS,
): MMGEntitlementCycleInput => {
  const plan = MMG_SUBSCRIPTION_PLANS[planCode];
  return {
    id: `cycle-${planCode}`,
    planCode,
    status: "active",
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-01T00:00:00.000Z",
    totalPackages: plan.packagesPerBillingCycle,
    totalUnits: plan.assetsPerBillingCycle,
    version: 1,
  };
};

const window = (
  overrides: Partial<MMGEntitlementWindowInput> = {},
): MMGEntitlementWindowInput => ({
  id: "window-1",
  packageSequence: 1,
  type: "first_package",
  status: "open",
  totalUnits: 2,
  targetAssetCount: 2,
  version: 1,
  opensAt: "2026-07-01T00:00:00.000Z",
  closesAt: "2026-07-03T00:00:00.000Z",
  confirmedAt: null,
  selections: [],
  ...overrides,
});

describe("MMG entitlement counter", () => {
  it("locks exact plan prices and monthly asset entitlements", () => {
    expect(MMG_SUBSCRIPTION_PLANS.monthly).toEqual({
      code: "monthly",
      displayName: "Monthly",
      monthlyPrice: 14.95,
      packagesPerBillingCycle: 1,
      assetsPerPackage: 2,
      assetsPerBillingCycle: 2,
    });
    expect(MMG_SUBSCRIPTION_PLANS.biweekly).toEqual({
      code: "biweekly",
      displayName: "Bi-weekly",
      monthlyPrice: 24.95,
      packagesPerBillingCycle: 2,
      assetsPerPackage: 2,
      assetsPerBillingCycle: 4,
    });
    expect(MMG_SUBSCRIPTION_PLANS.weekly).toEqual({
      code: "weekly",
      displayName: "Weekly",
      monthlyPrice: 39.95,
      packagesPerBillingCycle: 4,
      assetsPerPackage: 2,
      assetsPerBillingCycle: 8,
    });
  });

  it("calculates selected, reserved, confirmed, delivered, and remaining units", () => {
    const snapshot = buildMMGEntitlementCounter({
      cycle: cycle("weekly"),
      deliveredUnits: 2,
      windows: [
        window({
          id: "confirmed-1",
          status: "confirmed",
          confirmedAt: "2026-07-03T00:00:00.000Z",
          selections: [
            { assetId: "a", units: 1, state: "confirmed" },
            { assetId: "b", units: 1, state: "confirmed" },
          ],
        }),
        window({
          id: "open-2",
          packageSequence: 2,
          type: "scheduled_package_review",
          selections: [
            { assetId: "c", units: 1, state: "selected" },
            { assetId: "d", units: 1, state: "reserved" },
          ],
        }),
      ],
    });

    expect(snapshot.packages).toEqual({
      total: 4,
      opened: 2,
      confirmed: 1,
      remaining: 3,
    });
    expect(snapshot.assets).toEqual({
      totalUnits: 8,
      selectedUnits: 1,
      reservedUnits: 1,
      confirmedUnits: 2,
      deliveredUnits: 2,
      committedUnits: 4,
      remainingUnits: 4,
    });
    expect(snapshot.currentWindow?.id).toBe("open-2");
    expect(snapshot.currentWindow?.remainingUnits).toBe(0);
    expect(snapshot.currentWindow?.selectedAssetCount).toBe(2);
  });

  it("uses open, scheduled, then confirmed window priority", () => {
    const scheduled = window({
      id: "scheduled",
      packageSequence: 3,
      status: "scheduled",
    });
    const confirmed = window({
      id: "confirmed",
      packageSequence: 2,
      status: "confirmed",
      confirmedAt: "2026-07-10T00:00:00.000Z",
    });
    const open = window({ id: "open", packageSequence: 1, status: "open" });

    expect(
      buildMMGEntitlementCounter({
        cycle: cycle("weekly"),
        windows: [confirmed, scheduled],
        deliveredUnits: 0,
      }).currentWindow?.id,
    ).toBe("scheduled");

    expect(
      buildMMGEntitlementCounter({
        cycle: cycle("weekly"),
        windows: [confirmed, scheduled, open],
        deliveredUnits: 0,
      }).currentWindow?.id,
    ).toBe("open");
  });

  it("rejects a cycle whose capacity does not match the locked plan", () => {
    expect(() =>
      buildMMGEntitlementCounter({
        cycle: { ...cycle("monthly"), totalUnits: 4 },
        windows: [],
        deliveredUnits: 0,
      }),
    ).toThrow("MMG_ENTITLEMENT_CYCLE_PLAN_MISMATCH");
  });

  it("never reports negative remaining capacity or delivered units above total", () => {
    const snapshot = buildMMGEntitlementCounter({
      cycle: cycle("monthly"),
      deliveredUnits: 200,
      windows: [
        window({
          selections: [
            { assetId: "a", units: 2, state: "selected" },
            { assetId: "b", units: 2, state: "reserved" },
          ],
        }),
      ],
    });

    expect(snapshot.assets.remainingUnits).toBe(0);
    expect(snapshot.assets.deliveredUnits).toBe(2);
  });
});
