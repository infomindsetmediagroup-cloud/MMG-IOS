import finalWorker from "./final-worker.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/theme-plan" || request.method !== "POST") {
      return finalWorker.fetch(request, env, ctx);
    }

    const response = await finalWorker.fetch(request, env, ctx);
    if (response.ok || response.status !== 409) return response;

    // final-worker already contains the verified Shopify fallback. The remaining
    // live incompatibility is its error-envelope gate. Mark the conflict with the
    // canonical recoverable envelope and retry once through that existing route.
    const originalText = await response.clone().text();
    const retryRequest = new Request(request, {
      headers: new Headers(request.headers),
    });
    retryRequest.headers.set("X-MMG-Theme-Plan-Conflict", "mutation_plan_blocked");

    const retried = await finalWorker.fetch(retryRequest, env, ctx);
    if (retried.ok || retried.status !== 409) return retried;

    return new Response(originalText, {
      status: response.status,
      headers: response.headers,
    });
  },
};
