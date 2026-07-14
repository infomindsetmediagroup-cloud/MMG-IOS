import canonicalRuntime, { KairosProject } from "./kairos-production-entry.js";
import { certifyOffer } from "./kairos-offer-builder-v1.js";
import { certifyLaunchReadiness } from "./kairos-product-launch-studio-v1.js";
import { createSupportCase, readLatestSupportCase, readSupportCase, resolveSupportCase } from "./kairos-support-intelligence-v1.js";
import { applySupportLearning } from "./kairos-customer-journey-v1.js";

const BUILD = "kairos-production-entry-20260714-23";
export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "PATCH" && /^\/api\/offers\/[^/]+\/certify$/.test(url.pathname)) {
        const parts = url.pathname.split("/").filter(Boolean);
        return json({ status: "completed", build: BUILD, ...await certifyOffer(request, decodeURIComponent(parts[2]), await safeJSON(request.clone())) });
      }
      if (request.method === "PATCH" && /^\/api\/product-launch\/projects\/[^/]+\/certify$/.test(url.pathname)) {
        const parts = url.pathname.split("/").filter(Boolean);
        return json({ status: "completed", build: BUILD, ...await certifyLaunchReadiness(request, decodeURIComponent(parts[3]), await safeJSON(request.clone())) });
      }
      if (request.method === "POST" && url.pathname === "/api/support-intelligence/cases") return json({ status: "completed", build: BUILD, ...await createSupportCase(request, await safeJSON(request.clone())) }, 201);
      if (request.method === "GET" && url.pathname === "/api/support-intelligence/latest") {
        const result = await readLatestSupportCase(request);
        return result ? json({ status: "completed", build: BUILD, ...result }) : json({ status: "not-ready", build: BUILD }, 404);
      }
      if (request.method === "PATCH" && /^\/api\/support-intelligence\/cases\/[^/]+\/resolve$/.test(url.pathname)) {
        const parts = url.pathname.split("/").filter(Boolean);
        return json({ status: "completed", build: BUILD, ...await resolveSupportCase(request, decodeURIComponent(parts[2]), await safeJSON(request.clone())) });
      }
      if (request.method === "GET" && /^\/api\/support-intelligence\/cases\/[^/]+$/.test(url.pathname)) {
        const parts = url.pathname.split("/").filter(Boolean), result = await readSupportCase(request, decodeURIComponent(parts[2]));
        return result ? json({ status: "completed", build: BUILD, ...result }) : json({ status: "not-found", build: BUILD }, 404);
      }
      if (request.method === "PATCH" && /^\/api\/customer-journeys\/[^/]+\/support-learning$/.test(url.pathname)) {
        const parts = url.pathname.split("/").filter(Boolean);
        return json({ status: "completed", build: BUILD, ...await applySupportLearning(request, decodeURIComponent(parts[2]), await safeJSON(request.clone())) });
      }
      return stamp(await canonicalRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({ status: "failed", build: BUILD, route: url.pathname, error: { code: "governed_operation_failed", message: error instanceof Error ? error.message : "Governed operation failed." } }, 409);
    }
  },
  async scheduled(controller, env, ctx) { if (typeof canonicalRuntime.scheduled === "function") return canonicalRuntime.scheduled(controller, env, ctx); },
};

async function safeJSON(response) { try { return await response.json(); } catch { return {}; } }
function stamp(response) { const headers = new Headers(response.headers); headers.set("X-Kairos-Certification-Runtime", BUILD); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD } }); }
