import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const index = readFileSync("web/kairos-dashboard/index.html", "utf8");
const portal = readFileSync("web/kairos-dashboard/customer-portal.html", "utf8");
const script = readFileSync("web/kairos-dashboard/scripts/customer-runtime-portal.js", "utf8");
const style = readFileSync("web/kairos-dashboard/styles/customer-runtime-portal.css", "utf8");

describe("Kairos customer runtime portal", () => {
  it("keeps the customer workspace separate from the executive command center", () => {
    expect(index).not.toContain("customer-runtime-portal.js");
    expect(index).not.toContain("customer-runtime-portal.css");
    expect(portal).toContain('id="dashboard"');
    expect(portal).toContain('id="projects"');
    expect(portal).toContain('id="approvals"');
    expect(portal).toContain('id="deliverables"');
  });

  it("uses server-authenticated same-origin customer APIs only", () => {
    expect(script).toContain('credentials: "include"');
    expect(script).toContain('/api/customer/auth/start');
    expect(script).toContain('response.status === 401');
    expect(script).not.toContain("X-Kairos-Customer-Id");
    expect(script).not.toContain("x-kairos-customer-id");
    expect(script).not.toContain("kairosCustomerId");
    expect(script).not.toContain("localStorage");
    expect(script).not.toContain('meta[name="kairos-customer-id"]');
  });

  it("shows customer-safe progress, approvals, deliverables, and timeline", () => {
    expect(script).toContain("Your projects");
    expect(script).toContain('role="progressbar"');
    expect(script).toContain("Approvals");
    expect(script).toContain("Deliverables");
    expect(script).toContain("Project timeline");
  });

  it("records explicit customer approval decisions through the scoped API", () => {
    expect(script).toContain('/approve`');
    expect(script).toContain("decision: button.dataset.decision");
  });

  it("contains no deployment, commerce, or publication controls", () => {
    expect(script).not.toContain("Deploy");
    expect(script).not.toContain("Publish product");
    expect(script).not.toContain("Rollback");
  });

  it("is responsive and reduced-motion safe", () => {
    expect(style).toContain("@media(max-width:680px)");
    expect(style).toContain("prefers-reduced-motion");
  });
});
