export const MMG_SHOPIFY_MONEY_NORMALIZATION_VERSION = "1.0.0" as const;

export type MMGShopifyMoneySource =
  | "storefront_product_js_cents"
  | "catalog_products_json_decimal"
  | "admin_graphql_decimal";

export interface MMGShopifyMoneyFormatOptions {
  currency?: string;
  locale?: string;
  fallback?: string;
}

const DECIMAL_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const CENTS_PATTERN = /^\d+$/;

const sanitize = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/^\$/u, "")
    .replace(/,/gu, "");

const formatMajorUnits = (
  amount: number,
  options: MMGShopifyMoneyFormatOptions = {},
): string => {
  if (!Number.isFinite(amount) || amount < 0) {
    return options.fallback ?? "";
  }
  return new Intl.NumberFormat(options.locale ?? "en-US", {
    style: "currency",
    currency: options.currency ?? "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatShopifyCents = (
  value: unknown,
  options: MMGShopifyMoneyFormatOptions = {},
): string => {
  const normalized = sanitize(value);
  if (!CENTS_PATTERN.test(normalized)) return options.fallback ?? "";
  const cents = Number(normalized);
  if (!Number.isSafeInteger(cents) || cents < 0) return options.fallback ?? "";
  return formatMajorUnits(cents / 100, options);
};

export const formatShopifyDecimal = (
  value: unknown,
  options: MMGShopifyMoneyFormatOptions = {},
): string => {
  const normalized = sanitize(value);
  if (!DECIMAL_PATTERN.test(normalized)) return options.fallback ?? "";
  return formatMajorUnits(Number(normalized), options);
};

export const formatShopifyMoney = (
  value: unknown,
  source: MMGShopifyMoneySource,
  options: MMGShopifyMoneyFormatOptions = {},
): string => {
  switch (source) {
    case "storefront_product_js_cents":
      return formatShopifyCents(value, options);
    case "catalog_products_json_decimal":
    case "admin_graphql_decimal":
      return formatShopifyDecimal(value, options);
    default: {
      const unreachable: never = source;
      throw new Error(`MMG_SHOPIFY_MONEY_SOURCE_UNSUPPORTED:${unreachable}`);
    }
  }
};

export const minimumShopifyDecimalVariantPrice = (
  variants: ReadonlyArray<{ price?: unknown }> | null | undefined,
  options: MMGShopifyMoneyFormatOptions = {},
): string => {
  const prices = (variants ?? [])
    .map((variant) => sanitize(variant.price))
    .filter((value) => DECIMAL_PATTERN.test(value))
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (prices.length === 0) return options.fallback ?? "";
  return formatMajorUnits(Math.min(...prices), options);
};
