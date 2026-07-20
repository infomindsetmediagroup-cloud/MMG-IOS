import { describe, expect, it, vi } from "vitest";
import {
  createMMGMyLibraryAccess,
  getMMGMyLibrary,
  type MMGMyLibraryStorageGateway,
} from "../server/customer-portal/my-library-service.js";
import type { MMGMyLibraryRepository } from "../server/customer-portal/my-library-repository.js";

const repository = (): MMGMyLibraryRepository => ({
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
});

const storageGateway = (): MMGMyLibraryStorageGateway => ({
  createSignedAccess: vi.fn().mockResolvedValue({
    url: "https://downloads.example.com/signed/ai-image-mastery",
    expiresAt: new Date("2026-07-20T20:05:00.000Z"),
  }),
});

const principal = {
  customerId: "gid://shopify/Customer/42",
  sessionId: "session-12345678",
};

const now = new Date("2026-07-20T20:00:00.000Z");

describe("MMG My Library service", () => {
  it("returns an empty authenticated library as a successful state", async () => {
    const repo = repository();
    const result = await getMMGMyLibrary({
      repository: repo,
      principal,
      asOf: now,
    });

    expect(result.status).toBe(200);
    expect(result.body.library.totalAssets).toBe(0);
    expect(repo.loadOwnedAssetRecords).toHaveBeenCalledWith(principal.customerId, now);
  });

  it("issues a short-lived download only after claiming and revalidating the request", async () => {
    const repo = repository();
    const gateway = storageGateway();
    const result = await createMMGMyLibraryAccess({
      repository: repo,
      storageGateway: gateway,
      principal,
      request: {
        requestId: "request-12345678",
        assetId: "mmg-dd-ai-image-mastery-001",
        kind: "download",
      },
      now,
      accessTtlSeconds: 300,
    });

    expect(result.status).toBe(200);
    if (!result.body.ok) throw new Error("Expected access success.");
    expect(result.body.access).toEqual({
      kind: "download",
      url: "https://downloads.example.com/signed/ai-image-mastery",
      expiresAt: "2026-07-20T20:05:00.000Z",
      fileName: "AI-Image-Mastery.pdf",
      mediaType: "application/pdf",
    });
    const claimOrder = vi.mocked(repo.claimAccessRequest).mock.invocationCallOrder[0];
    const loadOrder = vi.mocked(repo.loadAccessibleFile).mock.invocationCallOrder[0];
    expect(claimOrder).toBeDefined();
    expect(loadOrder).toBeDefined();
    expect(claimOrder).toBeLessThan(loadOrder ?? Number.MAX_SAFE_INTEGER);
    expect(gateway.createSignedAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: "attachment",
        expiresInSeconds: 300,
      }),
    );
    expect(repo.completeAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: "granted", fileId: "file-1" }),
    );
  });

  it("uses inline disposition for read-online access", async () => {
    const repo = repository();
    vi.mocked(repo.loadAccessibleFile).mockResolvedValue({
      id: "file-2",
      assetId: "mmg-dd-ai-image-mastery-001",
      accessKind: "read",
      displayName: "AI Image Mastery Reader",
      downloadName: "AI-Image-Mastery.pdf",
      mediaType: "application/pdf",
      storageProvider: "r2",
      storageObjectKey: "private/ai-image-mastery-reader.pdf",
      fileSizeBytes: 1024,
    });
    const gateway = storageGateway();

    const result = await createMMGMyLibraryAccess({
      repository: repo,
      storageGateway: gateway,
      principal,
      request: {
        requestId: "request-read-12345678",
        assetId: "mmg-dd-ai-image-mastery-001",
        kind: "read",
      },
      now,
    });

    expect(result.status).toBe(200);
    expect(gateway.createSignedAccess).toHaveBeenCalledWith(
      expect.objectContaining({ disposition: "inline" }),
    );
  });

  it("rejects duplicate request IDs before signing access", async () => {
    const repo = repository();
    vi.mocked(repo.claimAccessRequest).mockResolvedValue(false);
    const gateway = storageGateway();

    const result = await createMMGMyLibraryAccess({
      repository: repo,
      storageGateway: gateway,
      principal,
      request: {
        requestId: "request-12345678",
        assetId: "mmg-dd-ai-image-mastery-001",
        kind: "download",
      },
      now,
    });

    expect(result.status).toBe(409);
    expect(gateway.createSignedAccess).not.toHaveBeenCalled();
  });

  it("denies access when active ownership or delivery readiness cannot be resolved", async () => {
    const repo = repository();
    vi.mocked(repo.loadAccessibleFile).mockResolvedValue(null);
    const gateway = storageGateway();

    const result = await createMMGMyLibraryAccess({
      repository: repo,
      storageGateway: gateway,
      principal,
      request: {
        requestId: "request-denied-12345678",
        assetId: "mmg-dd-ai-image-mastery-001",
        kind: "download",
      },
      now,
    });

    expect(result.status).toBe(404);
    expect(gateway.createSignedAccess).not.toHaveBeenCalled();
    expect(repo.completeAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "denied",
        failureCode: "ACCESS_NOT_AVAILABLE",
      }),
    );
  });

  it("rejects insecure or overlong signed access responses", async () => {
    const repo = repository();
    const gateway = storageGateway();
    vi.mocked(gateway.createSignedAccess).mockResolvedValue({
      url: "http://downloads.example.com/unsafe",
      expiresAt: new Date("2026-07-20T21:00:00.000Z"),
    });

    const result = await createMMGMyLibraryAccess({
      repository: repo,
      storageGateway: gateway,
      principal,
      request: {
        requestId: "request-invalid-12345678",
        assetId: "mmg-dd-ai-image-mastery-001",
        kind: "download",
      },
      now,
      accessTtlSeconds: 300,
    });

    expect(result.status).toBe(502);
    expect(repo.completeAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", failureCode: "SIGNED_ACCESS_FAILED" }),
    );
  });
});
