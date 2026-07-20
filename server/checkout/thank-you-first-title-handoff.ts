import type { MMGSubscriptionPlanCode } from "../knowledge-library/entitlements.js";
import type { MMGEntitlementWindowStatus } from "../knowledge-library/eligibility.js";

export type MMGThankYouHandoffState =
  | "not_applicable"
  | "sign_in_required"
  | "activation_pending"
  | "ready"
  | "selection_in_progress"
  | "recovery_required"
  | "completed";

export interface MMGVerifiedThankYouOrderLine {
  productId: string;
  productHandle: string | null;
  variantId: string;
  sellingPlanId: string | null;
  properties: Record<string, string>;
}

export interface MMGVerifiedThankYouOrder {
  orderId: string;
  checkoutToken: string;
  shopDomain: string;
  customerId: string | null;
  createdAt: string;
  lines: MMGVerifiedThankYouOrderLine[];
}

export interface MMGThankYouFirstWindowSnapshot {
  id: string;
  type: "first_package" | "scheduled_package_review" | "manual_recovery_window";
  status: MMGEntitlementWindowStatus;
  selectedAssetCount: number;
  targetAssetCount: number;
  closesAt: string | null;
  recoveryReason: string | null;
}

export interface MMGThankYouEntitlementSnapshot {
  entitlementId: string;
  customerId: string;
  status: "pending" | "active" | "paused" | "canceled" | "expired";
  planCode: MMGSubscriptionPlanCode;
  firstWindow: MMGThankYouFirstWindowSnapshot | null;
}

export interface MMGThankYouHandoffLinks {
  selectionUrl: string;
  customerPortalUrl: string;
  myLibraryUrl: string;
  customerServiceUrl: string;
  membershipUrl: string;
}

export interface MMGThankYouHandoffSnapshot {
  schemaVersion: "1.0.0";
  state: MMGThankYouHandoffState;
  applicable: boolean;
  heading: string;
  message: string;
  action: {
    label: string;
    href: string;
  } | null;
  secondaryAction: {
    label: string;
    href: string;
  } | null;
  membership: {
    planCode: MMGSubscriptionPlanCode;
    planName: string;
  } | null;
  package: {
    status: MMGEntitlementWindowStatus;
    selectedAssetCount: number;
    targetAssetCount: number;
    closesAt: string | null;
  } | null;
}

export interface MMGThankYouHandoffInput {
  order: MMGVerifiedThankYouOrder;
  entitlement: MMGThankYouEntitlementSnapshot | null;
  links: MMGThankYouHandoffLinks;
  canonicalProductId: string | null;
  canonicalProductHandle: string;
}

const PLAN_NAMES: Record<MMGSubscriptionPlanCode, string> = {
  monthly: "Monthly",
  biweekly: "Bi-weekly",
  weekly: "Weekly",
};

const PLAN_CODES = new Set<MMGSubscriptionPlanCode>([
  "monthly",
  "biweekly",
  "weekly",
]);

const normalizePlanCode = (value: string | undefined): MMGSubscriptionPlanCode | null => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (normalized === "monthly") return "monthly";
  if (normalized === "biweekly") return "biweekly";
  if (normalized === "weekly") return "weekly";
  return null;
};

export const findMMGSubscriptionLine = (
  order: MMGVerifiedThankYouOrder,
  canonicalProductId: string | null,
  canonicalProductHandle: string,
): { line: MMGVerifiedThankYouOrderLine; planCode: MMGSubscriptionPlanCode } | null => {
  for (const line of order.lines) {
    const propertyPlan = normalizePlanCode(line.properties._mmg_subscription_plan_code);
    const handleMatches = line.productHandle === canonicalProductHandle;
    const idMatches = Boolean(canonicalProductId && line.productId === canonicalProductId);
    const hasSellingPlan = Boolean(line.sellingPlanId);

    if (!hasSellingPlan) continue;
    if (!handleMatches && !idMatches) continue;
    if (!propertyPlan || !PLAN_CODES.has(propertyPlan)) continue;

    return { line, planCode: propertyPlan };
  }

  return null;
};

const base = (
  state: MMGThankYouHandoffState,
  applicable: boolean,
  heading: string,
  message: string,
  action: MMGThankYouHandoffSnapshot["action"],
  secondaryAction: MMGThankYouHandoffSnapshot["secondaryAction"],
  membership: MMGThankYouHandoffSnapshot["membership"],
  packageSnapshot: MMGThankYouHandoffSnapshot["package"],
): MMGThankYouHandoffSnapshot => ({
  schemaVersion: "1.0.0",
  state,
  applicable,
  heading,
  message,
  action,
  secondaryAction,
  membership,
  package: packageSnapshot,
});

export const buildMMGThankYouFirstTitleHandoff = (
  input: MMGThankYouHandoffInput,
): MMGThankYouHandoffSnapshot => {
  const subscriptionLine = findMMGSubscriptionLine(
    input.order,
    input.canonicalProductId,
    input.canonicalProductHandle,
  );

  if (!subscriptionLine) {
    return base(
      "not_applicable",
      false,
      "",
      "",
      null,
      null,
      null,
      null,
    );
  }

  const planCode = input.entitlement?.planCode ?? subscriptionLine.planCode;
  const membership = {
    planCode,
    planName: PLAN_NAMES[planCode],
  };

  if (!input.order.customerId) {
    return base(
      "sign_in_required",
      true,
      "Your Knowledge Subscription is confirmed",
      "Sign in with the email used at checkout so Kairos can securely open your first two-title package.",
      {
        label: "Sign in to choose your titles",
        href: input.links.customerPortalUrl,
      },
      {
        label: "Browse the Knowledge Library",
        href: input.links.selectionUrl,
      },
      membership,
      null,
    );
  }

  if (!input.entitlement || input.entitlement.status === "pending") {
    return base(
      "activation_pending",
      true,
      "Your membership is being prepared",
      "Kairos is reconciling your subscription and opening your first two-title package. Your Customer Portal will update automatically when it is ready.",
      {
        label: "Open Customer Portal",
        href: input.links.customerPortalUrl,
      },
      {
        label: "Browse the Knowledge Library",
        href: input.links.selectionUrl,
      },
      membership,
      null,
    );
  }

  if (input.entitlement.status !== "active") {
    return base(
      "activation_pending",
      true,
      "Your membership needs attention",
      "Open the Customer Portal to review the current subscription status before selecting your first titles.",
      {
        label: "Review membership",
        href: input.links.customerPortalUrl,
      },
      {
        label: "Customer Service",
        href: input.links.customerServiceUrl,
      },
      membership,
      null,
    );
  }

  const firstWindow = input.entitlement.firstWindow;
  if (!firstWindow || firstWindow.status === "scheduled") {
    return base(
      "activation_pending",
      true,
      "Your first package is opening",
      "Your membership is active. Kairos is opening the secure window where you will choose your first two titles.",
      {
        label: "Open Customer Portal",
        href: input.links.customerPortalUrl,
      },
      null,
      membership,
      firstWindow
        ? {
            status: firstWindow.status,
            selectedAssetCount: firstWindow.selectedAssetCount,
            targetAssetCount: firstWindow.targetAssetCount,
            closesAt: firstWindow.closesAt,
          }
        : null,
    );
  }

  const packageSnapshot = {
    status: firstWindow.status,
    selectedAssetCount: firstWindow.selectedAssetCount,
    targetAssetCount: firstWindow.targetAssetCount,
    closesAt: firstWindow.closesAt,
  };

  if (firstWindow.status === "recovery_required") {
    return base(
      "recovery_required",
      true,
      "Your first package needs recovery",
      "The original selection window closed before the package was completed. Customer Service can authorize a new 24–48-hour recovery window.",
      {
        label: "Resolve this package",
        href: input.links.customerServiceUrl,
      },
      {
        label: "Open Customer Portal",
        href: input.links.customerPortalUrl,
      },
      membership,
      packageSnapshot,
    );
  }

  if (firstWindow.status === "open") {
    const hasStarted = firstWindow.selectedAssetCount > 0;
    return base(
      hasStarted ? "selection_in_progress" : "ready",
      true,
      hasStarted ? "Finish choosing your first two titles" : "Choose your first two titles",
      hasStarted
        ? `${firstWindow.selectedAssetCount} of ${firstWindow.targetAssetCount} titles are selected. Complete and confirm the package before the window closes.`
        : "Your first package is open. Select and confirm exactly two eligible digital titles from the Knowledge Library.",
      {
        label: hasStarted ? "Continue title selection" : "Choose your first two titles",
        href: input.links.selectionUrl,
      },
      {
        label: "Open Customer Portal",
        href: input.links.customerPortalUrl,
      },
      membership,
      packageSnapshot,
    );
  }

  if (["confirmed", "delivery_ready", "delivered"].includes(firstWindow.status)) {
    return base(
      "completed",
      true,
      firstWindow.status === "delivered"
        ? "Your first titles are in My Library"
        : "Your first package is confirmed",
      firstWindow.status === "delivered"
        ? "Open My Library to read or download the digital assets included in your first package."
        : "Kairos is preparing the confirmed package for delivery to My Library.",
      {
        label: "Open My Library",
        href: input.links.myLibraryUrl,
      },
      {
        label: "View membership progress",
        href: input.links.customerPortalUrl,
      },
      membership,
      packageSnapshot,
    );
  }

  return base(
    "activation_pending",
    true,
    "Open your Customer Portal",
    "Review the current package status and the next required action in your subscription dashboard.",
    {
      label: "Open Customer Portal",
      href: input.links.customerPortalUrl,
    },
    null,
    membership,
    packageSnapshot,
  );
};
