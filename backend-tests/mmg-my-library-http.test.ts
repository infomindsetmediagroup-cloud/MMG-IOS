import { describe, expect, it, vi } from "vitest";
import {
  handleMMGMyLibraryAccessRequest,
  handleMMGMyLibraryRequest,
  type MMGMyLibraryHttpDependencies,
} from "../server/customer-portal/my-library-http.js";

const dependencies = (): MMGMyLibraryHttpDependencies => ({
  repository: {
    loadOwnedAssetRecords: vi.fn().mockResolvedValue([]),
    claimAccessRequest: vi.fn().mockResolvedValue(true),
    loadAccessibleFile: vi.fn().mockResolvedValue({
      id: "file-1",
      assetId: "mmg-dd-ai-image-mastery-001",
      accessKind: "download",
      displayName: "AI Image Mastery PDF",
      downloadName: "AI-Image-Mastery.pdf",
      mediaType: "application/pdf",
      storageProvider: "r2",
      storageObjectKey: "private/ai-image-mastery.pdf",
      fileSizeBytes: 1024,
    }),
    completeAccessRequest: vi.fn().mockResolvedValue(undefined),
  },
  storageGateway: {
    createSignedAccess: vi.fn().mockResolvedValue({
      url: "https://downloads.example.com/signed/ai-image-mastery",
      expiresAt: new Date("2026-07-20T20:05:00.000Z"),
    }),
  },
  authenticate: vi.fn().mockResolvedValue({
    customerId: "gid://shopify/Customer/42",
    sessionId: "session-12345678",
  }),
  validateSameOrigin: vi.fn().mockReturnValue(true),
  validateCsrf: vi.fn().mockResolvedValue(true),
  now: () => new Date("2026-07-20T20:00:00.000Z"),
  accessTtlSeconds: 300,
});

const getRequest = (method = "GET"): Request =>
  new Request("https://themindsetmediagroup.com/api/customer-portal/my-library", {
    method,
  });

const accessRequest = (input?: {
  method?: string;
  body?: string;
  csrf?: string | null;
}): Request => {
  const headers = new Headers({ "Content-Type": "application/json" });
  const csrf = input?.csrf === undefined ? "csrf-token-12345678" : input.csrf;
  if (csrf) headers.set("X-MMG-CSRF-Token", csrf);

  return new Request(
    "https://themindsetmediagroup.com/api/customer-portal/my-library/access",
    {
      method: input?.method ?? "POST",
      headers,
      body:
        (input?.method ?? "POST") === "POST"
          ? input?.body ??
            JSON.stringify({
              requestId: "request-12345678",
              assetId: "mmg-dd-ai-image-mastery-001",
              kind: "download",
            })
          : undefined,
    },
  );
};

describe("MMG My Library HTTP endpoints", () => {
  it("returns a private non-cacheable authenticated library", async () => {
    const response = await handleMMGMyLibraryRequest(getRequest(), dependencies());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(body.ok).toBe(true);
  });

  it("rejects unauthenticated library access", async () => {
    const deps = dependencies();
    vi.mocked(deps.authenticate).mockResolvedValue(null);

    const response = await handleMMGMyLibraryRequest(getRequest(), deps);
    expect(response.status).toBe(401);
  });

  it("rejects unsupported methods", async () => {
    const library = await handleMMGMyLibraryRequest(getRequest("POST"), dependencies());
    const access = await handleMMGMyLibraryAccessRequest(
      accessRequest({ method: "GET" }),
      dependencies(),
    );

    expect(library.status).toBe(405);
    expect(library.headers.get("Allow")).toBe("GET");
    expect(access.status).toBe(405);
    expect(access.headers.get("Allow")).toBe("POST");
  });

  it("requires same-origin and CSRF validation before issuing access", async () => {
    const originDeps = dependencies();
    vi.mocked(originDeps.validateSameOrigin).mockReturnValue(false);
    const originResponse = await handleMMGMyLibraryAccessRequest(
      accessRequest(),
      originDeps,
    );
    expect(originResponse.status).toBe(403);
    expect(originDeps.storageGateway.createSignedAccess).not.toHaveBeenCalled();

    const csrfDeps = dependencies();
    vi.mocked(csrfDeps.validateCsrf).mockResolvedValue(false);
    const csrfResponse = await handleMMGMyLibraryAccessRequest(
      accessRequest({ csrf: null }),
      csrfDeps,
    );
    expect(csrfResponse.status).toBe(403);
    expect(csrfDeps.storageGateway.createSignedAccess).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized access payloads", async () => {
    const malformed = await handleMMGMyLibraryAccessRequest(
      accessRequest({ body: "{" }),
      dependencies(),
    );
    expect(malformed.status).toBe(400);

    const oversized = await handleMMGMyLibraryAccessRequest(
      accessRequest({
        body: JSON.stringify({
          requestId: "x".repeat(5000),
          assetId: "asset",
          kind: "download",
        }),
      }),
      dependencies(),
    );
    expect(oversized.status).toBe(400);
  });

  it("returns only customer-safe signed access fields", async () => {
    const response = await handleMMGMyLibraryAccessRequest(
      accessRequest(),
      dependencies(),
    );
    const body = (await response.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(serialized).toContain("https://downloads.example.com/signed");
    expect(serialized).not.toContain("private/ai-image-mastery.pdf");
    expect(serialized).not.toContain("storageProvider");
    expect(serialized).not.toContain("customerId");
    expect(serialized).not.toContain("file-1");
  });
});
