import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const index = readFileSync("web/kairos-dashboard/index.html", "utf8");
const controller = readFileSync("web/kairos-dashboard/scripts/operations-observability.js", "utf8");
const styles = readFileSync("web/kairos-dashboard/styles/operations-observability.css", "utf8");

describe("Kairos operations observability dashboard", () => {
  it("loads the authenticated health and metrics operator module", () => {
    expect(index).toContain("operations-observability.js?v=observability-20260726-1");
    expect(index).toContain("operations-observability.css?v=observability-20260726-1");
    expect(controller).toContain('fetch("/api/kairos/operations/health"');
    expect(controller).toContain('fetch("/api/kairos/operations/metrics"');
    expect(controller).toContain('credentials: "include"');
  });

  it("renders health, approvals, failures, latency, and verification incidents", () => {
    expect(controller).toContain("Dependency health");
    expect(controller).toContain("Approvals");
    expect(controller).toContain("Failures");
    expect(controller).toContain("Verification failures");
    expect(controller).toContain("p95 latency");
    expect(controller).toContain("Active alerts");
  });

  it("is responsive and introduces no execution control", () => {
    expect(styles).toContain("@media(max-width:700px)");
    expect(controller).not.toContain("/api/kairos/tools/continue");
    expect(controller).not.toContain("method: \"POST\"");
  });
});
