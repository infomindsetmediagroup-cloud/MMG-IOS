import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("Kairos operational continuity dashboard", () => {
  it("wires the dashboard into the command hub", async () => {
    const html = await readFile("web/kairos-dashboard/index.html", "utf8");
    expect(html).toContain("styles/operational-continuity.css");
    expect(html).toContain("scripts/operational-continuity.js");
  });

  it("uses authenticated continuity APIs and bounded evidence sources", async () => {
    const script = await readFile("web/kairos-dashboard/scripts/operational-continuity.js", "utf8");
    expect(script).toContain('credentials:"same-origin"');
    expect(script).toContain('request("/continuity")');
    expect(script).toContain('request("/post-launch-assurance")');
    expect(script).toContain('request("/launch-authorizations")');
    expect(script).toContain('request("/readiness-certifications")');
    expect(script).toContain('request("/releases")');
    expect(script).toContain('request("/incidents")');
    expect(script).toContain('request("/metrics")');
    expect(script).toContain("slice(0,50)");
  });

  it("requires explicit save and attestation actions", async () => {
    const script = await readFile("web/kairos-dashboard/scripts/operational-continuity.js", "utf8");
    expect(script).toContain("Save proposed continuity");
    expect(script).toContain("Record handoff attestation");
    expect(script).toContain('method:"PATCH"');
    expect(script).toContain("attestedAt:new Date().toISOString()");
  });

  it("renders maintenance, risk, summary, and export controls without execution authority", async () => {
    const script = await readFile("web/kairos-dashboard/scripts/operational-continuity.js", "utf8");
    expect(script).toContain("Maintenance window");
    expect(script).toContain("Continuity risks");
    expect(script).toContain("Executive operating summary");
    expect(script).toContain("Export executive handoff package");
    expect(script).not.toMatch(/\/deploy|\/rollback|\/retry|\/execute|\/publish/);
  });

  it("provides responsive accessible presentation", async () => {
    const css = await readFile("web/kairos-dashboard/styles/operational-continuity.css", "utf8");
    const script = await readFile("web/kairos-dashboard/scripts/operational-continuity.js", "utf8");
    expect(css).toContain("@media(max-width:900px)");
    expect(css).toContain("@media(max-width:560px)");
    expect(script).toContain('role="alert"');
    expect(script).toContain('aria-live="polite"');
    expect(script).toContain("aria-labelledby");
  });
});
