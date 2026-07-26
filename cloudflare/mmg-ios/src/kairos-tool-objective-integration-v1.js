import { classifyKairosToolRequest, getKairosTool } from "./kairos-tool-registry-v1.js";
import { validateKairosToolArguments } from "./kairos-tool-schemas-v1.js";
import { executeKairosReadTool, KAIROS_TOOL_EXECUTOR_BUILD } from "./kairos-tool-executors-v1.js";
import { handleKairosToolApprovalAPI } from "./kairos-tool-approval-v1.js";

export const KAIROS_TOOL_OBJECTIVE_INTEGRATION_BUILD = "kairos-tool-objective-integration-20260725-1";
const ROUTE = /^\/api\/kairos\/?$/i;
const MAX_CONTEXT = 30000;

export async function handleToolAwareKairosObjective(request, env, handler) {
  const url = new URL(request.url);
  if (!ROUTE.test(url.pathname) || request.method !== "POST") return handler(request);
  const body = await request.clone().json().catch(() => null);
  const toolRequest = body?.toolRequest;
  if (!toolRequest || typeof toolRequest !== "object") return handler(request);

  const classification = classifyKairosToolRequest(toolRequest.toolId);
  if (!classification.allowed) return json({
    success: false,
    status: "blocked",
    requiresApproval: false,
    actions: [],
    error: { code: "TOOL_NOT_REGISTERED", message: classification.reason },
  }, 403);

  const validation = validateKairosToolArguments(classification.tool.id, toolRequest.arguments || {});
  if (!validation.ok) return json({
    success: false,
    status: "failed",
    requiresApproval: false,
    actions: [],
    error: { code: "TOOL_ARGUMENTS_INVALID", message: validation.error },
  }, 400);

  if (classification.tool.approvalRequired) {
    const proposalRequest = new Request(new URL("/api/kairos/tools/propose", request.url), {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ toolId: classification.tool.id, arguments: validation.arguments, ttlSeconds: toolRequest.ttlSeconds }),
    });
    const proposalResponse = await handleKairosToolApprovalAPI(proposalRequest, env);
    const proposal = await proposalResponse.json().catch(() => ({}));
    if (!proposalResponse.ok) return stamp(json(proposal, proposalResponse.status));
    return stamp(json({
      success: true,
      requestId: request.headers.get("X-Kairos-Request-Id") || null,
      status: "approval_required",
      message: "Kairos prepared a governed action proposal. No external mutation was executed.",
      requiresApproval: true,
      actions: [{
        type: "tool_approval",
        status: "proposed",
        approvalId: proposal.approvalId,
        toolId: classification.tool.id,
        toolLabel: classification.tool.label,
        risk: classification.tool.risk,
        expiresAt: proposal.expiresAt,
        confirmationRequired: proposal.confirmationRequired,
        executorAvailable: false,
        continuationStatus: "blocked_until_executor_available",
      }],
      governance: { classification: "approval_required", reason: classification.reason },
      toolEvidence: [],
    }, 202));
  }

  try {
    const result = await executeKairosReadTool({ tool: getKairosTool(classification.tool.id), arguments: validation.arguments, env });
    const evidence = {
      verified: true,
      toolId: classification.tool.id,
      executor: classification.tool.executor,
      executedAt: new Date().toISOString(),
      result,
    };
    const context = [
      String(body.context || "").trim(),
      `VERIFIED GOVERNED TOOL EVIDENCE:\nTool: ${evidence.toolId}\nExecutor: ${evidence.executor}\nVerified: true\nResult: ${JSON.stringify(result)}`,
      "TOOL EVIDENCE RULE: Treat this result as verified execution evidence. Do not claim any operation beyond the returned result.",
    ].filter(Boolean).join("\n\n").slice(0, MAX_CONTEXT);
    const contextualRequest = new Request(request, {
      body: JSON.stringify({ ...body, context, verifiedToolEvidence: [evidence] }),
    });
    const response = await handler(contextualRequest);
    return stamp(await appendEvidence(response, evidence));
  } catch (error) {
    return stamp(json({
      success: false,
      status: "failed",
      requiresApproval: false,
      actions: [],
      error: { code: error?.code || "READ_EXECUTOR_FAILED", message: error?.message || "The governed read executor failed." },
    }, Number(error?.status) || 502));
  }
}

async function appendEvidence(response, evidence) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return response;
  return json({ ...payload, toolEvidence: [evidence] }, response.status, response.headers);
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Tool-Objective-Integration", KAIROS_TOOL_OBJECTIVE_INTEGRATION_BUILD);
  headers.set("X-Kairos-Tool-Executor", KAIROS_TOOL_EXECUTOR_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200, inheritedHeaders) {
  const headers = new Headers(inheritedHeaders || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(value), { status, headers });
}
