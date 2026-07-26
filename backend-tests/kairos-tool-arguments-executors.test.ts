// @ts-nocheck
import { describe, expect, it } from "vitest";
import { validateKairosToolArguments } from "../cloudflare/mmg-ios/src/kairos-tool-arguments-v1.js";
import { executeKairosTool } from "../cloudflare/mmg-ios/src/kairos-tool-executors-v1.js";
import { getKairosTool } from "../cloudflare/mmg-ios/src/kairos-tool-registry-v1.js";

describe("Kairos tool argument schemas", () => {
  it("rejects unexpected fields", () => {
    const result = validateKairosToolArguments("knowledge.search", { query: "publishing", arbitrary: true });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("TOOL_ARGUMENTS_EXCESS");
  });

  it("normalizes bounded knowledge search arguments", () => {
    const result = validateKairosToolArguments("knowledge.search", { query: "  publishing doctrine  ", limit: 99 });
    expect(result.ok).toBe(true);
    expect(result.arguments).toEqual({ query: "publishing doctrine", limit: 8 });
  });

  it("limits Shopify updates to approved fields", () => {
    const result = validateKairosToolArguments("shopify.product.update", { productId: "gid://shopify/Product/1", changes: { price: "9.99" } });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("TOOL_ARGUMENTS_EXCESS");
  });
});

describe("Kairos governed executors", () => {
  it("executes Knowledge Vault search as verified read-only evidence", async () => {
    const tool = getKairosTool("knowledge.search");
    const result = await executeKairosTool({ tool, arguments: { query: "governance", limit: 2 }, env: {}, identity: "service-token" });
    expect(result.verified).toBe(true);
    expect(result.source).toBe("kairos-knowledge-vault");
    expect(result.evidenceCount).toBeGreaterThan(0);
  });

  it("keeps mutation executors disconnected", async () => {
    const tool = getKairosTool("shopify.product.update");
    await expect(executeKairosTool({ tool, arguments: { productId: "gid://shopify/Product/1", changes: { title: "Test" } }, env: {}, identity: "service-token" })).rejects.toMatchObject({ code: "MUTATION_EXECUTOR_UNAVAILABLE" });
  });
});
