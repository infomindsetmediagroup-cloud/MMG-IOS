import { calculateRemainingUnits, type MMGEntitlementWindowStatus } from "./eligibility.js";

export type MMGSubscriptionPlanCode = "monthly" | "biweekly" | "weekly";
export type MMGEntitlementCycleStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "canceled";
export type MMGEntitlementSelectionState =
  | "selected"
  | "reserved"
  | "confirmed";

export interface MMGSubscriptionPlanDefinition {
  code: MMGSubscriptionPlanCode;
  displayName: string;
  monthlyPrice: number;
  packagesPerBillingCycle: number;
  assetsPerPackage: number;
  assetsPerBillingCycle: number;
}

export const MMG_SUBSCRIPTION_PLANS: Readonly<
  Record<MMGSubscriptionPlanCode, MMGSubscriptionPlanDefinition>
> = Object.freeze({
  monthly: Object.freeze({
    code: "monthly",
    displayName: "Monthly",
    monthlyPrice: 14.95,
    packagesPerBillingCycle: 1,
    assetsPerPackage: 2,
    assetsPerBillingCycle: 2,
  }),
  biweekly: Object.freeze({
    code: "biweekly",
    displayName: "Bi-weekly",
    monthlyPrice: 24.95,
    packagesPerBillingCycle: 2,
    assetsPerPackage: 2,
    assetsPerBillingCycle: 4,
  }),
  weekly: Object.freeze({
    code: "weekly",
    displayName: "Weekly",
    monthlyPrice: 39.95,
    packagesPerBillingCycle: 4,
    assetsPerPackage: 2,
    assetsPerBillingCycle: 8,
  }),
});

export interface MMGEntitlementCycleInput {
  id: string;
  planCode: MMGSubscriptionPlanCode;
  status: MMGEntitlementCycleStatus;
  startsAt: string;
  endsAt: string;
  totalPackages: number;
  totalUnits: number;
  version: number;
}

export interface MMGEntitlementWindowSelectionInput {
  assetId: string;
  units: number;
  state: MMGEntitlementSelectionState;
}

export interface MMGEntitlementWindowInput {
  id: string;
  packageSequence: number;
  type: "first_package" | "scheduled_package_review" | "manual_recovery_window";
  status: MMGEntitlementWindowStatus;
  totalUnits: number;
  targetAssetCount: number;
  version: number;
  opensAt: string | null;
  closesAt: string | null;
  confirmedAt: string | null;
  selections: MMGEntitlementWindowSelectionInput[];
}

export interface MMGEntitlementCounterSnapshot {
  schemaVersion: "1.0.0";
  plan: MMGSubscriptionPlanDefinition;
  cycle: {
    id: string;
    status: MMGEntitlementCycleStatus;
    startsAt: string;
    endsAt: string;
    version: number;
  };
  packages: {
    total: number;
    opened: number;
    confirmed: number;
    remaining: number;
  };
  assets: {
    totalUnits: number;
    selectedUnits: number;
    reservedUnits: number;
    confirmedUnits: number;
    deliveredUnits: number;
    committedUnits: number;
    remainingUnits: number;
  };
  currentWindow: {
    id: string;
    packageSequence: number;
    type: MMGEntitlementWindowInput["type"];
    status: MMGEntitlementWindowStatus;
    totalUnits: number;
    selectedUnits: number;
    reservedUnits: number;
    confirmedUnits: number;
    remainingUnits: number;
    targetAssetCount: number;
    selectedAssetCount: number;
    version: number;
    opensAt: string | null;
    closesAt: string | null;
    confirmedAt: string | null;
  } | null;
}

const integer = (value: number): number => Math.max(0, Math.trunc(value));

export const getMMGSubscriptionPlan = (
  code: MMGSubscriptionPlanCode,
): MMGSubscriptionPlanDefinition => MMG_SUBSCRIPTION_PLANS[code];

const unitsForState = (
  selections: readonly MMGEntitlementWindowSelectionInput[],
  state: MMGEntitlementSelectionState,
): number =>
  selections
    .filter((selection) => selection.state === state)
    .reduce((sum, selection) => sum + integer(selection.units), 0);

const chooseCurrentWindow = (
  windows: readonly MMGEntitlementWindowInput[],
): MMGEntitlementWindowInput | null => {
  const priority: Record<MMGEntitlementWindowStatus, number> = {
    open: 0,
    scheduled: 1,
    confirmed: 2,
    closed: 3,
    expired: 4,
    canceled: 5,
  };

  return (
    [...windows].sort((left, right) => {
      const statusOrder = priority[left.status] - priority[right.status];
      if (statusOrder !== 0) return statusOrder;
      return right.packageSequence - left.packageSequence;
    })[0] ?? null
  );
};

export const buildMMGEntitlementCounter = (input: {
  cycle: MMGEntitlementCycleInput;
  windows: MMGEntitlementWindowInput[];
  deliveredUnits: number;
}): MMGEntitlementCounterSnapshot => {
  const plan = getMMGSubscriptionPlan(input.cycle.planCode);
  const totalPackages = integer(input.cycle.totalPackages);
  const totalUnits = integer(input.cycle.totalUnits);

  if (
    totalPackages !== plan.packagesPerBillingCycle ||
    totalUnits !== plan.assetsPerBillingCycle
  ) {
    throw new Error("MMG_ENTITLEMENT_CYCLE_PLAN_MISMATCH");
  }

  const opened = input.windows.filter((window) =>
    ["open", "confirmed", "closed", "expired"].includes(window.status),
  ).length;
  const confirmed = input.windows.filter(
    (window) => window.status === "confirmed",
  ).length;
  const selectedUnits = input.windows.reduce(
    (sum, window) => sum + unitsForState(window.selections, "selected"),
    0,
  );
  const reservedUnits = input.windows.reduce(
    (sum, window) => sum + unitsForState(window.selections, "reserved"),
    0,
  );
  const confirmedUnits = input.windows.reduce(
    (sum, window) => sum + unitsForState(window.selections, "confirmed"),
    0,
  );
  const committedUnits = selectedUnits + reservedUnits + confirmedUnits;
  const currentWindow = chooseCurrentWindow(input.windows);

  let currentWindowSnapshot: MMGEntitlementCounterSnapshot["currentWindow"] = null;
  if (currentWindow) {
    const windowSelectedUnits = unitsForState(
      currentWindow.selections,
      "selected",
    );
    const windowReservedUnits = unitsForState(
      currentWindow.selections,
      "reserved",
    );
    const windowConfirmedUnits = unitsForState(
      currentWindow.selections,
      "confirmed",
    );

    currentWindowSnapshot = {
      id: currentWindow.id,
      packageSequence: currentWindow.packageSequence,
      type: currentWindow.type,
      status: currentWindow.status,
      totalUnits: integer(currentWindow.totalUnits),
      selectedUnits: windowSelectedUnits,
      reservedUnits: windowReservedUnits,
      confirmedUnits: windowConfirmedUnits,
      remainingUnits: calculateRemainingUnits(
        currentWindow.totalUnits,
        windowSelectedUnits + windowConfirmedUnits,
        windowReservedUnits,
      ),
      targetAssetCount: integer(currentWindow.targetAssetCount),
      selectedAssetCount: currentWindow.selections.filter((selection) =>
        ["selected", "reserved", "confirmed"].includes(selection.state),
      ).length,
      version: integer(currentWindow.version),
      opensAt: currentWindow.opensAt,
      closesAt: currentWindow.closesAt,
      confirmedAt: currentWindow.confirmedAt,
    };
  }

  return {
    schemaVersion: "1.0.0",
    plan,
    cycle: {
      id: input.cycle.id,
      status: input.cycle.status,
      startsAt: input.cycle.startsAt,
      endsAt: input.cycle.endsAt,
      version: integer(input.cycle.version),
    },
    packages: {
      total: totalPackages,
      opened: Math.min(totalPackages, opened),
      confirmed: Math.min(totalPackages, confirmed),
      remaining: Math.max(0, totalPackages - confirmed),
    },
    assets: {
      totalUnits,
      selectedUnits,
      reservedUnits,
      confirmedUnits,
      deliveredUnits: Math.min(totalUnits, integer(input.deliveredUnits)),
      committedUnits,
      remainingUnits: Math.max(0, totalUnits - committedUnits),
    },
    currentWindow: currentWindowSnapshot,
  };
};
