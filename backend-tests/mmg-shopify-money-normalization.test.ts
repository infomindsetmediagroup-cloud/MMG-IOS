import { describe, expect, it } from "vitest";

import {
  formatShopifyCents,
  formatShopifyDecimal,
  formatShopifyMoney,
  minimumShopifyDecimalVariantPrice,
} from "../shopify/lib/mmg-shopify-money-normalization.js";

const CASES = [
  [495, "$4.95"],
  [995, "$9.95"],
  [1495, "$14.95"],
  [9795, "$97.95"],
  [19795, "$197.95"],
  [39795, "$397.95"],
] as const;

describe("MMG Shopify money normalization", () => {
  it.each(CASES)("formats %i storefront cents as %s", (input, expected) => {
    expect(formatShopifyCents(input)).toBe(expected);
    expect(formatShopifyCents(String(input))).toBe(expected);
    expect(
      formatShopifyMoney(input, "storefront_product_js_cents"),
    ).toBe(expected);
  });

  it.each([
    ["4.95", "$4.95"],
    ["9.95", "$9.95"],
    ["14.95", "$14.95"],
    ["97.95", "$97.95"],
    ["197.95", "$197.95"],
    ["397.95", "$397.95"],
    ["1,500.00", "$1,500.00"],
  ] as const)("formats decimal source %s as %s", (input, expected) => {
    expect(formatShopifyDecimal(input)).toBe(expected);
    expect(
      formatShopifyMoney(input, "catalog_products_json_decimal"),
    ).toBe(expected);
    expect(formatShopifyMoney(input, "admin_graphql_decimal")).toBe(
      expected,
    );
  });

  it("never guesses money units from magnitude", () => {
    expect(formatShopifyDecimal("995")).toBe("$995.00");
    expect(formatShopifyCents("995")).toBe("$9.95");
    expect(formatShopifyDecimal("39795")).toBe("$39,795.00");
    expect(formatShopifyCents("39795")).toBe("$397.95");
  });

  it("rejects ambiguous or malformed values instead of silently changing units", () => {
    expect(formatShopifyCents("9.95")).toBe("");
    expect(formatShopifyDecimal("$9.955")).toBe("");
    expect(formatShopifyDecimal("free")).toBe("");
    expect(formatShopifyCents(-1)).toBe("");
    expect(formatShopifyDecimal(null, { fallback: "Unavailable" })).toBe(
      "Unavailable",
    );
  });

  it("selects the minimum decimal variant price without a cents heuristic", () => {
    expect(
      minimumShopifyDecimalVariantPrice([
        { price: "397.95" },
        { price: "97.95" },
        { price: "197.95" },
      ]),
    ).toBe("$97.95");
  });
});
