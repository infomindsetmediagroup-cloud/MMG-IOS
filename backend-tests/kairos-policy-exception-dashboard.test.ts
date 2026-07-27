import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script=readFileSync("web/kairos-dashboard/scripts/policy-exception-governance.js","utf8");
const css=readFileSync("web/kairos-dashboard/styles/policy-exception-governance.css","utf8");
const index=readFileSync("web/kairos-dashboard/index.html","utf8");

describe("Kairos policy exception dashboard",()=>{
  it("aggregates bounded governance evidence",()=>{
    expect(script).toContain('request("/reviews")');
    expect(script).toContain('request("/continuity")');
    expect(script).toContain('request("/incidents")');
    expect(script).toContain('request("/metrics")');
    expect(script).toContain("slice(0,100)");
    expect(script).toContain("slice(0,50)");
  });
  it("requires explicit persistence and risk acceptance",()=>{
    expect(script).toContain("Save proposal");
    expect(script).toContain("Record acceptance");
    expect(script).toContain("riskAcceptance");
    expect(script).toContain("revoke:true");
  });
  it("provides expiration and renewal governance",()=>{
    expect(script).toContain("Expiration and renewal timeline");
    expect(script).toContain("expiresAt");
    expect(script).toContain("reviewAt");
    expect(script).toContain("renewable:true");
  });
  it("exports without execution controls",()=>{
    expect(script).toContain("/exceptions/export");
    expect(script).not.toMatch(/deploy\(|rollback\(|retry\(|continueTool\(/);
  });
  it("is registered and responsive",()=>{
    expect(index).toContain("policy-exception-governance.css");
    expect(index).toContain("policy-exception-governance.js");
    expect(css).toContain("@media(max-width:760px)");
    expect(css).toContain("prefers-reduced-motion");
  });
});