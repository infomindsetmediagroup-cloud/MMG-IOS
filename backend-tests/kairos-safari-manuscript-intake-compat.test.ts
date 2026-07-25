import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");
const compat = readFileSync(new URL("../web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", import.meta.url), "utf8");

 describe("Kairos Safari manuscript intake compatibility", () => {
  it("loads compatibility before Manuscript Studio", () => {
    const compatIndex = index.indexOf("safari-manuscript-intake-compat.js");
    const studioIndex = index.indexOf("manuscript-studio.js");
    expect(compatIndex).toBeGreaterThan(-1);
    expect(studioIndex).toBeGreaterThan(compatIndex);
  });

  it("normalizes Safari primitives used by production intake", () => {
    expect(compat).toContain("installRandomUUIDFallback");
    expect(compat).toContain("installSyntheticFileFallback");
    expect(compat).toContain("installDigestIdentifierFallback");
    expect(compat).toContain('typeof algorithm === "string" ? { name: algorithm }');
    expect(compat).toContain("new NativeBlob(parts, options)");
  });
});
