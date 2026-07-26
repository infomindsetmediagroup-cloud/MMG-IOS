import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("web/kairos-dashboard/scripts/post-launch-assurance.js", "utf8");
const styles = readFileSync("web/kairos-dashboard/styles/post-launch-assurance.css", "utf8");
const index = readFileSync("web/kairos-dashboard/index.html", "utf8");

describe("Kairos post-launch assurance dashboard", () => {
  it("is wired into the command hub", () => {
    expect(index).toContain("styles/post-launch-assurance.css");
    expect(index).toContain("scripts/post-launch-assurance.js");
    expect(index).toContain("kairos-command-hub-post-launch-assurance");
  });

  it("aggregates bounded evidence from governed operational surfaces", () => {
    expect(script).toContain('request("/launch-authorizations")');
    expect(script).toContain('request("/readiness-certifications")');
    expect(script).toContain('request("/releases")');
    expect(script).toContain('request("/incidents")');
    expect(script).toContain('request("/metrics")');
    expect(script).toContain('request("/health")');
    expect(script).toContain(".slice(0,max)");
  });

  it("requires explicit persistence, escalation, and closure certification", () => {
    expect(script).toContain('method:"PATCH"');
    expect(script).toContain("Save proposed evidence");
    expect(script).toContain("Record escalation");
    expect(script).toContain("Certify closure");
    expect(script).toContain("certifiedAt:new Date().toISOString()");
  });

  it("shows the assurance watch and closure timeline", () => {
    expect(script).toContain("Watch started");
    expect(script).toContain("Watch ends");
    expect(script).toContain("Escalation review");
    expect(script).toContain("Closure certification");
  });

  it("does not expose launch, deployment, rollback, commerce, or continuation controls", () => {
    expect(script).not.toContain("/deploy");
    expect(script).not.toContain("/rollback");
    expect(script).not.toContain("/continue");
    expect(script).not.toContain("executeKairosTool");
    expect(script).toContain("Launch, deployment, rollback, retry, unpublish, commerce mutation, and tool continuation are unavailable here.");
  });

  it("provides responsive and accessible presentation", () => {
    expect(styles).toContain("@media(max-width:900px)");
    expect(styles).toContain("@media(max-width:560px)");
    expect(script).toContain('aria-labelledby","post-launch-assurance-title"');
    expect(script).toContain('role="alert"');
  });
});