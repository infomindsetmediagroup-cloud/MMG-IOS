import { describe, expect, it } from "vitest";
import {
  applyPickerCommand,
  buildPickerSnapshot,
  MMGPickerCommandError,
  type MMGPickerAsset,
  type MMGPickerCommand,
  type MMGPickerState,
} from "../server/knowledge-library/picker.js";

const asset = (
  assetId: string,
  title: string,
  overrides: Partial<MMGPickerAsset> = {},
): MMGPickerAsset => ({
  assetId,
  shopifyProductId: `gid://shopify/Product/${assetId}`,
  handle: assetId,
  title,
  url: `/products/${assetId}`,
  topic: "creator_education",
  experienceLevel: "beginner",
  format: "guide",
  series: null,
  seriesOrder: null,
  portraitCoverUrl: `https://cdn.example.com/${assetId}-portrait.png`,
  squareThumbnailUrl: `https://cdn.example.com/${assetId}-square.png`,
  summary: `${title} summary`,
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
  ...overrides,
});

const state = (): MMGPickerState => ({
  customerAuthenticated: true,
  subscriptionActive: true,
  window: {
    id: "window-first-package-001",
    type: "first_package",
    status: "open",
    totalUnits: 2,
    targetAssetCount: 2,
    version: 0,
    opensAt: "2026-07-20T12:00:00.000Z",
    closesAt: "2026-07-22T12:00:00.000Z",
  },
  assets: [
    asset("asset-alpha", "Alpha Guide"),
    asset("asset-beta", "Beta Guide"),
    asset("asset-gamma", "Gamma Guide"),
  ],
  ownedAssetIds: [],
  selections: [],
  processedRequestIds: [],
  confirmedAt: null,
});

const command = (
  action: MMGPickerCommand["action"],
  expectedWindowVersion: number,
  assetId?: string,
  requestId = `${action}-${expectedWindowVersion}-request`,
): MMGPickerCommand => ({
  action,
  requestId,
  expectedWindowVersion,
  ...(assetId ? { assetId } : {}),
  occurredAt: "2026-07-20T12:30:00.000Z",
});

const capturePickerError = (callback: () => unknown): MMGPickerCommandError => {
  try {
    callback();
  } catch (error) {
    if (error instanceof MMGPickerCommandError) return error;
    throw error;
  }
  throw new Error("Expected MMGPickerCommandError");
};

describe("MMG Knowledge Library picker state machine", () => {
  it("builds a ready first-package snapshot with two units", () => {
    const snapshot = buildPickerSnapshot(state());

    expect(snapshot.schemaVersion).toBe("1.0.0");
    expect(snapshot.serverDecisionRequired).toBe(true);
    expect(snapshot.status).toBe("ready");
    expect(snapshot.window).toMatchObject({
      type: "first_package",
      status: "open",
      totalUnits: 2,
      selectedUnits: 0,
      reservedUnits: 0,
      remainingUnits: 2,
      targetAssetCount: 2,
      selectedAssetCount: 0,
      version: 0,
    });
    expect(snapshot.items).toHaveLength(3);
    expect(snapshot.items.every((item) => item.canSelect)).toBe(true);
    expect(snapshot.canConfirm).toBe(false);
  });

  it("excludes owned titles and non-digital products", () => {
    const current = state();
    current.ownedAssetIds = ["asset-alpha"];
    current.assets.push(
      asset("service-one", "Service One", {
        productType: "service",
        customerDestination: "my_projects",
      }),
    );

    const snapshot = buildPickerSnapshot(current);
    expect(snapshot.items.map((item) => item.assetId)).toEqual([
      "asset-beta",
      "asset-gamma",
    ]);
    expect(snapshot.excluded.ownedCount).toBe(1);
    expect(snapshot.excluded.nonCatalogCount).toBe(1);
  });

  it("excludes incomplete subscription delivery metadata", () => {
    const current = state();
    current.assets.push(
      asset("asset-incomplete", "Incomplete Guide", {
        squareThumbnailPresent: false,
        squareThumbnailUrl: "",
        deliveryPackageVerified: false,
      }),
    );

    const snapshot = buildPickerSnapshot(current);
    expect(snapshot.items.map((item) => item.assetId)).not.toContain(
      "asset-incomplete",
    );
    expect(snapshot.excluded.incompleteMetadataCount).toBe(1);
  });

  it("selects two titles, increments window versions, and completes capacity", () => {
    const first = applyPickerCommand(
      state(),
      command("select", 0, "asset-alpha", "request-select-alpha"),
    );

    expect(first.changed).toBe(true);
    expect(first.snapshot.window.version).toBe(1);
    expect(first.snapshot.window.selectedUnits).toBe(1);
    expect(first.snapshot.window.remainingUnits).toBe(1);
    expect(first.snapshot.selectedAssetIds).toEqual(["asset-alpha"]);
    expect(first.snapshot.canConfirm).toBe(false);

    const second = applyPickerCommand(
      first.state,
      command("select", 1, "asset-beta", "request-select-beta"),
    );

    expect(second.snapshot.status).toBe("selection_complete");
    expect(second.snapshot.window.version).toBe(2);
    expect(second.snapshot.window.selectedUnits).toBe(2);
    expect(second.snapshot.window.remainingUnits).toBe(0);
    expect(second.snapshot.window.selectedAssetCount).toBe(2);
    expect(second.snapshot.canConfirm).toBe(true);

    const gamma = second.snapshot.items.find(
      (item) => item.assetId === "asset-gamma",
    );
    expect(gamma?.canSelect).toBe(false);
    expect(gamma?.eligibilityReasonCodes).toContain(
      "INSUFFICIENT_REMAINING_UNITS",
    );
  });

  it("prevents over-selection", () => {
    const first = applyPickerCommand(
      state(),
      command("select", 0, "asset-alpha", "request-select-alpha"),
    );
    const second = applyPickerCommand(
      first.state,
      command("select", 1, "asset-beta", "request-select-beta"),
    );

    const error = capturePickerError(() =>
      applyPickerCommand(
        second.state,
        command("select", 2, "asset-gamma", "request-select-gamma"),
      ),
    );

    expect(error.code).toBe("INSUFFICIENT_REMAINING_UNITS");
    expect(error.status).toBe(409);
    expect(error.snapshot.window.remainingUnits).toBe(0);
  });

  it("removes an unconfirmed title and returns its unit", () => {
    const selected = applyPickerCommand(
      state(),
      command("select", 0, "asset-alpha", "request-select-alpha"),
    );
    const removed = applyPickerCommand(
      selected.state,
      command("remove", 1, "asset-alpha", "request-remove-alpha"),
    );

    expect(removed.snapshot.selectedAssetIds).toEqual([]);
    expect(removed.snapshot.window.selectedUnits).toBe(0);
    expect(removed.snapshot.window.remainingUnits).toBe(2);
    expect(removed.snapshot.window.version).toBe(2);
  });

  it("requires exactly two titles and all units before confirmation", () => {
    const selected = applyPickerCommand(
      state(),
      command("select", 0, "asset-alpha", "request-select-alpha"),
    );

    const error = capturePickerError(() =>
      applyPickerCommand(
        selected.state,
        command("confirm", 1, undefined, "request-confirm-incomplete"),
      ),
    );

    expect(error.code).toBe("PACKAGE_INCOMPLETE");
    expect(error.snapshot.canConfirm).toBe(false);
  });

  it("confirms a complete package and locks selections", () => {
    const first = applyPickerCommand(
      state(),
      command("select", 0, "asset-alpha", "request-select-alpha"),
    );
    const second = applyPickerCommand(
      first.state,
      command("select", 1, "asset-beta", "request-select-beta"),
    );
    const confirmed = applyPickerCommand(
      second.state,
      command("confirm", 2, undefined, "request-confirm-package"),
    );

    expect(confirmed.snapshot.status).toBe("confirmed");
    expect(confirmed.snapshot.window.status).toBe("confirmed");
    expect(confirmed.snapshot.window.version).toBe(3);
    expect(confirmed.snapshot.confirmedAt).toBe(
      "2026-07-20T12:30:00.000Z",
    );
    expect(
      confirmed.snapshot.items
        .filter((item) => ["asset-alpha", "asset-beta"].includes(item.assetId))
        .every((item) => item.selectionState === "confirmed"),
    ).toBe(true);

    const error = capturePickerError(() =>
      applyPickerCommand(
        confirmed.state,
        command("remove", 3, "asset-alpha", "request-remove-confirmed"),
      ),
    );
    expect(error.code).toBe("WINDOW_NOT_OPEN");
  });

  it("rejects stale optimistic-concurrency versions", () => {
    const selected = applyPickerCommand(
      state(),
      command("select", 0, "asset-alpha", "request-select-alpha"),
    );

    const error = capturePickerError(() =>
      applyPickerCommand(
        selected.state,
        command("select", 0, "asset-beta", "request-stale-version"),
      ),
    );

    expect(error.code).toBe("WINDOW_VERSION_CONFLICT");
    expect(error.status).toBe(409);
    expect(error.snapshot.window.version).toBe(1);
  });

  it("returns an idempotent replay without mutating state twice", () => {
    const request = command(
      "select",
      0,
      "asset-alpha",
      "stable-idempotency-request",
    );
    const first = applyPickerCommand(state(), request);
    const replay = applyPickerCommand(first.state, request);

    expect(replay.changed).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.state.window.version).toBe(1);
    expect(replay.snapshot.selectedAssetIds).toEqual(["asset-alpha"]);
  });

  it("supports weighted assets without overdrawing units", () => {
    const current = state();
    current.assets = [
      asset("asset-weighted", "Weighted Toolkit", { subscriptionValue: 2 }),
      asset("asset-alpha", "Alpha Guide"),
    ];
    current.window.targetAssetCount = 1;

    const selected = applyPickerCommand(
      current,
      command("select", 0, "asset-weighted", "request-select-weighted"),
    );

    expect(selected.snapshot.window.selectedUnits).toBe(2);
    expect(selected.snapshot.window.remainingUnits).toBe(0);
    expect(selected.snapshot.window.selectedAssetCount).toBe(1);
    expect(selected.snapshot.canConfirm).toBe(true);
  });
});
