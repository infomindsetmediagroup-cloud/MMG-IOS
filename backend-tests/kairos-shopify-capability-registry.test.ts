import { describe, expect, it } from "vitest";
import { classifyKairosToolRequest, getKairosTool } from "../cloudflare/mmg-ios/src/kairos-tool-registry-v1.js";
import { validateKairosToolArguments } from "../cloudflare/mmg-ios/src/kairos-tool-arguments-v1.js";
import { assertKairosShopifyToolAllowed, getKairosShopifyCapability, listKairosShopifyCapabilities } from "../cloudflare/mmg-ios/src/kairos-shopify-capability-registry-v1.js";
import { validateKairosShopifyExecutionPolicy } from "../cloudflare/mmg-ios/src/kairos-shopify-execution-policy-v1.js";

describe("Kairos Shopify capability registry", () => {
  it("maps Shopify only into applicable five-center child apps", () => {
    const apps = listKairosShopifyCapabilities();
    expect(apps.map((entry) => `${entry.centerId}:${entry.appId}`)).toEqual(expect.arrayContaining([
      "knowledge:knowledge-library",
      "knowledge:research-brief",
      "content:website",
      "business:product-launch",
      "business:offer-builder",
      "customers:customer-journey",
      "customers:support-intelligence",
      "operations:release-control",
      "operations:system-registry",
    ]));
    expect(getKairosShopifyCapability("content", "website")?.mode).toBe("staged_site_retool");
    expect(getKairosShopifyCapability("customers", "customer-portal")).toBeNull();
    expect(assertKairosShopifyToolAllowed("business", "product-launch", "shopify.product.create")).toBe(true);
    expect(assertKairosShopifyToolAllowed("knowledge", "research-brief", "shopify.product.create")).toBe(false);
  });

  it("registers all Shopify mutations as approval-gated", () => {
    for (const id of [
      "shopify.product.create", "shopify.product.update", "shopify.product.publish",
      "shopify.collection.create", "shopify.collection.update",
      "shopify.page.create", "shopify.page.update",
      "shopify.menu.create", "shopify.menu.update", "shopify.theme.files.upsert",
    ]) {
      const tool = getKairosTool(id);
      expect(tool?.approvalRequired).toBe(true);
      expect(tool?.capability).toBe("mutation");
      expect(classifyKairosToolRequest(id).classification).toBe("approval_required");
    }
    expect(getKairosTool("shopify.site.inspect")?.approvalRequired).toBe(false);
  });

  it("normalizes valid create arguments to non-public state", () => {
    const product = validateKairosToolArguments("shopify.product.create", {
      title: "Test Product",
      handle: "test-product",
    });
    expect(product.ok).toBe(true);
    expect(product.arguments.status).toBe("DRAFT");

    const page = validateKairosToolArguments("shopify.page.create", {
      title: "Help",
      handle: "help",
    });
    expect(page.ok).toBe(true);
    expect(page.arguments.isPublished).toBe(false);
  });

  it("blocks unsafe create proposals before approval", () => {
    expect(validateKairosShopifyExecutionPolicy("shopify.product.create", { title: "No handle", status: "DRAFT" })).toMatchObject({ ok: false, error: { code: "SHOPIFY_IDEMPOTENCY_HANDLE_REQUIRED" } });
    expect(validateKairosShopifyExecutionPolicy("shopify.product.create", { title: "Live", handle: "live", status: "ACTIVE" })).toMatchObject({ ok: false, error: { code: "SHOPIFY_PRODUCT_CREATE_DRAFT_ONLY" } });
    expect(validateKairosShopifyExecutionPolicy("shopify.page.create", { title: "Live page", handle: "live-page", isPublished: true })).toMatchObject({ ok: false, error: { code: "SHOPIFY_PAGE_CREATE_UNPUBLISHED_ONLY" } });
    expect(validateKairosShopifyExecutionPolicy("shopify.collection.create", { title: "Safe", handle: "safe" })).toMatchObject({ ok: true });
  });

  it("rejects arbitrary fields and unsafe theme paths", () => {
    expect(validateKairosToolArguments("shopify.product.create", { title: "X", adminGraphql: "mutation {}" }).ok).toBe(false);
    expect(validateKairosToolArguments("shopify.theme.files.upsert", {
      themeId: "gid://shopify/OnlineStoreTheme/123",
      files: [{ filename: "../layout/theme.liquid", body: "x" }],
    }).ok).toBe(false);
  });
});
