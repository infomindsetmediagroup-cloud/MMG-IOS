import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controller = readFileSync("web/kairos-dashboard/scripts/objective-controller-v2.js", "utf8");
const index = readFileSync("web/kairos-dashboard/index.html", "utf8");

describe("Kairos dashboard evidence traceability", () => {
  it("reads department and Knowledge Vault trace headers", () => {
    expect(controller).toContain('X-Kairos-Department');
    expect(controller).toContain('X-Kairos-Knowledge-Evidence');
    expect(controller).toContain('X-Kairos-Knowledge-Source-Mode');
  });

  it("renders evidence count, source mode, department, and request id", () => {
    expect(controller).toContain("Department:");
    expect(controller).toContain("Evidence:");
    expect(controller).toContain("Source mode:");
    expect(controller).toContain("Request:");
  });

  it("loads the evidence-trace controller build", () => {
    expect(index).toContain("kairos-command-hub-evidence-trace-20260725-9");
    expect(index).toContain("objective-controller-v2.js?v=evidence-trace-20260725-3");
  });
});
