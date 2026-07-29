import { describe, expect, it, vi } from "vitest";
import runtime, { KairosProject } from "../cloudflare/mmg-ios/src/kairos-production-entry-revenue-dashboard-v1.js";

describe("Kairos production revenue dashboard entry", () => {
  it("routes the dashboard product collection before the generic production runtime", async () => {
    const durableFetch = vi.fn(async () => new Response(JSON.stringify({ success: true, products: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const env = {
      KAIROS_PROJECTS: {
        idFromName: vi.fn(() => "registry-id"),
        get: vi.fn(() => ({ fetch: durableFetch })),
      },
    };
    const request = new Request("https://example.com/api/kairos/revenue/products", {
      headers: { "CF-Access-Authenticated-User-Email": "operator@example.com" },
    });

    const response = await runtime.fetch(request, env, {});
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.products).toEqual([]);
    expect(durableFetch).toHaveBeenCalledTimes(1);
    expect(response.headers.get("x-kairos-revenue-dashboard-entry")).toBeTruthy();
    expect(response.headers.get("x-kairos-automatic-publication")).toBe("disabled");
  });

  it("mounts the revenue product object router on the canonical project Durable Object", async () => {
    const storage = {
      get: vi.fn(async () => []),
      put: vi.fn(async () => undefined),
    };
    const project = new KairosProject({ storage }, {});
    const request = new Request("https://kairos.internal/registry/kairos-revenue-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "list" }),
    });

    const response = await project.fetch(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.products).toEqual([]);
    expect(response.headers.get("x-kairos-revenue-dashboard-entry")).toBeTruthy();
  });
});
