import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const index = readFileSync("web/kairos-dashboard/index.html", "utf8");
const script = readFileSync("web/kairos-dashboard/scripts/governance-effectiveness-verification.js", "utf8");
const style = readFileSync("web/kairos-dashboard/styles/governance-effectiveness-verification.css", "utf8");

describe("Kairos governance effectiveness dashboard", () => {
  it("registers the dashboard assets in the command hub", () => {
    expect(index).toContain("governance-effectiveness-verification.css");
    expect(index).toContain("governance-effectiveness-verification.js");
  });

  it("aggregates bounded governance evidence and requires explicit persistence", () => {
    expect(script).toContain("/remediation-plans");
    expect(script).toContain("/assurance-plans");
    expect(script).toContain("/portfolios");
    expect(script).toContain("/exceptions");
    expect(script).toContain("/obligations");
    expect(script).toContain("/incidents");
    expect(script).toContain("Save proposed evidence");
    expect(script).toContain("remains proposed until explicitly saved");
  });

  it("surfaces comparisons, regression, sustainability, lessons, certification, closure, and export", () => {
    expect(script).toContain("Control comparisons");
    expect(script).toContain("Regression timeline");
    expect(script).toContain("Sustainability assessment");
    expect(script).toContain("Lessons learned");
    expect(script).toContain("Certify effectiveness");
    expect(script).toContain("Close verification");
    expect(script).toContain("effectiveness-verifications/export");
  });

  it("contains no operational execution controls and remains responsive", () => {
    expect(script).not.toContain("Deploy");
    expect(script).not.toContain("Rollback");
    expect(script).not.toContain("Retry");
    expect(script).not.toContain("Unpublish");
    expect(style).toContain("@media(max-width:760px)");
    expect(style).toContain("prefers-reduced-motion");
  });
});
