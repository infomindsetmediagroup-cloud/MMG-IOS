import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("web/kairos-dashboard/scripts/governance-assurance-planning.js", "utf8");
const css = readFileSync("web/kairos-dashboard/styles/governance-assurance-planning.css", "utf8");
const html = readFileSync("web/kairos-dashboard/index.html", "utf8");

describe("Kairos governance assurance planning dashboard", () => {
  it("aggregates bounded cross-system evidence without automatic persistence", () => {
    expect(script).toContain('request("/portfolios")');
    expect(script).toContain('request("/exceptions")');
    expect(script).toContain('request("/obligations")');
    expect(script).toContain('request("/reviews")');
    expect(script).toContain('request("/incidents")');
    expect(script).toContain('request("/metrics")');
    expect(script).toContain("Save proposal");
  });

  it("provides evidence aging, commitment, escalation, certification, closure, and export controls", () => {
    expect(script).toContain("Evidence aging");
    expect(script).toContain("Owner commitments");
    expect(script).toContain("Escalate assurance cycle");
    expect(script).toContain("Certify assurance");
    expect(script).toContain("Close assurance cycle");
    expect(script).toContain("Export assurance package");
  });

  it("keeps deployment and remediation controls absent", () => {
    expect(script).not.toMatch(/data-action=["'](?:deploy|rollback|retry|unpublish|execute|continue-tool)/i);
    expect(script).toContain("Governance only");
  });

  it("is registered and responsive with reduced-motion safety", () => {
    expect(html).toContain("governance-assurance-planning.css");
    expect(html).toContain("governance-assurance-planning.js");
    expect(css).toContain("@media(max-width:760px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
  });
});
