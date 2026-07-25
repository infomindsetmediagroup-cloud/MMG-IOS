import { getAgentByName, routeAgentRequest } from "agents";
import { KAIROS_PROJECT_AGENT_BUILD } from "./kairos-project-agent-v1.js";

export const KAIROS_PROJECT_AGENT_API_BUILD = "kairos-project-agent-api-20260725-1";

export async function handleKairosProjectAgentAPI(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/kairos\/project-agents\/([a-z0-9][a-z0-9-]{7,127})(?:\/(.*))?$/i);
  if (!match) return null;
  if (!env?.KAIROS_PROJECT_AGENT) return jsonError(503, "INTERNAL_CONTRACT_VIOLATION", "The Kairos project-agent binding is unavailable.");

  const projectId = match[1].toLowerCase();
  const action = String(match[2] || "state").replace(/\/+$/, "");
  const agent = await getAgentByName(env.KAIROS_PROJECT_AGENT, projectId, {
    locationHint: "wnam",
    routingRetry: { maxAttempts: 3 },
  });

  try {
    if (request.method === "GET" && action === "state") {
      return json({ status: "ok", projectId, state: await agent.getProjectState() });
    }

    if (request.method === "POST" && action === "bootstrap") {
      const body = await readJSON(request);
      const state = await agent.bootstrapProject({ ...body, projectId });
      return json({ status: "created", projectId, state }, 201);
    }

    if (request.method === "POST" && action === "workflow/start") {
      const body = await readJSON(request);
      const result = await agent.startFoundationWorkflow({ ...body, projectId });
      return json({ status: result.reused ? "existing" : "started", projectId, ...result }, result.reused ? 200 : 202);
    }

    const approvalMatch = action.match(/^workflow\/([^/]+)\/(approve|reject)$/);
    if (request.method === "POST" && approvalMatch) {
      const body = await readJSON(request);
      const instanceId = decodeURIComponent(approvalMatch[1]);
      const result = approvalMatch[2] === "approve"
        ? await agent.approveFoundationWorkflow(instanceId, body)
        : await agent.rejectFoundationWorkflow(instanceId, body);
      return json({ status: "accepted", projectId, ...result }, 202);
    }

    return jsonError(405, "INTERNAL_CONTRACT_VIOLATION", "This project-agent operation is not allowed.");
  } catch (error) {
    return jsonError(400, "INTERNAL_CONTRACT_VIOLATION", String(error?.message || error || "The project-agent request failed."));
  }
}

export async function routeKairosProjectAgentRequest(request, env) {
  return routeAgentRequest(request, env, {
    prefix: "/api/agents",
    locationHint: "wnam",
  });
}

async function readJSON(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The request body must be valid JSON.");
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Project-Agent": KAIROS_PROJECT_AGENT_BUILD,
      "X-Kairos-Project-Agent-API": KAIROS_PROJECT_AGENT_API_BUILD,
      "X-Kairos-Contract-Version": "1.0.0",
    },
  });
}

function jsonError(status, code, message) {
  return json({
    status: "failed",
    error: {
      code,
      message,
      retriable: status >= 500,
      stage: "project_agent_api",
    },
  }, status);
}
