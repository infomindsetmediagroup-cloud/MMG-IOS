import { describe, expect, it } from "vitest";
import {
  handleKnowledgeLibraryPickerRequest,
  type MMGPickerHttpDependencies,
} from "../server/knowledge-library/picker-http.js";
import type {
  MMGPickerAsset,
  MMGPickerState,
} from "../server/knowledge-library/picker.js";
import type {
  MMGPickerPrincipal,
  MMGPickerStateRepository,
} from "../server/knowledge-library/picker-service.js";

const principal: MMGPickerPrincipal = {
  customerId: "customer-001",
  sessionId: "session-001",
};

const asset = (assetId: string): MMGPickerAsset => ({
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

const initialState = (): MMGPickerState => ({
  customerAuthenticated: true,
  subscriptionActive: true,
  window: {
    id: "window-http-001",
    type: "first_package",
    status: "open",
    totalUnits: 2,
    targetAssetCount: 2,
    version: 0,
    opensAt: null,
    closesAt: null,
  },
  assets: [asset("asset-a"), asset("asset-b")],
  ownedAssetIds: [],
  selections: [],
  processedRequestIds: [],
  confirmedAt: null,
});

class MemoryRepository implements MMGPickerStateRepository {
  current: MMGPickerState | null = initialState();

  async load(): Promise<MMGPickerState | null> {
    return this.current ? structuredClone(this.current) : null;
  }

  async save(
    _principal: MMGPickerPrincipal,
    state: MMGPickerState,
    expectedPreviousVersion: number,
  ): Promise<"saved" | "version_conflict"> {
    if (!this.current || this.current.window.version !== expectedPreviousVersion) {
      return "version_conflict";
    }
    this.current = structuredClone(state);
    return "saved";
  }
}

const dependencies = (
  repository: MMGPickerStateRepository,
  authenticated = true,
): MMGPickerHttpDependencies => ({
  repository,
  authenticate: async () => (authenticated ? principal : null),
  expectedOrigin: () => "https://themindsetmediagroup.com",
  getCsrfSessionToken: async () => "csrf-token",
  issueCsrfToken: async () => "csrf-token",
  now: () => new Date("2026-07-20T17:00:00.000Z"),
});

const readBody = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

describe("MMG Knowledge Library picker HTTP handler", () => {
  it("returns 401 when the customer session is absent", async () => {
    const response = await handleKnowledgeLibraryPickerRequest(
      new Request("https://themindsetmediagroup.com/api/knowledge-library/picker"),
      dependencies(new MemoryRepository(), false),
    );

    expect(response.status).toBe(401);
    expect(await readBody(response)).toMatchObject({
      ok: false,
      error: { code: "PICKER_AUTHENTICATION_REQUIRED" },
    });
  });

  it("returns an authoritative no-store snapshot and a CSRF token", async () => {
    const response = await handleKnowledgeLibraryPickerRequest(
      new Request("https://themindsetmediagroup.com/api/knowledge-library/picker"),
      dependencies(new MemoryRepository()),
    );
    const body = await readBody(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-mmg-csrf-token")).toBe("csrf-token");
    expect(body).toMatchObject({
      ok: true,
      snapshot: {
        serverDecisionRequired: true,
        window: { totalUnits: 2, targetAssetCount: 2 },
      },
    });
  });

  it("rejects a foreign mutation origin", async () => {
    const response = await handleKnowledgeLibraryPickerRequest(
      new Request("https://themindsetmediagroup.com/api/knowledge-library/picker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://malicious.example",
          "X-MMG-CSRF-Token": "csrf-token",
        },
        body: JSON.stringify({
          action: "select",
          assetId: "asset-a",
          requestId: "request-origin-test",
          expectedWindowVersion: 0,
        }),
      }),
      dependencies(new MemoryRepository()),
    );

    expect(response.status).toBe(403);
    expect(await readBody(response)).toMatchObject({
      ok: false,
      error: { code: "PICKER_ORIGIN_MISMATCH" },
    });
  });

  it("rejects a missing CSRF token", async () => {
    const response = await handleKnowledgeLibraryPickerRequest(
      new Request("https://themindsetmediagroup.com/api/knowledge-library/picker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://themindsetmediagroup.com",
        },
        body: JSON.stringify({
          action: "select",
          assetId: "asset-a",
          requestId: "request-csrf-test",
          expectedWindowVersion: 0,
        }),
      }),
      dependencies(new MemoryRepository()),
    );

    expect(response.status).toBe(403);
    expect(await readBody(response)).toMatchObject({
      ok: false,
      error: { code: "PICKER_CSRF_INVALID" },
    });
  });

  it("rejects client-supplied customer identity", async () => {
    const response = await handleKnowledgeLibraryPickerRequest(
      new Request("https://themindsetmediagroup.com/api/knowledge-library/picker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://themindsetmediagroup.com",
          "X-MMG-CSRF-Token": "csrf-token",
        },
        body: JSON.stringify({
          action: "select",
          assetId: "asset-a",
          requestId: "request-identity-test",
          expectedWindowVersion: 0,
          customerId: "customer-999",
        }),
      }),
      dependencies(new MemoryRepository()),
    );

    expect(response.status).toBe(400);
    expect(await readBody(response)).toMatchObject({
      ok: false,
      error: { code: "PICKER_CLIENT_IDENTITY_FORBIDDEN" },
    });
  });

  it("applies a valid same-origin selection mutation", async () => {
    const repository = new MemoryRepository();
    const response = await handleKnowledgeLibraryPickerRequest(
      new Request("https://themindsetmediagroup.com/api/knowledge-library/picker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://themindsetmediagroup.com",
          "X-MMG-CSRF-Token": "csrf-token",
        },
        body: JSON.stringify({
          action: "select",
          assetId: "asset-a",
          requestId: "request-valid-select",
          expectedWindowVersion: 0,
        }),
      }),
      dependencies(repository),
    );
    const body = await readBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      mutation: { action: "select", changed: true },
      snapshot: {
        selectedAssetIds: ["asset-a"],
        window: { version: 1, remainingUnits: 1 },
      },
    });
    expect(repository.current?.window.version).toBe(1);
  });

  it("requires JSON for mutations", async () => {
    const response = await handleKnowledgeLibraryPickerRequest(
      new Request("https://themindsetmediagroup.com/api/knowledge-library/picker", {
        method: "POST",
        headers: {
          Origin: "https://themindsetmediagroup.com",
          "X-MMG-CSRF-Token": "csrf-token",
        },
        body: "action=select",
      }),
      dependencies(new MemoryRepository()),
    );

    expect(response.status).toBe(415);
    expect(await readBody(response)).toMatchObject({
      error: { code: "PICKER_JSON_REQUIRED" },
    });
  });

  it("returns 405 and Allow for unsupported methods", async () => {
    const response = await handleKnowledgeLibraryPickerRequest(
      new Request("https://themindsetmediagroup.com/api/knowledge-library/picker", {
        method: "DELETE",
      }),
      dependencies(new MemoryRepository()),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
  });
});
