import { handleProductionRevenueRequest } from "./kairos-production-revenue-entrypoint-v1.js";

export const KAIROS_PRODUCTION_FETCH_CHAIN_BUILD = "kairos-production-fetch-chain-20260728-1";

export async function routeKairosProductionFetch(context = {}, request) {
  const revenueResponse = await handleProductionRevenueRequest({
    env: context.env,
    handlers: context.revenueHandlers,
    revenueStore: context.revenueStore,
    authenticateOperator: context.authenticateOperator,
  }, request);

  if (revenueResponse) return withBoundaryHeaders(revenueResponse);
  if (typeof context.next === "function") return context.next(request);
  return new Response("Not Found", { status: 404, headers: boundaryHeaders() });
}

function withBoundaryHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(boundaryHeaders())) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function boundaryHeaders() {
  return {
    "cache-control": "no-store",
    "x-kairos-automatic-publication": "disabled",
    "x-kairos-production-fetch-chain-build": KAIROS_PRODUCTION_FETCH_CHAIN_BUILD,
  };
}
