import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("Kairos continuous operational review dashboard", () => {
  it("aggregates bounded operational evidence and requires explicit persistence", async () => {
    const source = await readFile("web/kairos-dashboard/scripts/continuous-operational-review.js", "utf8");
    expect(source).toContain('request("/continuity")');
    expect(source).toContain('request("/post-launch-assurance")');
    expect(source).toContain('request("/releases")');
    expect(source).toContain('request("/incidents")');
    expect(source).toContain('request("/metrics")');
    expect(source).toContain("Save proposed review");
    expect(source).toContain('method:"PATCH"');
  });

  it("provides control, improvement, timeline, attestation, and export surfaces", async () => {
    const source = await readFile("web/kairos-dashboard/scripts/continuous-operational-review.js", "utf8");
    expect(source).toContain("Control attestations");
    expect(source).toContain("Improvement actions");
    expect(source).toContain("Review timeline");
    expect(source).toContain("Executive attestation");
    expect(source).toContain("Export audit package");
    expect(source).toContain("/reviews/export");
  });

  it("contains no deployment, rollback, retry, unpublish, commerce mutation, or tool continuation endpoint", async () => {
    const source = await readFile("web/kairos-dashboard/scripts/continuous-operational-review.js", "utf8");
    expect(source).not.toMatch(/request\("\/(deploy|rollback|retry|unpublish|commerce|tools\/continue)/);
  });

  it("is responsive and accessible", async () => {
    const css = await readFile("web/kairos-dashboard/styles/continuous-operational-review.css", "utf8");
    const source = await readFile("web/kairos-dashboard/scripts/continuous-operational-review.js", "utf8");
    expect(css).toContain("@media(max-width:760px)");
    expect(source).toContain('role="alert"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-labelledby');
  });
});
