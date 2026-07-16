import { inferenceRuntime, parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";
import { ledgerGet, ledgerList, ledgerUpsert } from "./kairos-operational-runtime-v1.js";

export const KAIROS_NATIVE_TASK_EXECUTION_BUILD = "kairos-native-task-execution-20260716-1";

const SAFE_STAGES = new Set(["observe", "understand", "decide", "verify", "preserve", "improve"]);
const HIGH_IMPACT_ACTIONS = new Set(["website", "release-control"]);
const HIGH_IMPACT_INTENT = /\b(?:publish(?:ed|ing)?|post(?:ed|ing)?\s+(?:to|on)|send|email|message\s+(?:a\s+)?customer|charge|bill|invoice|spend|buy|purchase|delete|destroy|drop|revoke|grant\s+(?:access|permission)|change\s+(?:access|permission|price|pricing)|deploy|release|go\s+live|live\s+storefront|launch\s+(?:a\s+)?(?:paid|public)|paid\s+media)\b/i;

export function classifyNativeTask(workflow, task, workItem = null) {
  const stage = normalizeStage(task?.stage || task?.title);
  const declaredClass = normalizeExecutionClass(task?.executionClass, stage);
  const taskIntent = [task?.title, task?.description].filter(Boolean).join("\n");
  const highImpact = stage === "execute" && (
    declaredClass === "high-impact-domain-action"
    || HIGH_IMPACT_ACTIONS.has(String(workItem?.action || ""))
    || HIGH_IMPACT_INTENT.test(taskIntent)
  );
  const approvalPending = Boolean(workflow?.approvalRequired && workflow?.approvalStatus !== "approved");
  const taskApprovalPending = Boolean(task?.approvalRequired && task?.approvalStatus !== "approved");
  const highImpactApprovalPending = highImpact && workflow?.approvalStatus !== "approved" && task?.approvalStatus !== "approved";
  const automaticEligible = !approvalPending && !taskApprovalPending && (SAFE_STAGES.has(stage) || (stage === "execute" && !highImpact));
  return {
    stage,
    executionClass: declaredClass,
    automaticEligible,
    approvalRequired: approvalPending || taskApprovalPending || highImpactApprovalPending,
    highImpact,
    reason: automaticEligible
      ? "eligible-verified-native-task"
      : highImpact
        ? highImpactApprovalPending ? "high-impact-execution-requires-approval" : "approved-high-impact-execution-requires-domain-service"
        : approvalPending || taskApprovalPending
          ? "constitutional-approval-pending"
          : "task-stage-not-eligible-for-native-autonomy",
  };
}

export async function executeNativeTask(env, input) {
  const { workflow, task, workItem = null, cycleID, decisionID, operatingSnapshot = null } = input || {};
  const classification = classifyNativeTask(workflow, task, workItem);
  if (!classification.automaticEligible) return blocked(classification.reason, classification);

  const runtime = inferenceRuntime(env);
  if (!runtime.configured) return blocked("enhanced-inference-required-for-verified-native-execution", classification);

  const priorArtifacts = (await ledgerList(env, "native-task-artifacts", 200))
    .filter(value => value?.workflowID === workflow?.id && value?.status === "verified")
    .slice(0, 8);
  const evidenceCatalog = buildEvidenceCatalog(workflow, workItem, operatingSnapshot, priorArtifacts);

  let generated;
  let parsed;
  try {
    generated = await runKairosIntelligence(env, {
      purpose: `native-task-${classification.stage}`,
      temperature: 0.1,
      maxTokens: 3200,
      system: "You are the Kairos native internal analysis and execution engine. Complete exactly one safe internal workflow task and return strict JSON only. Required keys: status, summary, deliverable, findings, evidenceReferences, verification, nextAction, blockedReason. status must be completed or blocked. deliverable must contain title, type, and usable content. findings must contain claim, evidenceReference, and confidence. Every evidenceReference must exactly match an ID from evidenceCatalog. Never invent external facts, analytics, customer activity, publication, communication, spending, billing, destructive changes, access changes, or live mutations. Never report an external action. For an Execute-stage task, create the finished internal domain deliverable only; do not publish, send, deploy, spend, delete, or mutate a live system. Return blocked when the supplied records cannot support a grounded deliverable.",
      user: JSON.stringify({
        task: {
          id: task?.id,
          title: task?.title,
          description: task?.description,
          stage: classification.stage,
          executionClass: classification.executionClass,
        },
        workflow: {
          id: workflow?.id,
          title: workflow?.title,
          objective: workflow?.objective,
          center: workflow?.center,
          owner: workflow?.owner,
          priority: workflow?.priority,
        },
        workItem: workItem ? {
          id: workItem.id,
          action: workItem.action,
          objective: workItem.objective,
          nativeAnalysis: workItem.analysis,
          intelligencePlan: workItem.intelligence,
          payload: workItem.payload,
        } : null,
        operatingSnapshot,
        priorArtifacts: priorArtifacts.map(compactArtifact),
        evidenceCatalog,
      }),
    });
    parsed = parseStrictJSON(generated.text);
  } catch (error) {
    return blocked(clean(error?.code || error?.message || "native-task-inference-failed", 500), classification);
  }

  const normalized = normalizeOutput(parsed, evidenceCatalog, classification);
  if (normalized.status !== "completed") return blocked(normalized.blockedReason, classification, normalized);

  const createdAt = new Date().toISOString();
  const artifactID = `native-artifact-${crypto.randomUUID()}`;
  const artifact = {
    id: artifactID,
    build: KAIROS_NATIVE_TASK_EXECUTION_BUILD,
    status: "verified",
    cycleID,
    decisionID,
    workflowID: workflow.id,
    workItemID: workItem?.id || null,
    taskID: task.id,
    taskTitle: clean(task.title, 240),
    stage: classification.stage,
    executionClass: classification.executionClass,
    summary: normalized.summary,
    deliverable: normalized.deliverable,
    findings: normalized.findings,
    evidenceReferences: normalized.evidenceReferences,
    verification: normalized.verification,
    nextAction: normalized.nextAction,
    inference: {
      mode: generated.runtime,
      provider: generated.provider,
      model: generated.model,
      privacy: generated.privacy,
    },
    safeguards: {
      evidenceCatalogEnforced: true,
      durableReadbackRequired: true,
      externalActionTaken: false,
      liveMutationPerformed: false,
      approvalBypassed: false,
      modelReasoningStored: false,
    },
    createdAt,
    updatedAt: createdAt,
  };
  artifact.contentHash = await sha256(JSON.stringify({
    workflowID: artifact.workflowID,
    taskID: artifact.taskID,
    deliverable: artifact.deliverable,
    evidenceReferences: artifact.evidenceReferences,
    verification: artifact.verification,
  }));

  await ledgerUpsert(env, "native-task-artifacts", artifactID, artifact);
  const readback = await ledgerGet(env, "native-task-artifacts", artifactID);
  if (!readback || readback.status !== "verified" || readback.contentHash !== artifact.contentHash || readback.deliverable?.content !== artifact.deliverable.content) {
    throw Object.assign(new Error("Kairos could not verify the persisted native task artifact."), { code: "native_task_artifact_readback_failed" });
  }
  return { status: "verified", classification, artifact: readback };
}

function normalizeOutput(value, catalog, classification) {
  if (String(value?.status || "").toLowerCase() === "blocked") {
    return { status: "blocked", blockedReason: clean(value?.blockedReason || value?.summary || "Authoritative evidence is insufficient.", 1200) };
  }
  const summary = clean(value?.summary, 3000);
  const deliverable = {
    title: clean(value?.deliverable?.title || `${titleCase(classification.stage)} task deliverable`, 240),
    type: clean(value?.deliverable?.type || classification.executionClass, 80),
    content: clean(value?.deliverable?.content, 16000),
  };
  const allowed = new Set(catalog.map(item => item.id));
  const directReferences = Array.isArray(value?.evidenceReferences) ? value.evidenceReferences.map(item => clean(item, 240)).filter(item => allowed.has(item)) : [];
  const findings = Array.isArray(value?.findings) ? value.findings.slice(0, 12).map(item => ({
    claim: clean(item?.claim, 2000),
    evidenceReference: clean(item?.evidenceReference, 240),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence || 0.5))),
  })).filter(item => item.claim && allowed.has(item.evidenceReference)) : [];
  const evidenceReferences = [...new Set([...directReferences, ...findings.map(item => item.evidenceReference)])];
  const verification = Array.isArray(value?.verification) ? value.verification.slice(0, 10).map(item => clean(item, 1200)).filter(Boolean) : [];
  const nextAction = clean(value?.nextAction, 2000);
  const failures = [];
  if (summary.length < 20) failures.push("summary");
  if (deliverable.content.length < 80) failures.push("deliverable");
  if (!evidenceReferences.length) failures.push("grounded-evidence-reference");
  if (!verification.length) failures.push("verification");
  if (failures.length) return { status: "blocked", blockedReason: `Native output failed required evidence gates: ${failures.join(", ")}.` };
  return { status: "completed", summary, deliverable, findings, evidenceReferences, verification, nextAction, blockedReason: "" };
}

function buildEvidenceCatalog(workflow, workItem, snapshot, artifacts) {
  const catalog = [
    { id: `workflow:${workflow.id}`, type: "durable-workflow", summary: clean(`${workflow.title}: ${workflow.objective}`, 2400) },
  ];
  if (workItem?.id) catalog.push({ id: `work-item:${workItem.id}`, type: "durable-work-item", summary: clean(`${workItem.action}: ${workItem.objective}`, 2400) });
  if (workItem?.analysis) catalog.push({ id: `native-analysis:${workItem.id}`, type: "native-objective-analysis", summary: clean(JSON.stringify(workItem.analysis), 4000) });
  if (snapshot) catalog.push({ id: "operating-snapshot:current", type: "authoritative-operating-snapshot", summary: clean(JSON.stringify(snapshot), 6000) });
  for (const artifact of artifacts) catalog.push({ id: artifact.id, type: "verified-prior-native-artifact", summary: clean(`${artifact.summary}\n${artifact.deliverable?.content || ""}`, 4000) });
  return catalog;
}

function compactArtifact(value) {
  return {
    id: value.id,
    stage: value.stage,
    summary: clean(value.summary, 1200),
    deliverable: { title: clean(value.deliverable?.title, 240), content: clean(value.deliverable?.content, 2400) },
    evidenceReferences: value.evidenceReferences,
    verification: value.verification,
  };
}

function blocked(reason, classification, output = null) {
  return { status: "blocked", reason: clean(reason || "Native task execution is blocked.", 1200), classification, output };
}

function normalizeStage(value) {
  const text = String(value || "").trim().toLowerCase();
  for (const stage of ["observe", "understand", "decide", "execute", "verify", "preserve", "improve"]) if (text === stage || text.startsWith(`${stage} `)) return stage;
  return "unclassified";
}

function normalizeExecutionClass(value, stage) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["native-analysis", "internal-domain-deliverable", "high-impact-domain-action"].includes(normalized)) return normalized;
  return stage === "execute" ? "internal-domain-deliverable" : "native-analysis";
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function titleCase(value) { return String(value || "task").replace(/\b\w/g, letter => letter.toUpperCase()); }
function clean(value, maximum) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maximum); }
