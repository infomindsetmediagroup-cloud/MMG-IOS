import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const index = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../web/kairos-dashboard/scripts/executive-os.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../web/kairos-dashboard/styles/executive-os.css", import.meta.url), "utf8");

describe("Kairos ABOS v2 executive operating system", () => {
  it("loads one cache-busted executive shell while preserving manuscript production dependencies", () => {
    expect(index.match(/scripts\/executive-os\.js\?v=/g)).toHaveLength(1);
    expect(index.match(/styles\/executive-os\.css\?v=/g)).toHaveLength(1);
    expect(index.indexOf("kairos-local-inference.js?v=")).toBeLessThan(index.indexOf("manuscript-auto-pipeline.js?v="));
    expect(index).toContain("manuscript-project-setup.js?v=");
  });

  it("exposes the six simplified executive destinations", () => {
    for (const destination of ["today", "approvals", "create", "assets", "growth", "settings"]) {
      expect(source).toContain(`\"${destination}\"`);
    }
  });

  it("keeps protected business actions out of batch approval", () => {
    for (const protectedTerm of ["publish", "price", "spend", "customer", "refund", "delete", "legal"]) {
      expect(source).toContain(`\"${protectedTerm}\"`);
    }
    expect(source).toContain("isProtected");
    expect(source).toContain("/api/executive-briefing/decide");
  });

  it("routes existing manuscript and social studios without duplicating them", () => {
    expect(source).toContain("kairos:manuscript-studio:open");
    expect(source).toContain("kairos:social-production:open");
    expect(source).toContain("Advanced operations");
  });

  it("is mobile-first and safe-area aware", () => {
    expect(styles).toContain("env(safe-area-inset-bottom)");
    expect(styles).toContain("@media(max-width:880px)");
    expect(styles).toContain("grid-template-columns:repeat(6,1fr)");
  });
});
