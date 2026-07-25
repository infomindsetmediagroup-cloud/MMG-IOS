import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controller = readFileSync("web/kairos-dashboard/scripts/objective-controller-v2.js", "utf8");
const index = readFileSync("web/kairos-dashboard/index.html", "utf8");

describe("Kairos dashboard governed runtime connection", () => {
  it("submits dashboard objectives only through the canonical Kairos API", () => {
    expect(controller).toContain('fetch("/api/kairos"');
    expect(controller).toContain('mode: "informational"');
    expect(controller).toContain('client: "kairos-dashboard"');
    expect(controller).not.toContain('/api/objectives/execute');
  });

  it("preserves credentials, disables caching, and identifies the client build", () => {
    expect(controller).toContain('credentials: "include"');
    expect(controller).toContain('cache: "no-store"');
    expect(controller).toContain('"X-MMG-Client-Build": BUILD');
  });

  it("surfaces governed response state and request traceability", () => {
    expect(controller).toContain("requiresApproval");
    expect(controller).toContain("X-Kairos-Request-Id");
    expect(controller).toContain("Approval required");
    expect(controller).toContain("did not execute it automatically");
  });

  it("loads the governed controller with a cache-busting build marker", () => {
    expect(index).toContain("kairos-command-hub-governed-runtime-20260725-8");
    expect(index).toContain("objective-controller-v2.js?v=governed-runtime-20260725-2");
  });
});
