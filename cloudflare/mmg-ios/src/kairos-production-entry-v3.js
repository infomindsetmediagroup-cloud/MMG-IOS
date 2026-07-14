import canonicalRuntime, { KairosProject } from "./kairos-production-entry.js";
import { certifyOffer } from "./kairos-offer-builder-v1.js";
import { certifyLaunchReadiness } from "./kairos-product-launch-studio-v1.js";

const BUILD = "kairos-production-entry-20260714-22";
export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "PATCH" && /^\/api\/offers\/[^/]+\/certify$/.test(url.pathname)) {
        const parts = url.pathname.split("/").filter(Boolean);
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, ...await certifyOffer(request, decodeURIComponent(parts[2]), payload) });
      }
      if (request.method === "PATCH" && /^\/api\/product-launch\/projects\/[^/]+\/certify$/.test(url.pathname)) {
        const parts = url.pathname.split("/").filter(Boolean);
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, ...await certifyLaunchReadiness(request, decodeURIComponent(parts[3]), payload) });
      }
      return stamp(await canonicalRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({ status: "failed", build: BUILD, route: url.pathname, error: { code: "certification_failed", message: error instanceof Error ? error.message : "Certification failed." } }, 409);
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof canonicalRuntime.scheduled === "function") return canonicalRuntime.scheduled(controller, env, ctx);
  },
};

async function safeJSON(response) { try { return await response.json(); } catch { return {}; } }
function stamp(response) { const headers = new Headers(response.headers); headers.set("X-Kairos-Certification-Runtime", BUILD); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD } }); }
