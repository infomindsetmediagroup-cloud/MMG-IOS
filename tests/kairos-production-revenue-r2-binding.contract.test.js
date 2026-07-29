import { describe, expect, it } from "vitest";
import fs from "node:fs";

const wrangler = fs.readFileSync("cloudflare/mmg-ios/wrangler.toml", "utf8");
const workflow = fs.readFileSync(".github/workflows/deploy-sprint-44-revenue-storage.yml", "utf8");
const entry = fs.readFileSync("cloudflare/mmg-ios/src/kairos-production-entry-revenue-dashboard-v1.js", "utf8");

describe("Kairos production browser deployment", () => {
  it("deploys browser assets without requiring unprovisioned R2", () => {
    expect(wrangler).not.toContain('[[r2_buckets]]');
    expect(wrangler).toContain('KAIROS_REVENUE_ASSET_STORAGE_ENABLED = "false"');
    expect(wrangler).toContain('directory = "../../web/kairos-dashboard"');
    expect(workflow).toContain("web/kairos-dashboard/**");
    expect(workflow).not.toContain("wrangler r2 bucket create");
  });

  it("keeps the governed Worker entry and publication boundary", () => {
    expect(wrangler).toContain('main = "src/kairos-production-entry-revenue-dashboard-v1.js"');
    expect(entry).toContain('X-Kairos-Automatic-Publication');
    expect(entry).toContain('"disabled"');
  });

  it("restores stable approval brief routes", () => {
    expect(entry).toContain('/api/executive-briefing/latest');
    expect(entry).toContain('/api/executive-briefing/build');
    expect(entry).toContain('/api/executive-briefing/decide');
    expect(entry).toContain('readLatestExecutiveBriefing');
    expect(entry).toContain('buildExecutiveBriefing');
    expect(entry).toContain('decideExecutiveBriefingItem');
  });
});
