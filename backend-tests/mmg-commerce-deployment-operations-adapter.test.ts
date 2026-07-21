import { describe, expect, it, vi } from "vitest";
import { MMGReleaseBoundCommerceOperationsAdapter } from "../server/operations/commerce-deployment-operations-adapter.js";

describe("MMG release-bound deployment operations adapter", () => {
  it("combines subsystem state with fresh release rehearsal evidence", async () => {
    const subsystems = {
      inspect: vi.fn().mockResolvedValue({
        schedulerActive: true,
        dispatcherActive: true,
        storageSignerActive: true,
      }),
      activate: vi.fn().mockResolvedValue({
        schedulerActive: true,
        dispatcherActive: true,
        storageSignerActive: true,
      }),
      deactivate: vi.fn().mockResolvedValue(undefined),
    };
    const rehearsal = {
      hasFreshPassedEvidence: vi.fn().mockResolvedValue(true),
    };
    const adapter = new MMGReleaseBoundCommerceOperationsAdapter({
      environment: "staging",
      releaseId: "release-staging-12345678",
      subsystems,
      rehearsal,
      now: () => new Date("2026-07-21T01:00:00.000Z"),
    });
    await expect(adapter.inspect()).resolves.toEqual({
      schedulerActive: true,
      dispatcherActive: true,
      storageSignerActive: true,
      stagingRehearsalPassed: true,
    });
    expect(rehearsal.hasFreshPassedEvidence).toHaveBeenCalledWith({
      releaseId: "release-staging-12345678",
      maximumAgeSeconds: 86400,
      asOf: new Date("2026-07-21T01:00:00.000Z"),
    });
  });

  it("does not invent a rehearsal pass during activation", async () => {
    const adapter = new MMGReleaseBoundCommerceOperationsAdapter({
      environment: "production",
      releaseId: "release-production-12345678",
      subsystems: {
        inspect: vi.fn(),
        activate: vi.fn().mockResolvedValue({
          schedulerActive: true,
          dispatcherActive: true,
          storageSignerActive: true,
        }),
        deactivate: vi.fn().mockResolvedValue(undefined),
      },
      rehearsal: { hasFreshPassedEvidence: vi.fn().mockResolvedValue(false) },
    });
    await expect(adapter.activate()).resolves.toEqual(
      expect.objectContaining({ stagingRehearsalPassed: false }),
    );
  });
});
