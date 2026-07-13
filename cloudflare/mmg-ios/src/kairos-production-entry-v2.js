import runtime, { KairosProject } from "./kairos-production-entry-v1.js";
import {
  completeApprovedWorkDispatch,
  dispatchApprovedBriefingItem,
  readApprovedWorkDispatch,
  readApprovedWorkReceipt,
} from "./kairos-approved-work-dispatcher-v1.js";
import { runApprovedWebsiteExecution } from "./kairos-approved-website-executor-v1.js";

const BUILD = "kairos-production-entry-20260713-5";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/api/executive-briefing/execute") {
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, workOrder: await dispatchApprovedBriefingItem(request, payload) });
      }

      if (request.method === "POST" && url.pathname === "/api/executive-briefing/execution/run") {
        const payload = await safeJSON(request.clone());
        const result = await runApprovedWebsiteExecution(request, env, payload);
        return json({ status: result.status, build: BUILD, result }, result.status === "needs-preparation" ? 409 : 200);
      }

      if (request.method === "POST" && url.pathname === "/api/executive-briefing/execution/complete") {
        const payload = await safeJSON(request.clone());
        const completed = await completeApprovedWorkDispatch(request, payload);
        return json({ status: "completed", build: BUILD, ...completed });
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/executive-briefing/execution/") && url.pathname.endsWith("/receipt")) {
        const parts = url.pathname.split("/").filter(Boolean);
        const itemID = decodeURIComponent(parts[parts.length - 2] || "");
        const receipt = await readApprovedWorkReceipt(request, itemID);
        return receipt
          ? json({ status: "completed", build: BUILD, receipt })
          : json({ status: "not-ready", build: BUILD, message: "No verified execution receipt exists for this item." }, 404);
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/executive-briefing/execution/")) {
        const itemID = decodeURIComponent(url.pathname.split("/").pop() || "");
        const workOrder = await readApprovedWorkDispatch(request, itemID);
        return workOrder
          ? json({ status: "completed", build: BUILD, workOrder })
          : json({ status: "not-ready", build: BUILD, message: "No execution work order exists for this item." }, 404);
      }

      return await runtime.fetch(request, env, ctx);
    } catch (error) {
      const isShopifyExecution = url.pathname.startsWith("/api/shopify/staging/") || url.pathname.includes("/execution/run");
      const message = error instanceof Error && error.message ? error.message : "Kairos encountered an unexpected production runtime failure.";
      const status = Number(error?.statusCode || error?.status || 500);
      const safeStatus = status >= 400 && status <= 599 ? status : 500;
      return new Response(JSON.stringify({
        status: safeStatus >= 500 ? "failed" : "needs-input",
        build: BUILD,
        route: url.pathname,
        error: { code: error?.code || (isShopifyExecution ? "approved_website_execution_failed" : "production_runtime_failed"), message },
      }), {
        status: safeStatus,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-MMG-Runtime": BUILD,
          "X-Kairos-Exception-Guard": "active",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  },
};

async function safeJSON(response) { try { return await response.json(); } catch { return {}; } }
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Approved-Work-Dispatcher": "active",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
