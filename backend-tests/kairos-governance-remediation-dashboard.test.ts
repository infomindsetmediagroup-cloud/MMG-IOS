import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const script=readFileSync("web/kairos-dashboard/scripts/governance-remediation-planning.js","utf8");
const css=readFileSync("web/kairos-dashboard/styles/governance-remediation-planning.css","utf8");
const html=readFileSync("web/kairos-dashboard/index.html","utf8");
describe("Kairos governance remediation dashboard",()=>{
  it("aggregates bounded evidence without automatic persistence",()=>{for(const path of ["/assurance-plans","/portfolios","/exceptions","/obligations","/reviews","/incidents","/metrics"])expect(script).toContain(`request("${path}")`);expect(script).toContain("Save proposal");});
  it("provides corrective action, validation, escalation, closure, and export controls",()=>{expect(script).toContain("Corrective-action timeline");expect(script).toContain("Validation evidence");expect(script).toContain("Escalate remediation plan");expect(script).toContain("Validate remediation");expect(script).toContain("Close remediation plan");expect(script).toContain("Export remediation package");});
  it("keeps execution controls absent",()=>{expect(script).not.toMatch(/data-action=["'](?:deploy|rollback|retry|unpublish|execute|continue-tool|run-remediation)/i);expect(script).toContain("Governance only");});
  it("is registered and responsive",()=>{expect(html).toContain("governance-remediation-planning.css");expect(html).toContain("governance-remediation-planning.js");expect(css).toContain("@media(max-width:760px)");expect(css).toContain("prefers-reduced-motion:reduce");});
});