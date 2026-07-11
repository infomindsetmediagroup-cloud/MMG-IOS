import { describe, expect, it } from "vitest";
import { parseThemeMutationRequest, SHOPIFY_THEME_FILES_UPSERT } from "../api/theme-mutation-core.js";

function request(overrides: Record<string, unknown> = {}) {
  return {
    actionType: SHOPIFY_THEME_FILES_UPSERT,
    objective: "Apply the approved homepage patch.",
    approval: { approved: true, actor: "Mike", approvedAt: "2026-07-11T20:00:00.000Z" },
    mutation: {
      themeId: "123456789",
      files: [{ key: "sections/mmg-homepage.liquid", value: "<section>Approved</section>" }],
    },
    ...overrides,
  };
}

describe("Shopify theme mutation request", () => {
  it("accepts an approved bounded text-file mutation", () => {
    const parsed = parseThemeMutationRequest(request());
    expect(parsed.actionType).toBe(SHOPIFY_THEME_FILES_UPSERT);
    expect(parsed.mutation.themeId).toBe("123456789");
    expect(parsed.mutation.files[0]?.key).toBe("sections/mmg-homepage.liquid");
  });

  it("requires explicit approval", () => {
    expect(() => parseThemeMutationRequest(request({ approval: { approved: false } }))).toThrow(/Approve this mutation/);
  });

  it("rejects path traversal and unapproved file locations", () => {
    expect(() => parseThemeMutationRequest(request({
      mutation: { themeId: "123456789", files: [{ key: "../layout/theme.liquid", value: "unsafe" }] },
    }))).toThrow(/not allowed/);
  });

  it("rejects duplicate theme file targets", () => {
    expect(() => parseThemeMutationRequest(request({
      mutation: {
        themeId: "123456789",
        files: [
          { key: "assets/mmg.css", value: "a{}" },
          { key: "assets/mmg.css", value: "b{}" },
        ],
      },
    }))).toThrow(/only once/);
  });

  it("requires an exact mutation plan", () => {
    expect(() => parseThemeMutationRequest(request({ mutation: null }))).toThrow(/exact Shopify mutation plan/);
  });
});
