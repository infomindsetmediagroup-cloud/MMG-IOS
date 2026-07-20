import { describe, expect, it } from "vitest";
import {
  executePickerCommand,
  getPickerSnapshot,
  parsePickerCommandPayload,
  validatePickerRequestSecurity,
  type MMGPickerPrincipal,
  type MMGPickerStateRepository,
} from "../server/knowledge-library/picker-service.js";
import type {
  MMGPickerAsset,
  MMGPickerState,
} from "../server/knowledge-library/picker.js";

const principal: MMGPickerPrincipal = {
  customerId: "customer-001",
  sessionId: "session-001",
};

const eligibleAsset = (assetId: string): MMGPickerAsset => ({
  assetId,
  shopifyProductId: `gid://shopify/Product/${assetId}`,
  handle: assetId,
  title: assetId,
  url: `/products/${assetId}`,
  topic: "ai_image_generation",
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

const initialState = (): MMGPickerState => ({
  customerAuthenticated: true,
  subscriptionActive: true,
  window: {
    id: "window-001",
    type: "first_package",
    status: "open",
    totalUnits: 2,
    targetAssetCount: 2,
    version: 0,
    opensAt: null,
    closesAt: null,
  },
  assets: [eligibleAsset("asset-a"), eligibleAsset("asset-b")],
  ownedAssetIds: [],
  selections: [],
  processedRequestIds: [],
  confirmedAt: null,
});

class MemoryRepository implements MMGPickerStateRepository {
  current: MMGPickerState | null;
  conflictOnSave = false;

  constructor(state: MMGPickerState | null) {
    this.current = state;
  }

  async load(): Promise<MMGPickerState | null> {
    return this.current ? structuredClone(this.current) : null;
  }

  async save(
    _principal: MMGPickerPrincipal,
    state: MMGPickerState,
    expectedPreviousVersion: number,
  ): Promise<"saved" | "version_conflict"> {
    if (
      this.conflictOnSave ||
      !this.current ||
      this.current.window.version !== expectedPreviousVersion
    ) {
      return "version_conflict";
    }
    this.current = structuredClone(state);
    return "saved";
  }
}

describe("MMG Knowledge Library picker service boundary", () => {
  it("accepts only the canonical command payload fields", () => {
    expect(
      parsePickerCommandPayload({
        action: "select",
        assetId: "asset-a",
        requestId: "request-12345",
        expectedWindowVersion: 0,
      }),
    ).toEqual({
      action: "select",
      assetId: "asset-a",
      requestId: "request-12345",
      expectedWindowVersion: 0,
    });

    expect(() =>
      parsePickerCommandPayload({
        action: "select",
        assetId: "asset-a",
        requestId: "request-12345",
        expectedWindowVersion: 0,
        customerId: "attacker-controlled-customer",
      }),
    ).toThrowError("PICKER_CLIENT_IDENTITY_FORBIDDEN");
  });

  it("requires an asset ID for select and remove but forbids it for confirm", () => {
    expect(() =>
      parsePickerCommandPayload({
        action: "select",
        requestId: "request-12345",
        expectedWindowVersion: 0,
      }),
    ).toThrowError("PICKER_INVALID_ASSET_ID");

    expect(() =>
      parsePickerCommandPayload({
        action: "confirm",
        assetId: "asset-a",
        requestId: "request-12345",
        expectedWindowVersion: 0,
      }),
    ).toThrowError("PICKER_CONFIRM_ASSET_ID_FORBIDDEN");
  });

  it("validates same-origin and session-bound CSRF controls", () => {
    expect(() =>
      validatePickerRequestSecurity({
        requestOrigin: "https://themindsetmediagroup.com",
        expectedOrigin: "https://themindsetmediagroup.com",
        csrfHeaderToken: "csrf-token",
        csrfSessionToken: "csrf-token",
      }),
    ).not.toThrow();

    expect(() =>
      validatePickerRequestSecurity({
        requestOrigin: "https://malicious.example",
        expectedOrigin: "https://themindsetmediagroup.com",
        csrfHeaderToken: "csrf-token",
        csrfSessionToken: "csrf-token",
      }),
    ).toThrowError("PICKER_ORIGIN_MISMATCH");

    expect(() =>
      validatePickerRequestSecurity({
        requestOrigin: "https://themindsetmediagroup.com",
        expectedOrigin: "https://themindsetmediagroup.com",
        csrfHeaderToken: "wrong-token",
        csrfSessionToken: "csrf-token",
      }),
    ).toThrowError("PICKER_CSRF_INVALID");
  });

  it("returns an authoritative snapshot without accepting client identity", async () => {
    const repository = new MemoryRepository(initialState());
    const response = await getPickerSnapshot(repository, principal);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    if (response.body.ok) {
      expect(response.body.snapshot.window.totalUnits).toBe(2);
      expect(response.body.snapshot.serverDecisionRequired).toBe(true);
    }
  });

  it("executes and persists a versioned selection", async () => {
    const repository = new MemoryRepository(initialState());
    const response = await executePickerCommand(
      repository,
      principal,
      {
        action: "select",
        assetId: "asset-a",
        requestId: "request-select-a",
        expectedWindowVersion: 0,
      },
      new Date("2026-07-20T15:00:00.000Z"),
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    if (response.body.ok) {
      expect(response.body.snapshot.selectedAssetIds).toEqual(["asset-a"]);
      expect(response.body.snapshot.window.version).toBe(1);
      expect(response.body.mutation).toEqual({
        action: "select",
        changed: true,
        idempotentReplay: false,
      });
    }
    expect(repository.current?.window.version).toBe(1);
  });

  it("returns a refreshed snapshot when persistence detects a version conflict", async () => {
    const repository = new MemoryRepository(initialState());
    repository.conflictOnSave = true;

    const response = await executePickerCommand(
      repository,
      principal,
      {
        action: "select",
        assetId: "asset-a",
        requestId: "request-select-a",
        expectedWindowVersion: 0,
      },
      new Date("2026-07-20T15:00:00.000Z"),
    );

    expect(response.status).toBe(409);
    expect(response.body.ok).toBe(false);
    if (!response.body.ok) {
      expect(response.body.error.code).toBe("WINDOW_VERSION_CONFLICT");
      expect(response.body.error.retryable).toBe(true);
      expect(response.body.snapshot?.window.version).toBe(0);
    }
  });

  it("returns the state-machine error snapshot for an invalid selection", async () => {
    const current = initialState();
    current.ownedAssetIds = ["asset-a"];
    const repository = new MemoryRepository(current);

    const response = await executePickerCommand(
      repository,
      principal,
      {
        action: "select",
        assetId: "asset-a",
        requestId: "request-select-owned",
        expectedWindowVersion: 0,
      },
      new Date("2026-07-20T15:00:00.000Z"),
    );

    expect(response.status).toBe(409);
    expect(response.body.ok).toBe(false);
    if (!response.body.ok) {
      expect(response.body.error.code).toBe("ASSET_NOT_SELECTABLE");
      expect(response.body.snapshot?.excluded.ownedCount).toBe(1);
    }
  });

  it("returns 404 when no entitlement window exists", async () => {
    const repository = new MemoryRepository(null);
    const response = await getPickerSnapshot(repository, principal);

    expect(response.status).toBe(404);
    expect(response.body.ok).toBe(false);
    if (!response.body.ok) {
      expect(response.body.error.code).toBe("PICKER_WINDOW_NOT_FOUND");
    }
  });
});
