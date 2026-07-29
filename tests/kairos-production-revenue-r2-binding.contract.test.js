import { describe, expect, it } from "vitest";
import fs from "node:fs";

const wrangler = fs.readFileSync("cloudflare/mmg-ios/wrangler.toml", "utf8");

describe("Kairos production revenue R2 binding", () => {
  it("binds the canonical governed production and preview buckets", () => {
    expect(wrangler).toContain('[[r2_buckets]]');
    expect(wrangler).toContain('binding = "KAIROS_REVENUE_ASSETS"');
    expect(wrangler).toContain('bucket_name = "mmg-kairos-revenue-assets"');
    expect(wrangler).toContain('preview_bucket_name = "mmg-kairos-revenue-assets-preview"');
  });

  it("enables revenue asset storage without changing publication authority", () => {
    expect(wrangler).toContain('KAIROS_REVENUE_ASSET_STORAGE_ENABLED = "true"');
    expect(wrangler).toContain('main = "src/kairos-production-entry-revenue-dashboard-v1.js"');
    expect(wrangler).toContain('KAIROS_SHOPIFY_WRITES_ENABLED = "true"');
    expect(wrangler).toContain('KAIROS_SHOPIFY_LIVE_PUBLISH_ENABLED = "true"');
  });
});
