import { describe, expect, it } from "vitest";
import { isStorefrontAuditObjective } from "../api/storefront-inspection-core.js";

describe("storefront inspection routing", () => {
  it("routes explicit MMG website audits", () => {
    expect(isStorefrontAuditObjective("Run a complete audit of the MMG website")).toBe(true);
    expect(isStorefrontAuditObjective("Inspect the Shopify storefront")).toBe(true);
  });

  it("does not trigger for unrelated executive objectives", () => {
    expect(isStorefrontAuditObjective("Draft a product description")).toBe(false);
    expect(isStorefrontAuditObjective("Summarize the operating plan")).toBe(false);
  });
});
