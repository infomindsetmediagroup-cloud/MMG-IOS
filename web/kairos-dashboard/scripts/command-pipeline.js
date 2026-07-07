import { queueOrchestratedCommand, createExecutionRun } from "./execution-orchestrator.js";
import { recordExecutionHistory } from "./execution-history.js";
import { pushNotification } from "./notifications.js";

const pipelineKey = "kairos.command.pipeline.v1";

function readPipeline() {
  try {
    return JSON.parse(localStorage.getItem(pipelineKey) || "[]");
  } catch {
    return [];
  }
}

function writePipeline(items) {
  localStorage.setItem(pipelineKey, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("kairos:command-pipeline-updated", { detail: { total: items.length } }));
  return items;
}

function classifyStage(command) {
  const text = String(command || "").toLowerCase();
  if (["approve", "review", "publish", "deploy", "release"].some(word => text.includes(word))) return "Approval";
  if (["fix", "update", "change", "create", "add", "build"].some(word => text.includes(word))) return "Execution";
  if (["audit", "check", "verify", "test"].some(word => text.includes(word))) return "Validation";
  return "Intake";
}

export function submitCommandPipeline(command) {
  const text = String(command || "").trim();
  if (!text) return null;

  const item = queueOrchestratedCommand(text);
  const run = createExecutionRun("Pipeline run for " + item.id);
  const stage = classifyStage(text);
  const pipelineItem = {
    id: "PIPE-" + item.id.replace(/[^0-9]/g, ""),
    workId: item.id,
    runId: run.id,
    command: text,
    stage,
    status: "Queued",
    lane: item.lane,
    priority: item.priority,
    createdAt: new Date().toLocaleString(),
    steps: [
      { label: "Intake", status: "Complete" },
      { label: "Classify", status: "Complete" },
      { label: "Queue Work", status: "Complete" },
      { label: "Create Run", status: "Complete" },
      { label: "Approval Gate", status: stage === "Approval" ? "Ready" : "Pending" }
    ]
  };

  writePipeline([pipelineItem, ...readPipeline()].slice(0, 40));
  recordExecutionHistory("Command pipeline intake", item.id + " linked to " + run.id, "Queued");
  pushNotification("Command pipeline created", pipelineItem.id + " linked work and execution run.", "Success");
  return { item, run, pipelineItem };
}

export function getCommandPipeline() {
  return readPipeline();
}

export function commandPipelineMetrics() {
  const items = readPipeline();
  return {
    total: items.length,
    execution: items.filter(item => item.stage === "Execution").length,
    approval: items.filter(item => item.stage === "Approval").length,
    validation: items.filter(item => item.stage === "Validation").length
  };
}
