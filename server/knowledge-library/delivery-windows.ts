import {
  getMMGSubscriptionPlan,
  type MMGSubscriptionPlanCode,
} from "./entitlements.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type MMGDeliveryWindowType =
  | "first_package"
  | "scheduled_package_review"
  | "manual_recovery_window";

export type MMGDeliveryWindowStatus =
  | "scheduled"
  | "open"
  | "confirmed"
  | "delivery_ready"
  | "delivered"
  | "closed"
  | "expired"
  | "canceled"
  | "recovery_required";

export type MMGWindowFallbackPolicy =
  | "manual_recovery"
  | "auto_confirm_current_selection";

export interface MMGDeliveryWindowScheduleInput {
  cycleId: string;
  planCode: MMGSubscriptionPlanCode;
  periodStart: string;
  periodEnd: string;
  initialSubscriptionCycle: boolean;
  reviewWindowHours?: number;
}

export interface MMGDeliveryWindowScheduleEntry {
  cycleId: string;
  packageSequence: number;
  type: MMGDeliveryWindowType;
  status: "scheduled";
  totalUnits: number;
  targetAssetCount: number;
  opensAt: string;
  closesAt: string;
  fallbackPolicy: MMGWindowFallbackPolicy;
}

export interface MMGDeliveryWindowRuntimeState {
  id: string;
  customerId: string;
  cycleId: string;
  packageSequence: number;
  type: MMGDeliveryWindowType;
  status: MMGDeliveryWindowStatus;
  totalUnits: number;
  targetAssetCount: number;
  selectedUnits: number;
  selectedAssetCount: number;
  version: number;
  opensAt: string | null;
  closesAt: string | null;
  fallbackPolicy: MMGWindowFallbackPolicy;
  deliveryDispatchId: string | null;
}

export type MMGDeliveryWindowAction =
  | { type: "none" }
  | { type: "open_first_package" }
  | { type: "curate_and_open" }
  | { type: "auto_confirm" }
  | { type: "move_to_recovery"; reason: string }
  | { type: "queue_delivery" };

export const MMG_DELIVERY_WINDOW_POLICY = Object.freeze({
  minimumReviewWindowHours: 24,
  maximumReviewWindowHours: 48,
  defaultReviewWindowHours: 48,
  packageOffsetsDays: Object.freeze({
    monthly: Object.freeze([0]),
    biweekly: Object.freeze([0, 14]),
    weekly: Object.freeze([0, 7, 14, 21]),
  }),
  firstPackageFallbackPolicy: "manual_recovery" as const,
  scheduledPackageFallbackPolicy: "auto_confirm_current_selection" as const,
});

const parseDate = (value: string, field: string): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`MMG_DELIVERY_WINDOW_INVALID_${field.toUpperCase()}`);
  }
  return parsed;
};

const normalizeReviewHours = (value: number | undefined): number => {
  const hours = value ?? MMG_DELIVERY_WINDOW_POLICY.defaultReviewWindowHours;
  if (
    !Number.isInteger(hours) ||
    hours < MMG_DELIVERY_WINDOW_POLICY.minimumReviewWindowHours ||
    hours > MMG_DELIVERY_WINDOW_POLICY.maximumReviewWindowHours
  ) {
    throw new Error("MMG_DELIVERY_WINDOW_REVIEW_HOURS_OUT_OF_RANGE");
  }
  return hours;
};

const iso = (value: Date): string => value.toISOString();

export const createMMGDeliveryWindowSchedule = (
  input: MMGDeliveryWindowScheduleInput,
): MMGDeliveryWindowScheduleEntry[] => {
  if (!input.cycleId.trim()) {
    throw new Error("MMG_DELIVERY_WINDOW_CYCLE_ID_REQUIRED");
  }

  const periodStart = parseDate(input.periodStart, "period_start");
  const periodEnd = parseDate(input.periodEnd, "period_end");
  if (periodEnd.getTime() <= periodStart.getTime()) {
    throw new Error("MMG_DELIVERY_WINDOW_PERIOD_INVALID");
  }

  const reviewHours = normalizeReviewHours(input.reviewWindowHours);
  const reviewDurationMs = reviewHours * HOUR_MS;
  const plan = getMMGSubscriptionPlan(input.planCode);
  const offsets = MMG_DELIVERY_WINDOW_POLICY.packageOffsetsDays[input.planCode];

  if (offsets.length !== plan.packagesPerBillingCycle) {
    throw new Error("MMG_DELIVERY_WINDOW_PLAN_SCHEDULE_MISMATCH");
  }

  const latestOpenAt = periodEnd.getTime() - reviewDurationMs;
  if (latestOpenAt < periodStart.getTime()) {
    throw new Error("MMG_DELIVERY_WINDOW_PERIOD_TOO_SHORT");
  }

  return offsets.map((offsetDays, index) => {
    const proposedOpenAt = periodStart.getTime() + offsetDays * DAY_MS;
    if (proposedOpenAt >= periodEnd.getTime()) {
      throw new Error("MMG_DELIVERY_WINDOW_PACKAGE_OUTSIDE_CYCLE");
    }

    const openAt = new Date(Math.min(proposedOpenAt, latestOpenAt));
    const closeAt = new Date(
      Math.min(openAt.getTime() + reviewDurationMs, periodEnd.getTime()),
    );
    const packageSequence = index + 1;
    const isFirstPackage =
      input.initialSubscriptionCycle && packageSequence === 1;

    return {
      cycleId: input.cycleId,
      packageSequence,
      type: isFirstPackage ? "first_package" : "scheduled_package_review",
      status: "scheduled",
      totalUnits: plan.assetsPerPackage,
      targetAssetCount: plan.assetsPerPackage,
      opensAt: iso(openAt),
      closesAt: iso(closeAt),
      fallbackPolicy: isFirstPackage
        ? MMG_DELIVERY_WINDOW_POLICY.firstPackageFallbackPolicy
        : MMG_DELIVERY_WINDOW_POLICY.scheduledPackageFallbackPolicy,
    };
  });
};

const isAtOrAfter = (now: Date, value: string | null): boolean => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && now.getTime() >= parsed.getTime();
};

const packageIsComplete = (window: MMGDeliveryWindowRuntimeState): boolean =>
  window.selectedAssetCount === window.targetAssetCount &&
  window.selectedUnits === window.totalUnits;

export const decideMMGDeliveryWindowAction = (
  window: MMGDeliveryWindowRuntimeState,
  now: Date,
): MMGDeliveryWindowAction => {
  switch (window.status) {
    case "scheduled":
      if (!isAtOrAfter(now, window.opensAt)) return { type: "none" };
      return window.type === "first_package"
        ? { type: "open_first_package" }
        : { type: "curate_and_open" };

    case "open":
      if (!isAtOrAfter(now, window.closesAt)) return { type: "none" };

      if (window.type === "first_package") {
        return {
          type: "move_to_recovery",
          reason: "FIRST_PACKAGE_CUSTOMER_SELECTION_EXPIRED",
        };
      }

      if (
        window.fallbackPolicy === "auto_confirm_current_selection" &&
        packageIsComplete(window)
      ) {
        return { type: "auto_confirm" };
      }

      return {
        type: "move_to_recovery",
        reason: packageIsComplete(window)
          ? "WINDOW_FALLBACK_POLICY_REQUIRES_RECOVERY"
          : "SCHEDULED_PACKAGE_INCOMPLETE_AT_EXPIRY",
      };

    case "confirmed":
      return window.deliveryDispatchId
        ? { type: "none" }
        : { type: "queue_delivery" };

    case "delivery_ready":
    case "delivered":
    case "closed":
    case "expired":
    case "canceled":
    case "recovery_required":
      return { type: "none" };

    default: {
      const exhaustive: never = window.status;
      throw new Error(`MMG_DELIVERY_WINDOW_UNKNOWN_STATUS:${String(exhaustive)}`);
    }
  }
};

export const validateMMGDeliveryWindowTransition = (
  from: MMGDeliveryWindowStatus,
  to: MMGDeliveryWindowStatus,
): void => {
  const allowed: Record<MMGDeliveryWindowStatus, readonly MMGDeliveryWindowStatus[]> = {
    scheduled: ["open", "canceled", "recovery_required"],
    open: ["confirmed", "expired", "closed", "canceled", "recovery_required"],
    confirmed: ["delivery_ready", "recovery_required"],
    delivery_ready: ["delivered", "recovery_required"],
    delivered: [],
    closed: ["recovery_required"],
    expired: ["recovery_required"],
    canceled: [],
    recovery_required: ["open", "canceled"],
  };

  if (!allowed[from].includes(to)) {
    throw new Error(`MMG_DELIVERY_WINDOW_TRANSITION_INVALID:${from}->${to}`);
  }
};
