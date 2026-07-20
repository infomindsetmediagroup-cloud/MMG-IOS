import { describe, expect, it } from "vitest";
import {
  applyPickerCommand,
  buildPickerSnapshot,
  MMGPickerCommandError,
  type MMGPickerAsset,
  type MMGPickerState,
} from "../server/knowledge-library/picker.js";

const makeAsset = (assetId: string): MMGPickerAsset => ({
  assetId,
  shopifyProductId: `gid://shopify/Product/${assetId}`,
  handle: assetId,
  title: assetId,
  url: `/products/${assetId}`,
  topic: "creator_education",
  experienceLevel: "beginner",
  format: "guide",
  series: null,
  seriesOrder: null,
  portraitCoverUrl: `https://cdn.example.com/${assetId}-portrait.png`,
  squareThumbnailUrl: `https://cdn.example.com/${assetId}-square.png`,
  summary: null,
  productType: "digital_download",
  assetStatus: "active",
  published: true,
  available: true,
  subscriptionEligible: true,
  subscriptionValue: 1,
  portraitCoverPresent: true,
  squareThumbnailPresent: true,
  deliveryPackageVerified: true,
  customerDestination: "my_library",
});

const completeState = (): MMGPickerState => ({
  customerAuthenticated: true,
  subscriptionActive: true,
  window: {
    id: "window-revalidation",
    type: "first_package",
    status: "open",
    totalUnits: 2,
    targetAssetCount: 2,
    version: 2,
    opensAt: null,
    closesAt: null,
  },
  assets: [makeAsset("asset-a"), makeAsset("asset-b")],
  ownedAssetIds: [],
  selections: [
    {
      assetId: "asset-a",
      units: 1,
      state: "selected",
      selectedAt: "2026-07-20T12:00:00.000Z",
    },
    {
      assetId: "asset-b",
      units: 1,
      state: "selected",
      selectedAt: "2026-07-20T12:01:00.000Z",
    },
  ],
  processedRequestIds: [],
  confirmedAt: null,
});

describe("MMG picker confirmation revalidation", () => {
  it("allows confirmation while both selected assets still pass eligibility", () => {
    const snapshot = buildPickerSnapshot(completeState());
    expect(snapshot.canConfirm).toBe(true);
    expect(snapshot.status).toBe("selection_complete");
  });

  it("blocks confirmation when a selected delivery package becomes unavailable", () => {
    const state = completeState();
    state.assets[1].deliveryPackageVerified = false;

    const snapshot = buildPickerSnapshot(state);
    expect(snapshot.canConfirm).toBe(false);
    expect(snapshot.status).toBe("ready");
    expect(
      snapshot.items.find((item) => item.assetId === "asset-b")
        ?.eligibilityReasonCodes,
    ).toContain("MISSING_DELIVERY_PACKAGE");

    try {
      applyPickerCommand(state, {
        action: "confirm",
        requestId: "confirm-after-package-change",
        expectedWindowVersion: 2,
        occurredAt: "2026-07-20T12:05:00.000Z",
      });
      throw new Error("Expected confirmation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MMGPickerCommandError);
      expect((error as MMGPickerCommandError).code).toBe("PACKAGE_INCOMPLETE");
    }
  });

  it("blocks confirmation when a selected asset becomes owned through another grant", () => {
    const state = completeState();
    state.ownedAssetIds = ["asset-a"];

    const snapshot = buildPickerSnapshot(state);
    expect(snapshot.canConfirm).toBe(false);
    expect(
      snapshot.items.find((item) => item.assetId === "asset-a")
        ?.eligibilityReasonCodes,
    ).toContain("ALREADY_OWNED");
  });

  it("blocks confirmation when a selected product is retired", () => {
    const state = completeState();
    state.assets[0].assetStatus = "retired";

    const snapshot = buildPickerSnapshot(state);
    expect(snapshot.canConfirm).toBe(false);
    expect(
      snapshot.items.find((item) => item.assetId === "asset-a")
        ?.eligibilityReasonCodes,
    ).toContain("ASSET_RETIRED");
  });
});
