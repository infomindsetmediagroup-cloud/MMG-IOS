import {
  getMMGSubscriptionPlan,
  type MMGSubscriptionPlanCode,
} from "../knowledge-library/entitlements.js";
import type { MMGEntitlementWindowStatus } from "../knowledge-library/eligibility.js";

export type MMGPortalSubscriptionStatus =
  | "pending"
  | "active"
  | "paused"
  | "canceled"
  | "expired";

export type MMGPortalSelectionState = "selected" | "reserved" | "confirmed";

export interface MMGPortalSelectionRecord {
  assetId: string;
  title: string;
  url: string;
  squareThumbnailUrl: string;
  topic: string;
  format: string;
  units: number;
  state: MMGPortalSelectionState;
}

export interface MMGPortalWindowRecord {
  id: string;
  packageSequence: number;
  type: "first_package" | "scheduled_package_review" | "manual_recovery_window";
  status: MMGEntitlementWindowStatus;
  totalUnits: number;
  targetAssetCount: number;
  opensAt: string | null;
  closesAt: string | null;
  confirmedAt: string | null;
  deliveryReadyAt: string | null;
  deliveredAt: string | null;
  deliveryReference: string | null;
  recoveryReason: string | null;
  selections: MMGPortalSelectionRecord[];
}

export interface MMGPortalCycleRecord {
  id: string;
  status: "scheduled" | "active" | "completed" | "canceled";
  startsAt: string;
  endsAt: string;
  totalPackages: number;
  confirmedPackages: number;
  totalUnits: number;
  consumedUnits: number;
  windows: MMGPortalWindowRecord[];
}

export interface MMGPortalSubscriptionRecord {
  status: MMGPortalSubscriptionStatus;
  planCode: MMGSubscriptionPlanCode;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cycle: MMGPortalCycleRecord | null;
  totalOwnedAssets: number;
}

export interface MMGPortalDashboardLinks {
  knowledgeLibraryUrl: string;
  selectionUrl: string;
  myLibraryUrl: string;
  membershipUrl: string;
  manageMembershipUrl: string;
  customerServiceUrl: string;
  subscriptionGuideUrl: string;
}

export type MMGPortalActionCode =
  | "choose_first_titles"
  | "review_package"
  | "view_delivery"
  | "recovery_required"
  | "await_next_package"
  | "renew_membership"
  | "manage_membership";

export interface MMGPortalDashboardAction {
  code: MMGPortalActionCode;
  label: string;
  description: string;
  href: string;
}

export interface MMGCustomerPortalSubscriptionDashboard {
  schemaVersion: "1.0.0";
  serverAuthority: "Kairos";
  membership: {
    status: MMGPortalSubscriptionStatus;
    active: boolean;
    plan: {
      code: MMGSubscriptionPlanCode;
      displayName: string;
      monthlyPrice: number;
      monthlyPriceCents: number;
      packagesPerBillingCycle: number;
      assetsPerPackage: number;
      assetsPerBillingCycle: number;
    };
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
  };
  progress: {
    totalPackages: number;
    completedPackages: number;
    remainingPackages: number;
    totalAssets: number;
    committedAssets: number;
    remainingAssets: number;
    totalOwnedAssets: number;
  };
  primaryAction: MMGPortalDashboardAction;
  currentPackage: {
    id: string;
    packageSequence: number;
    type: MMGPortalWindowRecord["type"];
    status: MMGEntitlementWindowStatus;
    opensAt: string | null;
    closesAt: string | null;
    confirmedAt: string | null;
    deliveryReadyAt: string | null;
    deliveredAt: string | null;
    recoveryReason: string | null;
    selectedAssetCount: number;
    targetAssetCount: number;
    selectedUnits: number;
    totalUnits: number;
    selections: MMGPortalSelectionRecord[];
    action: MMGPortalDashboardAction;
  } | null;
  packages: Array<{
    id: string;
    packageSequence: number;
    type: MMGPortalWindowRecord["type"];
    status: MMGEntitlementWindowStatus;
    opensAt: string | null;
    closesAt: string | null;
    confirmedAt: string | null;
    deliveryReadyAt: string | null;
    deliveredAt: string | null;
    deliveryReference: string | null;
    selections: MMGPortalSelectionRecord[];
  }>;
  links: MMGPortalDashboardLinks;
}

const integer = (value: number): number => Math.max(0, Math.trunc(value));

const windowPriority: Record<MMGEntitlementWindowStatus, number> = {
  recovery_required: 0,
  open: 1,
  delivery_ready: 2,
  confirmed: 3,
  scheduled: 4,
  delivered: 5,
  closed: 6,
  expired: 7,
  canceled: 8,
};

const chooseCurrentWindow = (
  windows: readonly MMGPortalWindowRecord[],
): MMGPortalWindowRecord | null =>
  [...windows].sort((left, right) => {
    const priority = windowPriority[left.status] - windowPriority[right.status];
    if (priority !== 0) return priority;
    return right.packageSequence - left.packageSequence;
  })[0] ?? null;

const actionFor = (
  subscription: MMGPortalSubscriptionRecord,
  window: MMGPortalWindowRecord | null,
  links: MMGPortalDashboardLinks,
): MMGPortalDashboardAction => {
  if (subscription.status !== "active") {
    return {
      code: "renew_membership",
      label: "View membership plans",
      description: "Restart your membership to open a new digital-asset entitlement cycle.",
      href: links.membershipUrl,
    };
  }

  if (!window) {
    return {
      code: "await_next_package",
      label: "Browse the Knowledge Library",
      description: "Your next package will appear here when its delivery window opens.",
      href: links.knowledgeLibraryUrl,
    };
  }

  if (window.status === "recovery_required") {
    return {
      code: "recovery_required",
      label: "Resolve this package",
      description: "This package needs support or an authorized recovery window before it can continue.",
      href: links.customerServiceUrl,
    };
  }

  if (window.status === "open") {
    const firstPackage = window.type === "first_package";
    return {
      code: firstPackage ? "choose_first_titles" : "review_package",
      label: firstPackage ? "Choose your first two titles" : "Review this package",
      description: firstPackage
        ? "Select and confirm exactly two eligible titles from the Knowledge Library."
        : "Accept the proposed titles or swap eligible replacements before the review window closes.",
      href: links.selectionUrl,
    };
  }

  if (["confirmed", "delivery_ready", "delivered"].includes(window.status)) {
    return {
      code: "view_delivery",
      label: "Open My Library",
      description:
        window.status === "delivered"
          ? "Your confirmed titles are available in My Library."
          : "Your confirmed package is being prepared for delivery.",
      href: links.myLibraryUrl,
    };
  }

  return {
    code: "await_next_package",
    label: "Browse the Knowledge Library",
    description: "This package is scheduled and will unlock when its window opens.",
    href: links.knowledgeLibraryUrl,
  };
};

export const buildMMGCustomerPortalSubscriptionDashboard = (input: {
  subscription: MMGPortalSubscriptionRecord;
  links: MMGPortalDashboardLinks;
}): MMGCustomerPortalSubscriptionDashboard => {
  const plan = getMMGSubscriptionPlan(input.subscription.planCode);
  const cycle = input.subscription.cycle;
  const windows = cycle?.windows ?? [];
  const currentWindow = chooseCurrentWindow(windows);
  const totalPackages = integer(cycle?.totalPackages ?? plan.packagesPerBillingCycle);
  const completedPackages = integer(
    cycle?.confirmedPackages ??
      windows.filter((window) =>
        ["confirmed", "delivery_ready", "delivered"].includes(window.status),
      ).length,
  );
  const totalAssets = integer(cycle?.totalUnits ?? plan.assetsPerBillingCycle);
  const committedAssets = integer(
    cycle?.consumedUnits ??
      windows.reduce(
        (sum, window) =>
          sum +
          window.selections
            .filter((selection) => selection.state === "confirmed")
            .reduce((selectionSum, selection) => selectionSum + integer(selection.units), 0),
        0,
      ),
  );
  const primaryAction = actionFor(input.subscription, currentWindow, input.links);

  return {
    schemaVersion: "1.0.0",
    serverAuthority: "Kairos",
    membership: {
      status: input.subscription.status,
      active: input.subscription.status === "active",
      plan: {
        code: plan.code,
        displayName: plan.displayName,
        monthlyPrice: plan.monthlyPrice,
        monthlyPriceCents: Math.round(plan.monthlyPrice * 100),
        packagesPerBillingCycle: plan.packagesPerBillingCycle,
        assetsPerPackage: plan.assetsPerPackage,
        assetsPerBillingCycle: plan.assetsPerBillingCycle,
      },
      currentPeriodStart: input.subscription.currentPeriodStart,
      currentPeriodEnd: input.subscription.currentPeriodEnd,
    },
    progress: {
      totalPackages,
      completedPackages: Math.min(totalPackages, completedPackages),
      remainingPackages: Math.max(0, totalPackages - completedPackages),
      totalAssets,
      committedAssets: Math.min(totalAssets, committedAssets),
      remainingAssets: Math.max(0, totalAssets - committedAssets),
      totalOwnedAssets: integer(input.subscription.totalOwnedAssets),
    },
    primaryAction,
    currentPackage: currentWindow
      ? {
          id: currentWindow.id,
          packageSequence: currentWindow.packageSequence,
          type: currentWindow.type,
          status: currentWindow.status,
          opensAt: currentWindow.opensAt,
          closesAt: currentWindow.closesAt,
          confirmedAt: currentWindow.confirmedAt,
          deliveryReadyAt: currentWindow.deliveryReadyAt,
          deliveredAt: currentWindow.deliveredAt,
          recoveryReason: currentWindow.recoveryReason,
          selectedAssetCount: currentWindow.selections.length,
          targetAssetCount: integer(currentWindow.targetAssetCount),
          selectedUnits: currentWindow.selections.reduce(
            (sum, selection) => sum + integer(selection.units),
            0,
          ),
          totalUnits: integer(currentWindow.totalUnits),
          selections: currentWindow.selections,
          action: primaryAction,
        }
      : null,
    packages: [...windows]
      .sort((left, right) => left.packageSequence - right.packageSequence)
      .map((window) => ({
        id: window.id,
        packageSequence: window.packageSequence,
        type: window.type,
        status: window.status,
        opensAt: window.opensAt,
        closesAt: window.closesAt,
        confirmedAt: window.confirmedAt,
        deliveryReadyAt: window.deliveryReadyAt,
        deliveredAt: window.deliveredAt,
        deliveryReference: window.deliveryReference,
        selections: window.selections,
      })),
    links: input.links,
  };
};
