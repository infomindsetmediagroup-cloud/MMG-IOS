import { describe, expect, it } from "vitest";
import fs from "node:fs";

const moduleSource = fs.readFileSync("web/kairos-dashboard/scripts/executive-os-live-details.js", "utf8");
const compatSource = fs.readFileSync("web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", "utf8");
const cssSource = fs.readFileSync("web/kairos-dashboard/styles/executive-os-live-details.css", "utf8");

describe("Kairos Executive OS live execution details", () => {
  it("loads through the existing Safari-safe browser chain", () => {
    expect(compatSource).toContain("activateLiveExecutionDetails");
    expect(compatSource).toContain("executive-os-live-details.js?v=20260729-2");
    expect(compatSource).toContain("data-kairos-live-details");
  });

  it("reads workflow state without adding mutation authority", () => {
    expect(moduleSource).toContain('fetch("/api/workflows"');
    expect(moduleSource).not.toContain('method: "POST"');
    expect(moduleSource).not.toContain("/api/kairos/tools/continue");
    expect(moduleSource).not.toContain("publishablePublish");
  });

  it("projects progress, blockers, next actions, and evidence", () => {
    expect(moduleSource).toContain("progressPercent");
    expect(moduleSource).toContain("blockedReason");
    expect(moduleSource).toContain("nextAction");
    expect(moduleSource).toContain("evidence items");
    expect(moduleSource).toContain('role="progressbar"');
  });

  it("opens a complete workflow detail dialog", () => {
    expect(moduleSource).toContain("data-workflow-open");
    expect(moduleSource).toContain('role="dialog"');
    expect(moduleSource).toContain('aria-modal="true"');
    expect(moduleSource).toContain("Execution timeline");
    expect(moduleSource).toContain("Evidence and deliverables");
    expect(moduleSource).toContain("taskItems(item)");
    expect(moduleSource).toContain("evidenceItems(item)");
  });

  it("allows only safe evidence links", () => {
    expect(moduleSource).toContain("function safeHref");
    expect(moduleSource).toContain("/^https?:\\/\\//i");
    expect(moduleSource).toContain('rel="noopener noreferrer"');
    expect(moduleSource).not.toContain("javascript:");
  });

  it("retains mobile and reduced-motion behavior", () => {
    expect(cssSource).toContain("@media(max-width:640px)");
    expect(cssSource).toContain("@media(prefers-reduced-motion:reduce)");
    expect(cssSource).toContain("grid-template-columns:repeat(3,1fr)");
    expect(cssSource).toContain("safe-area-inset-bottom");
    expect(cssSource).toContain("abos-dialog-panel");
  });
});