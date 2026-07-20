export type MMGProductType =
  | "digital_download"
  | "service"
  | "subscription";

export type MMGAssetStatus = "draft" | "approved" | "active" | "retired";

export type MMGCustomerDestination =
  | "my_library"
  | "my_projects"
  | "subscription_dashboard";

export type MMGEntitlementWindowStatus =
  | "scheduled"
  | "open"
  | "confirmed"
  | "delivery_ready"
  | "delivered"
  | "closed"
  | "expired"
  | "canceled"
  | "recovery_required";

export type MMGEligibilityReasonCode =
  | "ELIGIBLE"
  | "NOT_DIGITAL_DOWNLOAD"
  | "NOT_PUBLISHED"
  | "NOT_AVAILABLE"
  | "ASSET_NOT_ACTIVE"
  | "MISSING_ASSET_ID"
  | "NOT_SUBSCRIPTION_ELIGIBLE"
  | "MISSING_PORTRAIT_COVER"
  | "MISSING_SQUARE_THUMBNAIL"
  | "INVALID_SUBSCRIPTION_VALUE"
  | "MISSING_DELIVERY_PACKAGE"
  | "WRONG_CUSTOMER_DESTINATION"
  | "CUSTOMER_NOT_AUTHENTICATED"
  | "SUBSCRIPTION_NOT_ACTIVE"
  | "ALREADY_OWNED"
  | "WINDOW_NOT_OPEN"
  | "INSUFFICIENT_REMAINING_UNITS"
  | "ALREADY_SELECTED"
  | "ASSET_RETIRED";

export type MMGEligibilityState = "eligible" | "ineligible" | "blocked";

export interface MMGKnowledgeAssetCandidate {
  assetId: string | null;
  productType: MMGProductType | string | null;
  assetStatus: MMGAssetStatus | string | null;
  published: boolean;
  available: boolean;
  subscriptionEligible: boolean;
  subscriptionValue: number | null;
  portraitCoverPresent: boolean;
  squareThumbnailPresent: boolean;
  deliveryPackageVerified: boolean;
  customerDestination: MMGCustomerDestination | string | null;
}

export interface MMGSubscriptionSelectionContext {
  authenticated: boolean;
  subscriptionActive: boolean;
  windowStatus: MMGEntitlementWindowStatus;
  totalUnits: number;
  selectedUnits: number;
  reservedUnits: number;
  ownedAssetIds: ReadonlySet<string>;
  selectedAssetIds: ReadonlySet<string>;
}

export interface MMGEligibilityDecision {
  state: MMGEligibilityState;
  eligible: boolean;
  reasonCodes: MMGEligibilityReasonCode[];
  remainingUnits: number | null;
  requiredUnits: number | null;
  serverDecisionRequired: true;
}

const permanentIneligibilityReasons = new Set<MMGEligibilityReasonCode>([
  "NOT_DIGITAL_DOWNLOAD",
  "ASSET_RETIRED",
  "NOT_SUBSCRIPTION_ELIGIBLE",
  "WRONG_CUSTOMER_DESTINATION",
  "ALREADY_OWNED",
]);

const unique = <T>(values: T[]): T[] => [...new Set(values)];

export const calculateRemainingUnits = (
  totalUnits: number,
  selectedUnits: number,
  reservedUnits: number,
): number =>
  Math.max(
    0,
    Math.trunc(totalUnits) - Math.trunc(selectedUnits) - Math.trunc(reservedUnits),
  );

const decisionFromReasons = (
  reasonCodes: MMGEligibilityReasonCode[],
  remainingUnits: number | null,
  requiredUnits: number | null,
): MMGEligibilityDecision => {
  const normalized = unique(reasonCodes);

  if (normalized.length === 0) {
    return {
      state: "eligible",
      eligible: true,
      reasonCodes: ["ELIGIBLE"],
      remainingUnits,
      requiredUnits,
      serverDecisionRequired: true,
    };
  }

  return {
    state: normalized.some((reason) => permanentIneligibilityReasons.has(reason))
      ? "ineligible"
      : "blocked",
    eligible: false,
    reasonCodes: normalized,
    remainingUnits,
    requiredUnits,
    serverDecisionRequired: true,
  };
};

const publicCatalogReasons = (
  asset: MMGKnowledgeAssetCandidate,
): MMGEligibilityReasonCode[] => {
  const reasons: MMGEligibilityReasonCode[] = [];

  if (asset.productType !== "digital_download") {
    reasons.push("NOT_DIGITAL_DOWNLOAD");
  }
  if (!asset.published) reasons.push("NOT_PUBLISHED");
  if (!asset.available) reasons.push("NOT_AVAILABLE");

  if (asset.assetStatus === "retired") {
    reasons.push("ASSET_RETIRED");
  } else if (asset.assetStatus !== "active") {
    reasons.push("ASSET_NOT_ACTIVE");
  }

  if (!asset.assetId?.trim()) reasons.push("MISSING_ASSET_ID");
  if (!asset.portraitCoverPresent) reasons.push("MISSING_PORTRAIT_COVER");
  if (asset.customerDestination !== "my_library") {
    reasons.push("WRONG_CUSTOMER_DESTINATION");
  }

  return reasons;
};

export const evaluatePublicCatalogEligibility = (
  asset: MMGKnowledgeAssetCandidate,
): MMGEligibilityDecision =>
  decisionFromReasons(publicCatalogReasons(asset), null, null);

export const evaluateSubscriptionSelectionEligibility = (
  asset: MMGKnowledgeAssetCandidate,
  context: MMGSubscriptionSelectionContext,
): MMGEligibilityDecision => {
  const reasons = publicCatalogReasons(asset);
  const requiredUnits =
    Number.isInteger(asset.subscriptionValue) && Number(asset.subscriptionValue) >= 1
      ? Number(asset.subscriptionValue)
      : null;
  const remainingUnits = calculateRemainingUnits(
    context.totalUnits,
    context.selectedUnits,
    context.reservedUnits,
  );

  if (!asset.subscriptionEligible) {
    reasons.push("NOT_SUBSCRIPTION_ELIGIBLE");
  }
  if (!asset.squareThumbnailPresent) {
    reasons.push("MISSING_SQUARE_THUMBNAIL");
  }
  if (requiredUnits === null) {
    reasons.push("INVALID_SUBSCRIPTION_VALUE");
  }
  if (!asset.deliveryPackageVerified) {
    reasons.push("MISSING_DELIVERY_PACKAGE");
  }
  if (!context.authenticated) {
    reasons.push("CUSTOMER_NOT_AUTHENTICATED");
  }
  if (!context.subscriptionActive) {
    reasons.push("SUBSCRIPTION_NOT_ACTIVE");
  }
  if (context.windowStatus !== "open") {
    reasons.push("WINDOW_NOT_OPEN");
  }

  const assetId = asset.assetId?.trim() || null;
  if (assetId && context.ownedAssetIds.has(assetId)) {
    reasons.push("ALREADY_OWNED");
  }
  if (assetId && context.selectedAssetIds.has(assetId)) {
    reasons.push("ALREADY_SELECTED");
  }
  if (requiredUnits !== null && requiredUnits > remainingUnits) {
    reasons.push("INSUFFICIENT_REMAINING_UNITS");
  }

  return decisionFromReasons(reasons, remainingUnits, requiredUnits);
};
