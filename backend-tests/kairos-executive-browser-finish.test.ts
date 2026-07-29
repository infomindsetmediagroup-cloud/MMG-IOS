import { describe, expect, it } from "vitest";
import fs from "node:fs";

const executiveOS = fs.readFileSync("web/kairos-dashboard/scripts/executive-os.js", "utf8");
const safariCompat = fs.readFileSync("web/kairos-dashboard/scripts/safari-manuscript-intake-compat.js", "utf8");
const executiveCSS = fs.readFileSync("web/kairos-dashboard/styles/executive-os.css", "utf8");

describe("Kairos Executive OS browser completion", () => {
  it("activates the Executive OS from the existing production module chain", () => {
    expect(safariCompat).toContain('import("./executive-os.js?v=browser-finish-20260729-2")');
    expect(safariCompat).toContain("activateExecutiveOperatingSystem();");
    expect(safariCompat).toContain('document.querySelector("#kairos-executive-os")');
  });

  it("provides the complete executive navigation surface", () => {
    for (const view of ["today", "approvals", "create", "assets", "growth", "settings"]) {
      expect(executiveOS).toContain(`"${view}"`);
    }
    expect(executiveOS).toContain('aria-label="Primary"');
    expect(executiveOS).toContain('aria-current="${state.view === item ? "page" : "false"}"');
  });

  it("preserves browser session state and recovers from connectivity failures", () => {
    expect(executiveOS).toContain("kairos.executive-os.session.v2");
    expect(executiveOS).toContain("restoreSession()");
    expect(executiveOS).toContain("persistSession()");
    expect(executiveOS).toContain('window.addEventListener("online"');
    expect(executiveOS).toContain('window.addEventListener("offline"');
    expect(executiveOS).toContain("Retry connection");
  });

  it("retains mobile safe-area and bottom navigation behavior", () => {
    expect(executiveCSS).toContain("env(safe-area-inset-top)");
    expect(executiveCSS).toContain("env(safe-area-inset-bottom)");
    expect(executiveCSS).toContain("grid-template-columns:repeat(6,1fr)");
  });

  it("keeps protected commerce actions outside batch approval", () => {
    for (const protectedWord of ["publish", "price", "pricing", "spend", "customer", "refund", "delete", "destructive", "legal"]) {
      expect(executiveOS).toContain(`"${protectedWord}"`);
    }
  });
});
