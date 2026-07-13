import runtime, { KairosProject } from "./kairos-production-entry-v10.js";

const BUILD = "kairos-production-entry-20260713-11";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const response = await runtime.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Website-Retool", "custom-schema-markup-preserving-v1");
    headers.set("X-Kairos-Visual-Lock", "structure-and-markup-signature");
    if (new URL(request.url).pathname.startsWith("/api/shopify/staging/")) {
      headers.set("Cache-Control", "no-store");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
