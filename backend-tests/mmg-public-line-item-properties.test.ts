import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "..");
const source = readFileSync(
  resolve(
    repositoryRoot,
    "shopify/snippets/mmg-public-line-item-properties.liquid",
  ),
  "utf8",
);

describe("MMG public line item property renderer", () => {
  it("filters every underscore-prefixed private property", () => {
    expect(source).toContain("assign mmg_property_first_character");
    expect(source).toContain("mmg_property_first_character != '_'");
    expect(source).toContain("mmg_property_value != blank");
    expect(source).not.toContain("_mmg_subscription_plan_code");
    expect(source).not.toContain("_mmg_recurring_consent");
    expect(source).not.toContain("_mmg_replacement_token");
  });

  it("escapes public names and values while preserving safe upload links", () => {
    expect(source).toContain("mmg_property_name | escape");
    expect(source).toContain("mmg_property_value | escape");
    expect(source).toContain("contains '/uploads/'");
    expect(source).toContain('rel="noopener"');
  });

  it("renders no empty property container", () => {
    expect(source).toContain("assign mmg_has_public_properties = false");
    expect(source).toContain("if mmg_has_public_properties");
  });
});
