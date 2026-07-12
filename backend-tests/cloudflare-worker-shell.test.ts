import { describe, expect, it, vi } from "vitest";
// @ts-expect-error The deployed Worker is intentionally authored as an ES module.
import worker from "../cloudflare/mmg-ios/src/worker.js";

describe("reconciled Cloudflare worker", () => {
  it("serves the bundled Command Center shell from the asset binding", async () => {
    const assets = { fetch: vi.fn(async (_request: Request) => new Response("<!doctype html><title>Kairos</title>", { status: 200, headers: { "content-type": "text/html" } })) };
    const response = await worker.fetch(new Request("https://kairos.example/"), { ASSETS: assets }, {});

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Kairos");
    expect(response.headers.get("x-mmg-host")).toBe("cloudflare-assets");
    expect(response.headers.get("x-mmg-build")).toBe("command-center-reconciled-20260711-30");
    expect(assets.fetch).toHaveBeenCalledOnce();
    expect(assets.fetch.mock.calls[0][0].url).toBe("https://kairos.example/");
  });

  it("keeps API routes on the same consolidated worker", async () => {
    const response = await worker.fetch(new Request("https://kairos.example/api/health"), {}, {});
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.runtime).toBe("cloudflare-workers");
    expect(body.capabilities.cloudflareNative).toBe(true);
  });
});
