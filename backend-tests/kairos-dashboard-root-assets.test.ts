import { describe, expect, it, vi } from "vitest";
import runtime from "../cloudflare/mmg-ios/src/kairos-production-entry-revenue-dashboard-v1.js";

describe("Kairos dashboard root asset routing", () => {
  it("serves the dashboard HTML for root navigation without invoking legacy runtime fallbacks", async () => {
    const assetsFetch = vi.fn(async () => new Response("<!doctype html><html><body>Kairos</body></html>", {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": "attachment; filename=document.txt",
      },
    }));

    const response = await runtime.fetch(
      new Request("https://mmg-ios.example.workers.dev/", {
        headers: { "Sec-Fetch-Mode": "navigate" },
      }),
      { ASSETS: { fetch: assetsFetch } },
      {},
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
    expect(await response.text()).toContain("Kairos");
    expect(assetsFetch).toHaveBeenCalledOnce();
  });

  it("continues routing API requests through the Worker runtime", async () => {
    const response = await runtime.fetch(
      new Request("https://mmg-ios.example.workers.dev/api/kairos/revenue/products"),
      {},
      {},
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("x-kairos-revenue-dashboard-entry")).toBeTruthy();
  });
});
