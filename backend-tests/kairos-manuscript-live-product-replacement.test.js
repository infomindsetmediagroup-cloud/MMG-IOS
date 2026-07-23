import { describe, expect, it } from "vitest";
import { buildLiveProductReplacementPlan } from "../cloudflare/mmg-ios/src/kairos-manuscript-live-product-replacement-v1.js";

function pipeline(overrides = {}) {
  return {
    status: "production-ready",
    metadata: {
      title: "AI Image Mastery",
      author: "Michael King",
      description: "A practical guide to creating better AI images.",
      productType: "Digital Download",
      templateSuffix: "mmg-ai-image-mastery",
      ...overrides.metadata,
    },
    vault: {
      integrity: { passed: true, assetCount: 4 },
      packageDownloadURL: "/api/admin-asset-vault/projects/manuscript-studio-12345678/package",
      assets: [
        {
          assetId: "approved-cover-111",
          filename: "approved-cover.png",
          role: "APPROVED_COVER",
          downloadURL: "/api/admin-asset-vault/projects/manuscript-studio-12345678/assets/approved-cover-111",
        },
        {
          assetId: "product-hero-222",
          filename: "product-hero.svg",
          role: "PRODUCT_ASSET",
          downloadURL: "/api/admin-asset-vault/projects/manuscript-studio-12345678/assets/product-hero-222",
        },
        {
          assetId: "social-square-333",
          filename: "social-square.svg",
          role: "PRODUCT_ASSET",
          downloadURL: "/api/admin-asset-vault/projects/manuscript-studio-12345678/assets/social-square-333",
        },
        {
          assetId: "zip-444",
          filename: "complete-production-package.zip",
          role: "FINAL_PRODUCTION_ZIP",
          downloadURL: "/api/admin-asset-vault/projects/manuscript-studio-12345678/assets/zip-444",
        },
      ],
      ...overrides.vault,
    },
  };
}

function product(overrides = {}) {
  return {
    id: "gid://shopify/Product/123456789",
    title: "AI Image Mastery™ — Existing Edition",
    handle: "ai-image-mastery",
    descriptionHtml: "<p>Existing product.</p>",
    productType: "Digital Download",
    tags: ["existing"],
    status: "ACTIVE",
    templateSuffix: "mmg-ai-image-mastery",
    updatedAt: "2026-07-22T20:00:00Z",
    seo: { title: "Existing", description: "Existing description" },
    variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", price: "9.95" }] },
    media: { nodes: [{ id: "gid://shopify/MediaImage/1" }] },
    ...overrides,
  };
}

const productPackage = {
  title: "AI Image Mastery",
  handle: "ai-image-mastery",
  productType: "Book",
  tags: ["Mindset Media Group", "AI images", "digital guide"],
  shopifyHTML: "<div class=\"mmg-book-product\"><h2>Direct better AI images.</h2></div>",
  seo: {
    title: "AI Image Mastery | Mindset Media Group",
    metaDescription: "Build clearer prompts and more intentional AI-generated visuals.",
  },
};

describe("controlled live Shopify product replacement", () => {
  it("preserves the active product identity, handle, price, and digital-product classification", () => {
    const plan = buildLiveProductReplacementPlan({
      pipeline: pipeline(),
      productPackage,
      currentProduct: product(),
      origin: "https://mmg-ios.info-mindsetmediagroup.workers.dev",
    });

    expect(plan.desired.title).toBe("AI Image Mastery");
    expect(plan.desired.handle).toBe("ai-image-mastery");
    expect(plan.desired.status).toBe("ACTIVE");
    expect(plan.desired.price).toBe("9.95");
    expect(plan.desired.productType).toBe("Digital Download");
    expect(plan.desired.templateSuffix).toBe("mmg-ai-image-mastery");
    expect(plan.desired.descriptionHtml).toContain("Direct better AI images");
    expect(plan.assets.cover.filename).toBe("approved-cover.png");
    expect(plan.assets.cover.source).toBe("https://mmg-ios.info-mindsetmediagroup.workers.dev/api/admin-asset-vault/projects/manuscript-studio-12345678/assets/approved-cover-111");
    expect(plan.assets.files.map((item) => item.filename)).toEqual(["product-hero.svg", "social-square.svg"]);
    expect(plan.assets.packageDownloadURL).toBe("https://mmg-ios.info-mindsetmediagroup.workers.dev/api/admin-asset-vault/projects/manuscript-studio-12345678/package");
  });

  it("requires a checksum-verified Admin Asset Vault package", () => {
    expect(() => buildLiveProductReplacementPlan({
      pipeline: pipeline({ vault: { integrity: { passed: false } } }),
      productPackage,
      currentProduct: product(),
      origin: "https://kairos.test",
    })).toThrow("checksum-verified Admin Asset Vault package");
  });

  it("requires an existing active product", () => {
    expect(() => buildLiveProductReplacementPlan({
      pipeline: pipeline(),
      productPackage,
      currentProduct: product({ status: "DRAFT" }),
      origin: "https://kairos.test",
    })).toThrow("existing active Shopify product");
  });

  it("rejects a template outside the MMG allowlist", () => {
    expect(() => buildLiveProductReplacementPlan({
      pipeline: pipeline({ metadata: { templateSuffix: "unapproved-template" } }),
      productPackage,
      currentProduct: product(),
      origin: "https://kairos.test",
    })).toThrow("not approved");
  });

  it("requires an approved cover in the vault", () => {
    const noCover = pipeline();
    noCover.vault.assets = noCover.vault.assets.filter((asset) => asset.role !== "APPROVED_COVER");
    expect(() => buildLiveProductReplacementPlan({
      pipeline: noCover,
      productPackage,
      currentProduct: product(),
      origin: "https://kairos.test",
    })).toThrow("approved PNG or JPEG cover");
  });
});
