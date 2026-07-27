import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("web/kairos-dashboard/scripts/governance-obligation-tracking.js", "utf8");
const css = readFileSync("web/kairos-dashboard/styles/governance-obligation-tracking.css", "utf8");
const html = readFileSync("web/kairos-dashboard/index.html", "utf8");

describe("Kairos governance obligation dashboard", () => {
  it("aggregates bounded governance evidence without automatic persistence", () => {
    expect(script).toContain('request("/exceptions")');
    expect(script).toContain('request("/reviews")');
    expect(script).toContain('request("/continuity")');
    expect(script).toContain('request("/incidents")');
    expect(script).toContain('request("/metrics")');
    expect(script).toContain("Save proposal");
  });

  it("provides explicit evidence refresh, escalation, fulfillment, closure, and export controls", () => {
    expect(script).toContain("Record evidence refresh");
    expect(script).toContain("Escalate obligation");
    expect(script).toContain("Mark fulfilled");
    expect(script).toContain("Certify closure");
    expect(script).toContain("Export closure package");
  });

  it("keeps deployment and remediation controls absent", () => {
    expect(script).not.toMatch(/data-action=["'](?:deploy|rollback|retry|unpublish|execute|continue-tool)/i);
    expect(script).toContain("Governance only");
  });

  it("is registered and responsive with reduced-motion safety", () => {
    expect(html).toContain("governance-obligation-tracking.css");
    expect(html).toContain("governance-obligation-tracking.js");
    expect(css).toContain("@media(max-width:760px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
  });
});
