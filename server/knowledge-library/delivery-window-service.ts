import {
  createMMGDeliveryWindowSchedule,
  decideMMGDeliveryWindowAction,
  type MMGDeliveryWindowRuntimeState,
  type MMGDeliveryWindowScheduleEntry,
} from "./delivery-windows.js";
import type { MMGSubscriptionPlanCode } from "./entitlements.js";
import { executePickerCommand } from "./picker-service.js";
import type {
  MMGPickerPrincipal,
  MMGPickerStateRepository,
} from "./picker-service.js";

export interface MMGDeliveryWindowSubscription {
  id: string;
  customerId: string;
  planCode: MMGSubscriptionPlanCode;
  periodStart: string;
  periodEnd: string;
  initialSubscriptionCycle: boolean;
}

export interface MMGDeliveryWindowCandidate {
  assetId: string;
  title: string;
  topic: string;
  experienceLevel: string;
  format: string;
  series: string | null;
  seriesOrder: number | null;
  subscriptionValue: number;
}

export interface MMGDeliveryWindowProposal {
  assetIds: string[];
  source: "kairos" | "deterministic_fallback";
  rationale: string;
}

export interface MMGDeliveryWindowControllerRepository {
  beginRun(runId: string, startedAt: Date): Promise<"started" | "duplicate">;
  finishRun(
    runId: string,
    finishedAt: Date,
    summary: MMGDeliveryWindowRunSummary,
  ): Promise<void>;
  listSubscriptionsForReconciliation(
    now: Date,
    limit: number,
  ): Promise<MMGDeliveryWindowSubscription[]>;
  ensureCycleAndWindows(
    subscription: MMGDeliveryWindowSubscription,
    schedule: MMGDeliveryWindowScheduleEntry[],
    now: Date,
  ): Promise<{ cycleId: string; created: boolean; windowsCreated: number }>;
  listActionableWindows(
    now: Date,
    limit: number,
  ): Promise<MMGDeliveryWindowRuntimeState[]>;
  listCurationCandidates(
    window: MMGDeliveryWindowRuntimeState,
    limit: number,
  ): Promise<MMGDeliveryWindowCandidate[]>;
  openWindow(input: {
    window: MMGDeliveryWindowRuntimeState;
    selections: MMGDeliveryWindowProposal | null;
    openedAt: Date;
  }): Promise<"opened" | "version_conflict" | "already_processed">;
  moveWindowToRecovery(input: {
    window: MMGDeliveryWindowRuntimeState;
    reason: string;
    occurredAt: Date;
  }): Promise<"updated" | "version_conflict" | "already_processed">;
  markDeliveryReady(input: {
    window: MMGDeliveryWindowRuntimeState;
    dispatchId: string;
    occurredAt: Date;
  }): Promise<"updated" | "version_conflict" | "already_processed">;
  markDelivered(input: {
    windowId: string;
    deliveryReference: string;
    occurredAt: Date;
  }): Promise<"updated" | "not_found" | "already_delivered">;
  reopenRecoveryWindow(input: {
    windowId: string;
    reviewWindowHours: number;
    occurredAt: Date;
  }): Promise<"opened" | "not_found" | "invalid_state">;
  recordWindowFailure(input: {
    window: MMGDeliveryWindowRuntimeState;
    code: string;
    message: string;
    occurredAt: Date;
  }): Promise<void>;
}

export interface MMGDeliveryWindowCurator {
  curate(input: {
    window: MMGDeliveryWindowRuntimeState;
    candidates: MMGDeliveryWindowCandidate[];
  }): Promise<MMGDeliveryWindowProposal | null>;
}

export interface MMGDeliveryDispatcher {
  queue(input: {
    windowId: string;
    customerId: string;
    cycleId: string;
    packageSequence: number;
  }): Promise<{ dispatchId: string }>;
}

export interface MMGDeliveryWindowConfirmationService {
  confirm(input: {
    customerId: string;
    windowId: string;
    expectedWindowVersion: number;
    requestId: string;
    occurredAt: Date;
  }): Promise<"confirmed" | "idempotent" | "version_conflict" | "rejected">;
}

export interface MMGDeliveryWindowRunSummary {
  schemaVersion: "1.0.0";
  runId: string;
  duplicateRun: boolean;
  subscriptionsReconciled: number;
  cyclesCreated: number;
  windowsCreated: number;
  firstPackagesOpened: number;
  curatedPackagesOpened: number;
  packagesAutoConfirmed: number;
  deliveryPackagesQueued: number;
  recoveryRequired: number;
  conflicts: number;
  failures: number;
}

export interface MMGDeliveryWindowControllerDependencies {
  repository: MMGDeliveryWindowControllerRepository;
  curator: MMGDeliveryWindowCurator;
  confirmer: MMGDeliveryWindowConfirmationService;
  dispatcher: MMGDeliveryDispatcher;
  now: () => Date;
  reviewWindowHours?: number;
  batchSize?: number;
}

const emptySummary = (runId: string): MMGDeliveryWindowRunSummary => ({
  schemaVersion: "1.0.0",
  runId,
  duplicateRun: false,
  subscriptionsReconciled: 0,
  cyclesCreated: 0,
  windowsCreated: 0,
  firstPackagesOpened: 0,
  curatedPackagesOpened: 0,
  packagesAutoConfirmed: 0,
  deliveryPackagesQueued: 0,
  recoveryRequired: 0,
  conflicts: 0,
  failures: 0,
});

const conflict = (
  value: "version_conflict" | "already_processed" | "opened" | "updated",
): boolean => value === "version_conflict";

export class MMGDeterministicEligibleCurator implements MMGDeliveryWindowCurator {
  async curate(input: {
    window: MMGDeliveryWindowRuntimeState;
    candidates: MMGDeliveryWindowCandidate[];
  }): Promise<MMGDeliveryWindowProposal | null> {
    const sorted = [...input.candidates].sort((left, right) => {
      const series = (left.series ?? "").localeCompare(right.series ?? "");
      if (series !== 0) return series;
      const leftOrder = left.seriesOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.seriesOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.title.localeCompare(right.title);
    });

    const selected: MMGDeliveryWindowCandidate[] = [];
    const search = (start: number, remainingUnits: number): boolean => {
      if (
        selected.length === input.window.targetAssetCount &&
        remainingUnits === 0
      ) {
        return true;
      }
      if (
        selected.length >= input.window.targetAssetCount ||
        remainingUnits <= 0
      ) {
        return false;
      }

      for (let index = start; index < sorted.length; index += 1) {
        const candidate = sorted[index];
        const units = Math.max(1, Math.trunc(candidate.subscriptionValue));
        if (units > remainingUnits) continue;
        selected.push(candidate);
        if (search(index + 1, remainingUnits - units)) return true;
        selected.pop();
      }
      return false;
    };

    if (!search(0, input.window.totalUnits)) return null;

    return {
      assetIds: selected.map((candidate) => candidate.assetId),
      source: "deterministic_fallback",
      rationale:
        "Selected from the current server-eligible catalog using deterministic series order and title order. Kairos recommendation ranking may replace this fallback without changing the controller contract.",
    };
  }
}

export class MMGPickerWindowConfirmationAdapter
  implements MMGDeliveryWindowConfirmationService
{
  readonly #repository: MMGPickerStateRepository;

  constructor(repository: MMGPickerStateRepository) {
    this.#repository = repository;
  }

  async confirm(input: {
    customerId: string;
    windowId: string;
    expectedWindowVersion: number;
    requestId: string;
    occurredAt: Date;
  }): Promise<"confirmed" | "idempotent" | "version_conflict" | "rejected"> {
    const principal: MMGPickerPrincipal = {
      customerId: input.customerId,
      sessionId: `delivery-controller:${input.requestId}`,
    };
    const current = await this.#repository.load(principal);
    if (!current || current.window.id !== input.windowId) return "rejected";

    const response = await executePickerCommand(
      this.#repository,
      principal,
      {
        action: "confirm",
        requestId: input.requestId,
        expectedWindowVersion: input.expectedWindowVersion,
      },
      input.occurredAt,
    );

    if (!response.body.ok) {
      return response.body.error.code === "WINDOW_VERSION_CONFLICT"
        ? "version_conflict"
        : "rejected";
    }

    return response.body.mutation?.idempotentReplay
      ? "idempotent"
      : "confirmed";
  }
}

const normalizeRunId = (value: string): string => {
  const runId = value.trim();
  if (runId.length < 8 || runId.length > 128) {
    throw new Error("MMG_DELIVERY_WINDOW_RUN_ID_INVALID");
  }
  return runId;
};

export const runMMGDeliveryWindowController = async (
  runIdInput: string,
  dependencies: MMGDeliveryWindowControllerDependencies,
): Promise<MMGDeliveryWindowRunSummary> => {
  const runId = normalizeRunId(runIdInput);
  const now = dependencies.now();
  const batchSize = Math.max(1, Math.min(500, dependencies.batchSize ?? 100));
  const summary = emptySummary(runId);

  const begin = await dependencies.repository.beginRun(runId, now);
  if (begin === "duplicate") {
    return { ...summary, duplicateRun: true };
  }

  try {
    const subscriptions =
      await dependencies.repository.listSubscriptionsForReconciliation(
        now,
        batchSize,
      );

    for (const subscription of subscriptions) {
      const provisionalSchedule = createMMGDeliveryWindowSchedule({
        cycleId: `subscription:${subscription.id}:${subscription.periodStart}`,
        planCode: subscription.planCode,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
        initialSubscriptionCycle: subscription.initialSubscriptionCycle,
        reviewWindowHours: dependencies.reviewWindowHours,
      });
      const ensured = await dependencies.repository.ensureCycleAndWindows(
        subscription,
        provisionalSchedule,
        now,
      );
      summary.subscriptionsReconciled += 1;
      summary.cyclesCreated += ensured.created ? 1 : 0;
      summary.windowsCreated += ensured.windowsCreated;
    }

    const windows = await dependencies.repository.listActionableWindows(
      now,
      batchSize,
    );

    for (const window of windows) {
      const action = decideMMGDeliveryWindowAction(window, now);
      if (action.type === "none") continue;

      try {
        switch (action.type) {
          case "open_first_package": {
            const result = await dependencies.repository.openWindow({
              window,
              selections: null,
              openedAt: now,
            });
            if (conflict(result)) summary.conflicts += 1;
            else if (result === "opened") summary.firstPackagesOpened += 1;
            break;
          }

          case "curate_and_open": {
            const candidates =
              await dependencies.repository.listCurationCandidates(window, 250);
            const proposal = await dependencies.curator.curate({
              window,
              candidates,
            });

            if (!proposal) {
              const result = await dependencies.repository.moveWindowToRecovery({
                window,
                reason: "NO_COMPLETE_ELIGIBLE_CURATED_PACKAGE",
                occurredAt: now,
              });
              if (conflict(result)) summary.conflicts += 1;
              else if (result === "updated") summary.recoveryRequired += 1;
              break;
            }

            const result = await dependencies.repository.openWindow({
              window,
              selections: proposal,
              openedAt: now,
            });
            if (conflict(result)) summary.conflicts += 1;
            else if (result === "opened") summary.curatedPackagesOpened += 1;
            break;
          }

          case "auto_confirm": {
            const result = await dependencies.confirmer.confirm({
              customerId: window.customerId,
              windowId: window.id,
              expectedWindowVersion: window.version,
              requestId: `delivery-expiry:${window.id}:${window.version}`,
              occurredAt: now,
            });
            if (result === "version_conflict") summary.conflicts += 1;
            else if (result === "confirmed" || result === "idempotent") {
              summary.packagesAutoConfirmed += 1;
            } else {
              const recovery =
                await dependencies.repository.moveWindowToRecovery({
                  window,
                  reason: "AUTO_CONFIRM_REVALIDATION_FAILED",
                  occurredAt: now,
                });
              if (conflict(recovery)) summary.conflicts += 1;
              else if (recovery === "updated") summary.recoveryRequired += 1;
            }
            break;
          }

          case "move_to_recovery": {
            const result = await dependencies.repository.moveWindowToRecovery({
              window,
              reason: action.reason,
              occurredAt: now,
            });
            if (conflict(result)) summary.conflicts += 1;
            else if (result === "updated") summary.recoveryRequired += 1;
            break;
          }

          case "queue_delivery": {
            const dispatch = await dependencies.dispatcher.queue({
              windowId: window.id,
              customerId: window.customerId,
              cycleId: window.cycleId,
              packageSequence: window.packageSequence,
            });
            const result = await dependencies.repository.markDeliveryReady({
              window,
              dispatchId: dispatch.dispatchId,
              occurredAt: now,
            });
            if (conflict(result)) summary.conflicts += 1;
            else if (result === "updated") summary.deliveryPackagesQueued += 1;
            break;
          }

          default: {
            const exhaustive: never = action;
            throw new Error(`MMG_DELIVERY_WINDOW_ACTION_UNKNOWN:${String(exhaustive)}`);
          }
        }
      } catch (error) {
        summary.failures += 1;
        const message = error instanceof Error ? error.message : String(error);
        await dependencies.repository.recordWindowFailure({
          window,
          code: "DELIVERY_WINDOW_ACTION_FAILED",
          message,
          occurredAt: now,
        });
      }
    }

    await dependencies.repository.finishRun(runId, dependencies.now(), summary);
    return summary;
  } catch (error) {
    summary.failures += 1;
    await dependencies.repository.finishRun(runId, dependencies.now(), summary);
    throw error;
  }
};
