import { describe, expect, it } from "vitest";
import { createKairosRevenueProductBlueprint } from "../cloudflare/mmg-ios/src/kairos-revenue-product-blueprint-v1.js";
import { createKairosShopifyCommercePackage } from "../cloudflare/mmg-ios/src/kairos-shopify-commerce-package-v1.js";
import { evaluateKairosRevenueProduct } from "../cloudflare/mmg-ios/src/kairos-revenue-product-qa-v1.js";
import { approveKairosRevenueProduct, buildKairosRevenueProduct } from "../cloudflare/mmg-ios/src/kairos-revenue-engine-v1.js";

const blueprintInput = {
  productType: "digital_guide",
  title: "AI Video Prompt Mastery",
  objective: "Teach creators to build production-grade AI video prompts.",
  audience: "Creators and small businesses",
  price: 49,
  doctrineRefs: ["MMG Digital Asset Master Template Doctrine"],
};

const assets = [
  ["manuscript", "manuscript.md"], ["pdf", "guide.pdf"], ["docx", "guide.docx"],
  ["cover", "cover.png"], ["product_image", "product.png"],
].map(([type, filename], index) => ({ assetId: `asset_${index + 1}`, type, filename, version: 1, checksum: `sha256:${index}` }));

describe("Kairos revenue engine", () => {
  it("creates an immutable revenue blueprint with publication gates", () => {
    const blueprint = createKairosRevenueProductBlueprint(blueprintInput);
    expect(blueprint.requiredAssets).toContain("shopify_package");
    expect(blueprint.publicationApprovalRequired).toBe(true);
    expect(blueprint.commerceMutationAllowed).toBe(false);
    expect(Object.isFrozen(blueprint)).toBe(true);
  });

  it("builds a review-ready Shopify commerce package", () => {
    const blueprint = createKairosRevenueProductBlueprint(blueprintInput);
    const commerce = createKairosShopifyCommercePackage(blueprint, assets, { tags: ["AI", "Video"] });
    expect(commerce.product.handle).toBe("ai-video-prompt-mastery");
    expect(commerce.product.status).toBe("draft");
    expect(commerce.readyForReview).toBe(true);
    expect(commerce.externalPublicationAllowed).toBe(false);
  });

  it("fails QA when required assets are absent", () => {
    const blueprint = createKairosRevenueProductBlueprint(blueprintInput);
    const commerce = createKairosShopifyCommercePackage(blueprint, [], {});
    const qa = evaluateKairosRevenueProduct(blueprint, commerce, []);
    expect(qa.status).toBe("failed");
    expect(qa.readyForApproval).toBe(false);
    expect(qa.blockers.length).toBeGreaterThan(0);
  });

  it("assembles the multi-part revenue product and requires approval", () => {
    const product = buildKairosRevenueProduct({ blueprint: blueprintInput, assets });
    expect(product.state).toBe("approval");
    expect(product.qualityAssurance.status).toBe("passed");
    expect(product.nextAction.type).toBe("approve_product");
    expect(product.commerceMutationAllowed).toBe(false);
  });

  it("records approval without granting direct publication authority", () => {
    const product = buildKairosRevenueProduct({ blueprint: blueprintInput, assets });
    const approved = approveKairosRevenueProduct(product, { approvedByIdentityHash: "kid_12345678", rationale: "Approved for governed Shopify publication." });
    expect(approved.state).toBe("ready_to_publish");
    expect(approved.approval.status).toBe("approved");
    expect(approved.nextAction.type).toBe("governed_shopify_publish");
    expect(approved.externalPublicationAllowed).toBe(false);
  });
});
