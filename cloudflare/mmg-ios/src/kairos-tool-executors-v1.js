import { retrieveKairosKnowledge } from "./kairos-knowledge-vault-v1.js";

export const KAIROS_TOOL_EXECUTORS_BUILD = "kairos-tool-executors-20260725-1";

export async function executeKairosTool({ tool, arguments: args, env, identity, approvalId }) {
  if (!tool?.id || !tool.executor) throw executorError("TOOL_EXECUTOR_INVALID", "Registered tool metadata is required.");
  if (tool.capability === "mutation") throw executorError("MUTATION_EXECUTOR_UNAVAILABLE", "Production mutation executors are not connected in this Sprint 3 increment.");

  switch (tool.executor) {
    case "knowledge-vault":
      return executeKnowledgeSearch(env, args);
    case "publishing-readonly":
      return executePublishingProjectRead(env, args);
    case "shopify-readonly":
      throw executorError("SHOPIFY_READ_EXECUTOR_UNAVAILABLE", "The governed Shopify read adapter is not configured.");
    default:
      throw executorError("EXECUTOR_NOT_REGISTERED", "The registered executor has no governed adapter.");
  }
}

async function executeKnowledgeSearch(env, args) {
  const result = await retrieveKairosKnowledge(env, args);
  return {
    verified: true,
    source: "kairos-knowledge-vault",
    evidenceCount: result.evidenceCount,
    sourceMode: result.sourceMode,
    results: result.results,
  };
}

async function executePublishingProjectRead(env, args) {
  if (!env?.KAIROS_PROJECTS) throw executorError("PUBLISHING_STORAGE_UNAVAILABLE", "Publishing project storage is unavailable.");
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(String(args.projectId)));
  const response = await stub.fetch(new Request(`https://kairos.internal/projects/${encodeURIComponent(args.projectId)}`, {
    method: "GET",
    headers: { Accept: "application/json", "X-Kairos-Read-Only": "true" },
  }));
  if (!response.ok) throw executorError("PUBLISHING_PROJECT_READ_FAILED", `Publishing project read returned HTTP ${response.status}.`);
  const payload = await response.json().catch(() => ({}));
  return { verified: true, source: "kairos-project-store", projectId: args.projectId, project: payload };
}

function executorError(code, message) { const error = new Error(message); error.code = code; return error; }
