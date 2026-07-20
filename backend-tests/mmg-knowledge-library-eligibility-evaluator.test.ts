import { describe, expect, it } from "vitest";
import {
  calculateRemainingUnits,
  evaluatePublicCatalogEligibility,
  evaluateSubscriptionSelectionEligibility,
  type MMGKnowledgeAssetCandidate,
  type MMGSubscriptionSelectionContext,
} from "../server/knowledge-library/eligibility.js";

const eligibleAsset = (): MMGKnowledgeAssetCandidate => ({
  assetId: "mmg-dd-ai-image-mastery-001",
  productType: "digital_download",
  assetStatus: "active",
  published: true,
  available: true,
  subscriptionEligible: true,
  subscriptionValue: 1,
  portraitCoverPresent: true,
  squareThumbnailPresent: true,
  deliveryPackageVerified: true,
  customerDestination: "my_library",
});

const openContext = (): MMGSubscriptionSelectionContext => ({
  authenticated: true,
  subscriptionActive: true,
  windowStatus: "open",
  totalUnits: 2,
  selectedUnits: 0,
  reservedUnits: 0,
  ownedAssetIds: new Set<string>(),
  selectedAssetIds: new Set<string>(),
});

describe("MMG Knowledge Library eligibility evaluator", () => {
  it("accepts a complete active digital download in the public catalog", () => {
    expect(evaluatePublicCatalogEligibility(eligibleAsset())).toEqual({
      state: "eligible",
      eligible: true,
      reasonCodes: ["ELIGIBLE"],
      remainingUnits: null,
      requiredUnits: null,
      serverDecisionRequired: true,
    });
  });

  it("rejects services and the subscription product as selectable assets", () => {
    for (const productType of ["service", "subscription"] as const) {
      const decision = evaluateSubscriptionSelectionEligibility(
        { ...eligibleAsset(), productType },
        openContext(),
      );
      expect(decision.eligible).toBe(false);
      expect(decision.state).toBe("ineligible");
      expect(decision.reasonCodes).toContain("NOT_DIGITAL_DOWNLOAD");
    }
  });

  it("accepts a complete one-unit asset inside an open two-unit window", () => {
    expect(
      evaluateSubscriptionSelectionEligibility(eligibleAsset(), openContext()),
    ).toEqual({
      state: "eligible",
      eligible: true,
      reasonCodes: ["ELIGIBLE"],
      remainingUnits: 2,
      requiredUnits: 1,
      serverDecisionRequired: true,
    });
  });

  it("excludes an asset the customer already owns", () => {
    const asset = eligibleAsset();
    const context = openContext();
    context.ownedAssetIds = new Set([asset.assetId as string]);

    const decision = evaluateSubscriptionSelectionEligibility(asset, context);
    expect(decision.eligible).toBe(false);
    expect(decision.state).toBe("ineligible");
    expect(decision.reasonCodes).toContain("ALREADY_OWNED");
  });

  it("blocks incomplete delivery metadata", () => {
    const decision = evaluateSubscriptionSelectionEligibility(
      {
        ...eligibleAsset(),
        squareThumbnailPresent: false,
        deliveryPackageVerified: false,
      },
      openContext(),
    );

    expect(decision.eligible).toBe(false);
    expect(decision.state).toBe("blocked");
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        "MISSING_SQUARE_THUMBNAIL",
        "MISSING_DELIVERY_PACKAGE",
      ]),
    );
  });

  it("blocks selection when the current window is unavailable", () => {
    const context = openContext();
    context.windowStatus = "closed";

    const decision = evaluateSubscriptionSelectionEligibility(
      eligibleAsset(),
      context,
    );
    expect(decision.eligible).toBe(false);
    expect(decision.state).toBe("blocked");
    expect(decision.reasonCodes).toContain("WINDOW_NOT_OPEN");
  });

  it("blocks selection when the asset costs more units than remain", () => {
    const context = openContext();
    context.selectedUnits = 1;
    const decision = evaluateSubscriptionSelectionEligibility(
      { ...eligibleAsset(), subscriptionValue: 2 },
      context,
    );

    expect(decision.remainingUnits).toBe(1);
    expect(decision.requiredUnits).toBe(2);
    expect(decision.eligible).toBe(false);
    expect(decision.reasonCodes).toContain("INSUFFICIENT_REMAINING_UNITS");
  });

  it("prevents the same asset from being selected twice in one window", () => {
    const asset = eligibleAsset();
    const context = openContext();
    context.selectedAssetIds = new Set([asset.assetId as string]);

    const decision = evaluateSubscriptionSelectionEligibility(asset, context);
    expect(decision.eligible).toBe(false);
    expect(decision.reasonCodes).toContain("ALREADY_SELECTED");
  });

  it("calculates remaining units without allowing negative capacity", () => {
    expect(calculateRemainingUnits(2, 1, 0)).toBe(1);
    expect(calculateRemainingUnits(2, 1, 1)).toBe(0);
    expect(calculateRemainingUnits(2, 4, 0)).toBe(0);
  });
});
