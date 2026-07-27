import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("web/kairos-dashboard/scripts/governance-portfolio-oversight.js", "utf8");
const css = readFileSync("web/kairos-dashboard/styles/governance-portfolio-oversight.css", "utf8");
const html = readFileSync("web/kairos-dashboard/index.html", "utf8");

describe("Kairos governance portfolio dashboard", () => {
  it("aggregates bounded cross-system evidence without automatic persistence", () => {
    for (const path of ["/exceptions", "/obligations", "/reviews", "/continuity", "/assurance", "/incidents", "/metrics"]) expect(script).toContain(`request("${path}")`);
    expect(script).toContain("Save proposal");
    expect(script).toContain("Aggregated evidence remains proposed until explicitly saved.");
  });

  it("provides explicit risk, attestation, closure, and export controls", () => {
    expect(script).toContain("Escalate portfolio");
    expect(script).toContain("Attest portfolio");
    expect(script).toContain("Certify closure");
    expect(script).toContain("Export portfolio package");
  });

  it("keeps deployment and remediation controls absent", () => {
    expect(script).not.toMatch(/data-action=["'](?:deploy|rollback|retry|unpublish|execute|continue-tool)/i);
    expect(script).toContain("Governance only");
  });

  it("is registered and responsive with reduced-motion safety", () => {
    expect(html).toContain("governance-portfolio-oversight.css");
    expect(html).toContain("governance-portfolio-oversight.js");
    expect(css).toContain("@media(max-width:760px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
  });
});