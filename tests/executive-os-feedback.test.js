import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync("web/kairos-dashboard/scripts/executive-os-feedback.js", "utf8");
const compat = fs.readFileSync("web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", "utf8");
const css = fs.readFileSync("web/kairos-dashboard/styles/executive-os-feedback.css", "utf8");

describe("Kairos Executive OS success feedback", () => {
  it("activates through the existing browser chain", () => {
    expect(compat).toContain("activateSuccessFeedback");
    expect(compat).toContain("executive-os-feedback.js?v=20260729-1");
    expect(compat).toContain("data-kairos-feedback");
  });

  it("observes only successful governed POST actions", () => {
    expect(source).toContain('method === "POST" && response.ok');
    expect(source).toContain('path === "/api/hub/run"');
    expect(source).toContain('path === "/api/executive-briefing/decide"');
    expect(source).not.toContain("publishablePublish");
    expect(source).not.toContain("/api/kairos/tools/continue");
  });

  it("provides explicit objective, approval, correction, and denial confirmation", () => {
    expect(source).toContain("Objective accepted");
    expect(source).toContain("Approval recorded");
    expect(source).toContain("Correction request recorded");
    expect(source).toContain("Decision denied");
    expect(source).toContain('role", "status"');
    expect(source).toContain('aria-live", "polite"');
  });

  it("routes users back to governed browser surfaces", () => {
    expect(source).toContain('view: "today"');
    expect(source).toContain('view: "approvals"');
    expect(source).toContain('view: "assets"');
    expect(source).toContain("safeView(view)");
  });

  it("retains mobile safe-area and reduced-motion behavior", () => {
    expect(css).toContain("safe-area-inset-bottom");
    expect(css).toContain("@media(max-width:640px)");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
  });
});
