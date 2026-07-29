export const KAIROS_PRODUCTION_READINESS_BUILD = "kairos-production-readiness-20260728-1";

const REQUIRED_BINDINGS = Object.freeze([
  "OPENAI_API_KEY",
  "KAIROS_PRODUCTION_MODEL",
  "REVENUE_ASSETS_R2",
  "REVENUE_RUNS",
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_ADMIN_ACCESS_TOKEN",
]);

export function projectProductionRevenueReadiness(env = {}, product = {}) {
  const bindingChecks = REQUIRED_BINDINGS.map((name) => Object.freeze({
    id: `binding:${name}`,
    passed: Boolean(env[name]),
  }));

  const productChecks = Object.freeze([
    check("product-seeded", Boolean(product.revenueProductId)),
    check("production-jobs-configured", Array.isArray(product.productionJobs) && product.productionJobs.length >= 8),
    check("price-configured", Number(product.price?.amount ?? product.price) > 0),
    check("shopify-metadata-configured", Boolean(product.shopify?.handle && product.shopify?.title)),
    check("publication-disabled", product.automaticPublicationAllowed !== true),
  ]);

  const checks = Object.freeze([...bindingChecks, ...productChecks]);
  const blockers = Object.freeze(checks.filter((item) => !item.passed).map((item) => item.id));

  return Object.freeze({
    ready: blockers.length === 0,
    checks,
    blockers,
    nextAction: blockers.length === 0 ? "bootstrap-first-revenue-run" : "configure-production-runtime",
    automaticPublicationAllowed: false,
    build: KAIROS_PRODUCTION_READINESS_BUILD,
  });
}

function check(id, passed) {
  return Object.freeze({ id, passed: Boolean(passed) });
}
