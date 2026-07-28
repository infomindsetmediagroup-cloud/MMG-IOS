import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const index = readFileSync("web/kairos-dashboard/index.html", "utf8");
const script = readFileSync("web/kairos-dashboard/scripts/customer-runtime-portal.js", "utf8");
const style = readFileSync("web/kairos-dashboard/styles/customer-runtime-portal.css", "utf8");

describe("Kairos customer runtime portal", () => {
  it("registers the customer projection assets", () => {
    expect(index).toContain("customer-runtime-portal.css");
    expect(index).toContain("customer-runtime-portal.js");
  });

  it("shows customer-safe progress, approvals, deliverables, and timeline", () => {
    expect(script).toContain("Your projects");
    expect(script).toContain('role=\"progressbar\"');
    expect(script).toContain("Approvals");
    expect(script).toContain("Deliverables");
    expect(script).toContain("Project timeline");
  });

  it("records explicit customer approval decisions through the scoped API", () => {
    expect(script).toContain('/approve`');
    expect(script).toContain('decision:button.dataset.decision');
    expect(script).toContain("X-Kairos-Customer-Id");
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