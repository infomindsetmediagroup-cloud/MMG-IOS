import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleKairosReleaseObjectRequest } from "../cloudflare/mmg-ios/src/kairos-release-store-v1.js";

const index = readFileSync("web/kairos-dashboard/index.html", "utf8");
const controller = readFileSync("web/kairos-dashboard/scripts/release-operations.js", "utf8");
const styles = readFileSync("web/kairos-dashboard/styles/release-operations.css", "utf8");

function state() {
  const data = new Map<string, unknown>();
  return { storage: { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } } as any;
}

describe("Kairos release recovery dashboard", () => {
  it("loads the release module and responsive styles", () => {
    expect(index).toContain("release-operations.js?v=releases-20260726-1");
    expect(index).toContain("release-operations.css?v=releases-20260726-1");
    expect(styles).toContain("@media(max-width:800px)");
  });

  it("uses authenticated release APIs for refresh, evaluation, and export", () => {
    expect(controller).toContain('fetch("/api/kairos/operations/releases"');
    expect(controller).toContain("/api/kairos/operations/releases/export");
    expect(controller).toContain('requestOptions("PATCH"');
    expect(controller).toContain('credentials: "include"');
    expect(controller).toContain("verification");
  });

  it("provides decision support without execution authority", () => {
    expect(controller).toContain("Confirm scope");
    expect(controller).toContain("Prepare recovery");
    expect(controller).toContain("requiresNewApproval");
    expect(controller).toContain("cannot deploy, roll back, retry, unpublish, or execute commerce mutations");
    expect(controller).not.toContain("/api/kairos/tools/continue");
    expect(controller).not.toContain("rollbackExecutionAllowed: true");
  });

  it("exports a bounded recovery package without deployment or rollback execution", async () => {
    const durable = state();
    await handleKairosReleaseObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-releases", { method: "POST", body: JSON.stringify({ operation: "create", input: { releaseId: "krel_test", environment: "production", commitSha: "abc123" } }) }));
    const response = await handleKairosReleaseObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-releases", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const payload = await response!.json() as any;
    expect(payload.count).toBe(1);
    expect(payload.deploymentExecutionIncluded).toBe(false);
    expect(payload.rollbackExecutionIncluded).toBe(false);
    expect(payload.releases[0].deploymentExecutionAllowed).toBe(false);
    expect(payload.releases[0].rollbackExecutionAllowed).toBe(false);
  });
});
