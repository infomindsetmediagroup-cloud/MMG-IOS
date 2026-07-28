import { routeFirstRevenueLiveRequest } from "./kairos-first-revenue-live-router-v1.js";

export const KAIROS_REVENUE_PRODUCTION_ROUTER_BUILD = "kairos-revenue-production-router-20260728-1";

export async function routeKairosRevenueProductionRequest(request = {}, context = {}) {
  const url = new URL(request.url || "https://kairos.invalid/");
  if (!url.pathname.startsWith("/api/kairos/revenue/")) return null;

  const preflight = evaluateRevenueRuntimePreflight(context.env || {});
  if (!preflight.ready && request.method !== "GET") {
    return json({ error: { code: "REVENUE_RUNTIME_NOT_READY", message: "Revenue production runtime is not ready.", blockers: preflight.blockers }, preflight }, 503);
  }

  const response = await routeFirstRevenueLiveRequest(request, {
    firstRevenueStore: context.firstRevenueStore,
    revenueStore: context.revenueStore,
    env: context.env || {},
  });
  if (!response) return null;
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Revenue-Runtime", KAIROS_REVENUE_PRODUCTION_ROUTER_BUILD);
  headers.set("X-Kairos-Automatic-Publication", "disabled");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

export function evaluateRevenueRuntimePreflight(env = {}) {
  const checks = Object.freeze({
    openaiKey: Boolean(env.OPENAI_API_KEY),
    assetBucket: Boolean(env.KAIROS_REVENUE_ASSETS),
    projectStore: Boolean(env.KAIROS_PROJECTS),
    revenueStore: Boolean(env.KAIROS_REVENUE_PRODUCTS || env.KAIROS_PROJECTS),
    firstRunStore: Boolean(env.KAIROS_FIRST_REVENUE_RUNS || env.KAIROS_PROJECTS),
    productionModel: Boolean(env.KAIROS_REVENUE_MODEL || env.OPENAI_MODEL),
  });
  const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return Object.freeze({ ready: blockers.length === 0, checks, blockers: Object.freeze(blockers), automaticPublicationAllowed: false, build: KAIROS_REVENUE_PRODUCTION_ROUTER_BUILD });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Kairos-Automatic-Publication": "disabled" } });
}
