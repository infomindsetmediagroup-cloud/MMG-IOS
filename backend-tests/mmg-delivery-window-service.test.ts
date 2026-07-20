import { describe, expect, it } from "vitest";
import {
  MMGDeterministicEligibleCurator,
  runMMGDeliveryWindowController,
  type MMGDeliveryDispatcher,
  type MMGDeliveryWindowCandidate,
  type MMGDeliveryWindowConfirmationService,
  type MMGDeliveryWindowControllerRepository,
  type MMGDeliveryWindowProposal,
  type MMGDeliveryWindowRunSummary,
  type MMGDeliveryWindowSubscription,
} from "../server/knowledge-library/delivery-window-service.js";
import type {
  MMGDeliveryWindowRuntimeState,
  MMGDeliveryWindowScheduleEntry,
} from "../server/knowledge-library/delivery-windows.js";

const now = new Date("2026-07-20T12:00:00.000Z");

const window = (
  overrides: Partial<MMGDeliveryWindowRuntimeState> = {},
): MMGDeliveryWindowRuntimeState => ({
  id: "window-1",
  customerId: "customer-1",
  cycleId: "cycle-1",
  packageSequence: 1,
  type: "scheduled_package_review",
  status: "scheduled",
  totalUnits: 2,
  targetAssetCount: 2,
  selectedUnits: 0,
  selectedAssetCount: 0,
  version: 1,
  opensAt: "2026-07-20T11:00:00.000Z",
  closesAt: "2026-07-22T11:00:00.000Z",
  fallbackPolicy: "auto_confirm_current_selection",
  deliveryDispatchId: null,
  ...overrides,
});

const candidates: MMGDeliveryWindowCandidate[] = [
  {
    assetId: "asset-b",
    title: "Beta",
    topic: "publishing",
    experienceLevel: "beginner",
    format: "guide",
    series: "Series A",
    seriesOrder: 2,
    subscriptionValue: 1,
  },
  {
    assetId: "asset-a",
    title: "Alpha",
    topic: "ai",
    experienceLevel: "beginner",
    format: "guide",
    series: "Series A",
    seriesOrder: 1,
    subscriptionValue: 1,
  },
  {
    assetId: "asset-heavy",
    title: "Heavy",
    topic: "ai",
    experienceLevel: "advanced",
    format: "toolkit",
    series: null,
    seriesOrder: null,
    subscriptionValue: 2,
  },
];

class Repository implements MMGDeliveryWindowControllerRepository {
  begin: "started" | "duplicate" = "started";
  subscriptions: MMGDeliveryWindowSubscription[] = [];
  actionable: MMGDeliveryWindowRuntimeState[] = [];
  candidates = candidates;
  schedules: MMGDeliveryWindowScheduleEntry[][] = [];
  opened: Array<{
    window: MMGDeliveryWindowRuntimeState;
    selections: MMGDeliveryWindowProposal | null;
  }> = [];
  recoveries: string[] = [];
  deliveryReady: string[] = [];
  delivered: string[] = [];
  finished: MMGDeliveryWindowRunSummary | null = null;
  failures: string[] = [];

  async beginRun(): Promise<"started" | "duplicate"> {
    return this.begin;
  }

  async finishRun(
    _runId: string,
    _finishedAt: Date,
    summary: MMGDeliveryWindowRunSummary,
  ): Promise<void> {
    this.finished = summary;
  }

  async listSubscriptionsForReconciliation(): Promise<
    MMGDeliveryWindowSubscription[]
  > {
    return this.subscriptions;
  }

  async ensureCycleAndWindows(
    _subscription: MMGDeliveryWindowSubscription,
    schedule: MMGDeliveryWindowScheduleEntry[],
  ): Promise<{ cycleId: string; created: boolean; windowsCreated: number }> {
    this.schedules.push(schedule);
    return {
      cycleId: "cycle-created",
      created: true,
      windowsCreated: schedule.length,
    };
  }

  async listActionableWindows(): Promise<MMGDeliveryWindowRuntimeState[]> {
    return this.actionable;
  }

  async listCurationCandidates(): Promise<MMGDeliveryWindowCandidate[]> {
    return this.candidates;
  }

  async openWindow(input: {
    window: MMGDeliveryWindowRuntimeState;
    selections: MMGDeliveryWindowProposal | null;
    openedAt: Date;
  }): Promise<"opened" | "version_conflict" | "already_processed"> {
    this.opened.push({
      window: input.window,
      selections: input.selections,
    });
    return "opened";
  }

  async moveWindowToRecovery(input: {
    window: MMGDeliveryWindowRuntimeState;
    reason: string;
    occurredAt: Date;
  }): Promise<"updated" | "version_conflict" | "already_processed"> {
    this.recoveries.push(`${input.window.id}:${input.reason}`);
    return "updated";
  }

  async markDeliveryReady(input: {
    window: MMGDeliveryWindowRuntimeState;
    dispatchId: string;
    occurredAt: Date;
  }): Promise<"updated" | "version_conflict" | "already_processed"> {
    this.deliveryReady.push(`${input.window.id}:${input.dispatchId}`);
    return "updated";
  }

  async markDelivered(input: {
    windowId: string;
    deliveryReference: string;
    occurredAt: Date;
  }): Promise<"updated" | "not_found" | "already_delivered"> {
    this.delivered.push(`${input.windowId}:${input.deliveryReference}`);
    return "updated";
  }

  async reopenRecoveryWindow(): Promise<
    "opened" | "not_found" | "invalid_state"
  > {
    return "opened";
  }

  async recordWindowFailure(input: {
    window: MMGDeliveryWindowRuntimeState;
    code: string;
    message: string;
    occurredAt: Date;
  }): Promise<void> {
    this.failures.push(`${input.window.id}:${input.code}:${input.message}`);
  }
}

class Confirmer implements MMGDeliveryWindowConfirmationService {
  calls: string[] = [];
  result: "confirmed" | "idempotent" | "version_conflict" | "rejected" =
    "confirmed";

  async confirm(input: {
    customerId: string;
    windowId: string;
    expectedWindowVersion: number;
    requestId: string;
    occurredAt: Date;
  }): Promise<"confirmed" | "idempotent" | "version_conflict" | "rejected"> {
    this.calls.push(`${input.windowId}:${input.expectedWindowVersion}`);
    return this.result;
  }
}

class Dispatcher implements MMGDeliveryDispatcher {
  calls: string[] = [];

  async queue(input: {
    windowId: string;
    customerId: string;
    cycleId: string;
    packageSequence: number;
  }): Promise<{ dispatchId: string }> {
    this.calls.push(input.windowId);
    return { dispatchId: `dispatch:${input.windowId}` };
  }
}

const dependencies = (repository: Repository, confirmer = new Confirmer()) => ({
  repository,
  curator: new MMGDeterministicEligibleCurator(),
  confirmer,
  dispatcher: new Dispatcher(),
  now: () => now,
});

describe("MMG deterministic delivery curator", () => {
  it("selects exactly two one-unit titles using stable series order", async () => {
    const proposal = await new MMGDeterministicEligibleCurator().curate({
      window: window(),
      candidates,
    });

    expect(proposal).toEqual({
      assetIds: ["asset-a", "asset-b"],
      source: "deterministic_fallback",
      rationale: expect.stringContaining("deterministic series order"),
    });
  });

  it("returns null when no exact title and unit combination exists", async () => {
    const proposal = await new MMGDeterministicEligibleCurator().curate({
      window: window(),
      candidates: [candidates[2]],
    });
    expect(proposal).toBeNull();
  });
});

describe("MMG delivery-window controller service", () => {
  it("treats a repeated controller run as an idempotent no-op", async () => {
    const repository = new Repository();
    repository.begin = "duplicate";

    const summary = await runMMGDeliveryWindowController(
      "run-duplicate-001",
      dependencies(repository),
    );

    expect(summary.duplicateRun).toBe(true);
    expect(summary.windowsCreated).toBe(0);
    expect(repository.finished).toBeNull();
  });

  it("reconciles the weekly plan into exactly four windows", async () => {
    const repository = new Repository();
    repository.subscriptions = [
      {
        id: "subscription-1",
        customerId: "customer-1",
        planCode: "weekly",
        periodStart: "2026-07-20T00:00:00.000Z",
        periodEnd: "2026-08-20T00:00:00.000Z",
        initialSubscriptionCycle: true,
      },
    ];

    const summary = await runMMGDeliveryWindowController(
      "run-weekly-0001",
      dependencies(repository),
    );

    expect(repository.schedules).toHaveLength(1);
    expect(repository.schedules[0]).toHaveLength(4);
    expect(repository.schedules[0].map((entry) => entry.totalUnits)).toEqual([
      2, 2, 2, 2,
    ]);
    expect(repository.schedules[0][0].type).toBe("first_package");
    expect(summary.cyclesCreated).toBe(1);
    expect(summary.windowsCreated).toBe(4);
  });

  it("opens a first package without a curated proposal", async () => {
    const repository = new Repository();
    repository.actionable = [window({ type: "first_package" })];

    const summary = await runMMGDeliveryWindowController(
      "run-first-package-1",
      dependencies(repository),
    );

    expect(repository.opened[0].selections).toBeNull();
    expect(summary.firstPackagesOpened).toBe(1);
  });

  it("curates and opens future packages with two titles", async () => {
    const repository = new Repository();
    repository.actionable = [window()];

    const summary = await runMMGDeliveryWindowController(
      "run-curated-package-1",
      dependencies(repository),
    );

    expect(repository.opened[0].selections?.assetIds).toEqual([
      "asset-a",
      "asset-b",
    ]);
    expect(summary.curatedPackagesOpened).toBe(1);
  });

  it("moves an uncuratable package into recovery", async () => {
    const repository = new Repository();
    repository.actionable = [window()];
    repository.candidates = [];

    const summary = await runMMGDeliveryWindowController(
      "run-recovery-empty-1",
      dependencies(repository),
    );

    expect(repository.recoveries).toEqual([
      "window-1:NO_COMPLETE_ELIGIBLE_CURATED_PACKAGE",
    ]);
    expect(summary.recoveryRequired).toBe(1);
  });

  it("auto-confirms a complete expired curated package", async () => {
    const repository = new Repository();
    repository.actionable = [
      window({
        status: "open",
        opensAt: "2026-07-18T00:00:00.000Z",
        closesAt: "2026-07-20T11:00:00.000Z",
        selectedUnits: 2,
        selectedAssetCount: 2,
      }),
    ];
    const confirmer = new Confirmer();

    const summary = await runMMGDeliveryWindowController(
      "run-auto-confirm-1",
      dependencies(repository, confirmer),
    );

    expect(confirmer.calls).toEqual(["window-1:1"]);
    expect(summary.packagesAutoConfirmed).toBe(1);
  });

  it("never auto-confirms an expired first package", async () => {
    const repository = new Repository();
    repository.actionable = [
      window({
        type: "first_package",
        status: "open",
        opensAt: "2026-07-18T00:00:00.000Z",
        closesAt: "2026-07-20T11:00:00.000Z",
        selectedUnits: 2,
        selectedAssetCount: 2,
        fallbackPolicy: "manual_recovery",
      }),
    ];
    const confirmer = new Confirmer();

    const summary = await runMMGDeliveryWindowController(
      "run-first-expired-1",
      dependencies(repository, confirmer),
    );

    expect(confirmer.calls).toHaveLength(0);
    expect(repository.recoveries[0]).toContain(
      "FIRST_PACKAGE_CUSTOMER_SELECTION_EXPIRED",
    );
    expect(summary.recoveryRequired).toBe(1);
  });

  it("queues confirmed packages and records the dispatch ID", async () => {
    const repository = new Repository();
    repository.actionable = [window({ status: "confirmed" })];
    const deps = dependencies(repository);

    const summary = await runMMGDeliveryWindowController(
      "run-delivery-queue-1",
      deps,
    );

    expect(repository.deliveryReady).toEqual([
      "window-1:dispatch:window-1",
    ]);
    expect(summary.deliveryPackagesQueued).toBe(1);
  });
});
