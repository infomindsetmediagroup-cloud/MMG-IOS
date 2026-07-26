import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("web/kairos-dashboard/scripts/launch-governance.js", "utf8");
const styles = readFileSync("web/kairos-dashboard/styles/launch-governance.css", "utf8");
const index = readFileSync("web/kairos-dashboard/index.html", "utf8");

describe("Kairos controlled launch governance dashboard", () => {
  it("is wired into the command hub", () => {
    expect(index).toContain("styles/launch-governance.css");
    expect(index).toContain("scripts/launch-governance.js");
    expect(index).toContain("kairos-command-hub-controlled-launch-governance");
  });

  it("aggregates bounded evidence from governed operational surfaces", () => {
    expect(script).toContain('request("/readiness-certifications")');
    expect(script).toContain('request("/releases")');
    expect(script).toContain('request("/incidents")');
    expect(script).toContain('request("/metrics")');
    expect(script).toContain(".slice(0,max)");
    expect(script).toContain("incidentIds:");
    expect(script).toContain("evidenceIds:");
  });

  it("requires explicit persistence and stakeholder decisions", () => {
    expect(script).toContain('method:"PATCH"');
    expect(script).toContain("Save proposed controls");
    expect(script).toContain("Stakeholder decision recorded");
    expect(script).toContain("decidedAt:new Date().toISOString()");
  });

  it("renders the post-launch assurance timeline", () => {
    expect(script).toContain("Post-launch assurance");
    expect(script).toContain("Post-launch watch");
    expect(script).toContain("successCriteria");
    expect(script).toContain("escalationCriteria");
  });

  it("does not expose execution authority", () => {
    expect(script).not.toContain("/deploy");
    expect(script).not.toContain("/rollback");
    expect(script).not.toContain("/continue");
    expect(script).not.toContain("executeKairosTool");
    expect(script).toContain("Launch, deployment, rollback, retry, unpublish, commerce mutation, and tool continuation are unavailable here.");
  });

  it("provides responsive and accessible presentation", () => {
    expect(styles).toContain("@media(max-width:900px)");
    expect(styles).toContain("@media(max-width:560px)");
    expect(script).toContain('aria-labelledby","launch-governance-title"');
    expect(script).toContain('role="alert"');
  });
});