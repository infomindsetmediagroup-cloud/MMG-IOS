import runtime, { KairosProject } from "./kairos-production-entry-v1.js";
import {
  completeApprovedWorkDispatch,
  dispatchApprovedBriefingItem,
  readApprovedWorkDispatch,
  readApprovedWorkReceipt,
} from "./kairos-approved-work-dispatcher-v1.js";
import { runApprovedWebsiteExecution } from "./kairos-approved-website-executor-v1.js";
import {
  prepareExecutiveCorrection,
  readExecutiveCorrection,
  resubmitExecutiveCorrection,
} from "./kairos-executive-correction-loop-v1.js";
import {
  decideSocialPackage,
  prepareSocialPackage,
  readLatestSocialPackage,
  readSocialPackage,
} from "./kairos-social-production-v1.js";
import {
  createTask,
  createWorkflow,
  listWorkflows,
  readWorkflow,
  updateTask,
  updateWorkflow,
} from "./kairos-workflow-runtime-v1.js";
import { dispatchObjective, routeObjective } from "./kairos-objective-router-v1.js";

const BUILD = "kairos-production-entry-20260713-9";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/api/objectives/route") {
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, route: routeObjective(payload) });
      }
      if (request.method === "POST" && url.pathname === "/api/objectives/dispatch") {
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, dispatch: await dispatchObjective(request, payload) }, 201);
      }
      if (request.method === "POST" && url.pathname === "/api/workflows") {
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, workflow: await createWorkflow(request, payload) }, 201);
      }
      if (request.method === "GET" && url.pathname === "/api/workflows") {
        return json({ status: "completed", build: BUILD, workflows: await listWorkflows(request) });
      }
      if (request.method === "GET" && /^\/api\/workflows\/[^/]+$/.test(url.pathname)) {
        const workflowID = decodeURIComponent(url.pathname.split("/").pop() || "");
        const workflow = await readWorkflow(request, workflowID);
        return workflow ? json({ status: "completed", build: BUILD, workflow }) : json({ status: "not-found", build: BUILD }, 404);
      }
      if (request.method === "POST" && /^\/api\/workflows\/[^/]+\/tasks$/.test(url.pathname)) {
        const parts = url.pathname.split("/").filter(Boolean);
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, workflow: await createTask(request, decodeURIComponent(parts[2]), payload) }, 201);
      }
      if (request.method === "PATCH" && /^\/api\/workflows\/[^/]+\/tasks\/[^/]+$/.test(url.pathname)) {
        const parts = url.pathname.split("/").filter(Boolean);
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, workflow: await updateTask(request, decodeURIComponent(parts[2]), decodeURIComponent(parts[4]), payload) });
      }
      if (request.method === "PATCH" && /^\/api\/workflows\/[^/]+$/.test(url.pathname)) {
        const workflowID = decodeURIComponent(url.pathname.split("/").pop() || "");
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, workflow: await updateWorkflow(request, workflowID, payload) });
      }
      if (request.method === "POST" && url.pathname === "/api/social-production/prepare") {
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, socialPackage: await prepareSocialPackage(request, payload) });
      }
      if (request.method === "POST" && url.pathname === "/api/social-production/decide") {
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, socialPackage: await decideSocialPackage(request, payload) });
      }
      if (request.method === "GET" && url.pathname === "/api/social-production/latest") {
        const socialPackage = await readLatestSocialPackage(request);
        return socialPackage ? json({ status: "completed", build: BUILD, socialPackage }) : json({ status: "not-ready", build: BUILD }, 404);
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/social-production/")) {
        const packageID = decodeURIComponent(url.pathname.split("/").pop() || "");
        const socialPackage = await readSocialPackage(request, packageID);
        return socialPackage ? json({ status: "completed", build: BUILD, socialPackage }) : json({ status: "not-ready", build: BUILD }, 404);
      }
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
      if (request.method === "POST" && url.pathname === "/api/executive-briefing/fix/prepare") {
        const payload = await safeJSON(request.clone());
        return json({ status: "completed", build: BUILD, correction: await prepareExecutiveCorrection(request, payload) });
      }
      if (request.method === "POST" && url.pathname === "/api/executive-briefing/fix/resubmit") {
        const payload = await safeJSON(request.clone());
        const revised = await resubmitExecutiveCorrection(request, payload);
        return json({ status: "completed", build: BUILD, ...revised });
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/executive-briefing/fix/")) {
        const itemID = decodeURIComponent(url.pathname.split("/").pop() || "");
        const correction = await readExecutiveCorrection(request, itemID);
        return correction ? json({ status: "completed", build: BUILD, correction }) : json({ status: "not-ready", build: BUILD }, 404);
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/executive-briefing/execution/") && url.pathname.endsWith("/receipt")) {
        const parts = url.pathname.split("/").filter(Boolean);
        const itemID = decodeURIComponent(parts[parts.length - 2] || "");
        const receipt = await readApprovedWorkReceipt(request, itemID);
        return receipt ? json({ status: "completed", build: BUILD, receipt }) : json({ status: "not-ready", build: BUILD }, 404);
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/executive-briefing/execution/")) {
        const itemID = decodeURIComponent(url.pathname.split("/").pop() || "");
        const workOrder = await readApprovedWorkDispatch(request, itemID);
        return workOrder ? json({ status: "completed", build: BUILD, workOrder }) : json({ status: "not-ready", build: BUILD }, 404);
      }
      return await runtime.fetch(request, env, ctx);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Kairos encountered an unexpected production runtime failure.";
      return json({ status: "failed", build: BUILD, route: url.pathname, error: { code: "production_runtime_failed", message } }, 500);
    }
  },
};

async function safeJSON(response) { try { return await response.json(); } catch { return {}; } }
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Content-Type-Options": "nosniff" } });
}
