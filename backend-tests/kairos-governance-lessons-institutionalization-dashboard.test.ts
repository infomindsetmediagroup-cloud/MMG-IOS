import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const index = readFileSync("web/kairos-dashboard/index.html", "utf8");
const script = readFileSync("web/kairos-dashboard/scripts/governance-lessons-institutionalization.js", "utf8");
const style = readFileSync("web/kairos-dashboard/styles/governance-lessons-institutionalization.css", "utf8");

describe("Kairos governance lessons institutionalization dashboard", () => {
  it("registers the dashboard assets in the command hub", () => {
    expect(index).toContain("governance-lessons-institutionalization.css");
    expect(index).toContain("governance-lessons-institutionalization.js");
  });

  it("aggregates bounded governance evidence and requires explicit persistence", () => {
    expect(script).toContain("/effectiveness-verifications");
    expect(script).toContain("/remediation-plans");
    expect(script).toContain("/assurance-plans");
    expect(script).toContain("/portfolios");
    expect(script).toContain("Save proposed adoption evidence");
    expect(script).toContain("remains proposed until explicitly saved");
  });

  it("surfaces controlled changes, adoption, evidence, effectiveness, certification, closure, and export", () => {
    expect(script).toContain("Controlled-change register");
    expect(script).toContain("Adoption timeline");
    expect(script).toContain("Evidence coverage");
    expect(script).toContain("Effectiveness review");
    expect(script).toContain("Certify institutionalization");
    expect(script).toContain("Close institutionalization");
    expect(script).toContain("lessons-institutionalizations/export");
  });

  it("contains no change-execution controls and remains responsive", () => {
    expect(script).not.toContain("Deploy");
    expect(script).not.toContain("Rollback");
    expect(script).not.toContain("Retry");
    expect(script).not.toContain("Unpublish");
    expect(style).toContain("@media(max-width:760px)");
    expect(style).toContain("prefers-reduced-motion");
  });
});