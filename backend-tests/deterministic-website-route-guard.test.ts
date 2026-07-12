import { describe, expect, it, vi } from "vitest";
import worker from "../cloudflare/mmg-ios/src/kairos-command-hub-v30.js";

describe("deterministic Website Retool route guard", () => {
  it("never calls the OpenAI API when website is submitted through the generic hub route", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      expect(url).not.toContain("api.openai.com");
      throw new Error(`Unexpected external request: ${url}`);
    });

    const response = await worker.fetch(new Request("https://kairos.example/api/hub/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "website", objective: "Improve homepage clarity without changing its structure." }),
    }), {}, {});

    expect(response.status).not.toBe(429);
    expect(fetchSpy.mock.calls.every(([input]) => !String(input).includes("api.openai.com"))).toBe(true);
    fetchSpy.mockRestore();
  });
});
