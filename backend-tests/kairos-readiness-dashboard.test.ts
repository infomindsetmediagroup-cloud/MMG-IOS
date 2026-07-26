import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("web/kairos-dashboard/scripts/readiness-certification.js", "utf8");
const styles = readFileSync("web/kairos-dashboard/styles/readiness-certification.css", "utf8");
const index = readFileSync("web/kairos-dashboard/index.html", "utf8");

describe("Kairos readiness certification dashboard", () => {
  it("is wired into the command hub", () => {
    expect(index).toContain("styles/readiness-certification.css");
    expect(index).toContain("scripts/readiness-certification.js");
    expect(index).toContain("kairos-command-hub-readiness-certification");
  });

  it("aggregates bounded evidence from governed operational surfaces", () => {
    expect(script).toContain('request("/health")');
    expect(script).toContain('request("/metrics")');
    expect(script).toContain('request("/incidents")');
    expect(script).toContain('request("/releases")');
    expect(script).toContain("evidenceIds:");
    expect(script).toContain("incidentIds:");
    expect(script).toContain(".slice(0, 100)");
    expect(script).toContain(".slice(0, 50)");
  });

  it("requires explicit operator persistence and sign-off", () => {
    expect(script).toContain('method: "PATCH"');
    expect(script).toContain("Save proposed gates and blockers");
    expect(script).toContain("Record sign-off");
    expect(script).toContain("signedAt: new Date().toISOString()");
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
    expect(script).toContain('aria-labelledby="readiness-title"');
    expect(script).toContain('role="alert"');
  });
});
