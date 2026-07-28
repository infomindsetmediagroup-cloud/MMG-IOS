import { describe, expect, it, vi } from "vitest";
import { evaluateRevenueRuntimePreflight, routeKairosRevenueProductionRequest } from "../cloudflare/mmg-ios/src/kairos-revenue-production-router-v1.js";
import { mountKairosRevenueProduction } from "../web/kairos-dashboard/kairos-revenue-production-mount.js";

describe("Kairos revenue production preflight", () => {
  it("requires model, secrets, storage, and durable stores", () => {
    const blocked = evaluateRevenueRuntimePreflight({});
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toContain("openaiKey");
    expect(blocked.automaticPublicationAllowed).toBe(false);

    const ready = evaluateRevenueRuntimePreflight({
      OPENAI_API_KEY: "configured",
      KAIROS_REVENUE_ASSETS: {},
      KAIROS_PROJECTS: {},
      KAIROS_REVENUE_MODEL: "gpt-5",
    });
    expect(ready.ready).toBe(true);
  });

  it("blocks production mutations when runtime dependencies are absent", async () => {
    const response = await routeKairosRevenueProductionRequest(new Request("https://example.com/api/kairos/revenue/first-runs/run-1/execute-next", { method: "POST" }), { env: {} });
    expect(response?.status).toBe(503);
    expect(response?.headers.get("X-Kairos-Automatic-Publication")).toBe("disabled");
  });
});

describe("Kairos revenue production dashboard mount", () => {
  it("mounts, loads, and executes only the projected confirmation", async () => {
    document.body.innerHTML = '<main data-kairos-revenue-live></main>';
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/status")) return new Response(JSON.stringify({ run: { runId: "run-1", completedStageIds: [], stages: [{ id: "execute-content", confirmation: "EXECUTE REVENUE CONTENT BATCH" }] }, product: { productionJobs: [], assets: [] }, blockers: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      expect(JSON.parse(String(init?.body)).confirmation).toBe("EXECUTE REVENUE CONTENT BATCH");
      return new Response(JSON.stringify({ completedStageId: "execute-content", automaticPublicationAllowed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const mount = mountKairosRevenueProduction({ runId: "run-1", fetcher, authorization: "Bearer token", operatorEmail: "operator@example.com", operatorIdentityHash: "kid_operator", autoLoad: false });
    await mount.refresh();
    await mount.executeNext();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(document.querySelector("[data-kairos-revenue-live]")?.getAttribute("data-automatic-publication")).toBe("disabled");
  });
});
