import { dispatchFirstRevenueLiveRequest } from "./kairos-first-revenue-live-dispatcher-v1.js";

export const KAIROS_FIRST_REVENUE_LIVE_ROUTER_BUILD = "kairos-first-revenue-live-router-20260728-1";

export async function routeFirstRevenueLiveRequest(request, env = {}, context = {}) {
  const response = await dispatchFirstRevenueLiveRequest(request, {
    firstRevenueStore: context.firstRevenueStore || env.KAIROS_FIRST_REVENUE_STORE,
    revenueStore: context.revenueStore || env.KAIROS_REVENUE_STORE,
    env,
  });
  if (!response) return null;
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Route-Build", KAIROS_FIRST_REVENUE_LIVE_ROUTER_BUILD);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Automatic-Publication", "disabled");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
