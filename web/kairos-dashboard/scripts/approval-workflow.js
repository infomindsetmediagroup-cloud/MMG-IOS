import { getLiveWorkQueue, advanceWorkItem } from "./live-work-queue.js";
import { recordExecutionHistory } from "./execution-history.js";
import { pushNotification } from "./notifications.js";

const approvalKey = "kairos.approval.workflow.v1";
const policyKey = "kairos.approval.policy.v1";

const defaultPolicy = {
  requireApprovalFor: ["Ready for Approval", "High"],
  approver: "Mike",
  autoArchiveApproved: false,
  approvalWindow: "Operator-controlled"
};

function readApprovals() {
  try {
    return JSON.parse(localStorage.getItem(approvalKey) || "null") || [];
  } catch {
    return [];
  }
}

function writeApprovals(items) {
  localStorage.setItem(approvalKey, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("kairos:approvals-updated", { detail: { total: items.length } }));
  return items;
}

export function getApprovalPolicy() {
  try {
    return JSON.parse(localStorage.getItem(policyKey) || "null") || defaultPolicy;
  } catch {
    return defaultPolicy;
  }
}

export function updateApprovalPolicy(patch = {}) {
  const next = { ...getApprovalPolicy(), ...patch };
  localStorage.setItem(policyKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("kairos:approval-policy-updated", { detail: next }));
  pushNotification("Approval policy updated", "Command Center approval rules saved.", "Success");
  return next;
}

function needsApproval(item, existing) {
  if (existing.has(item.id)) return false;
  if (item.status === "Ready for Approval") return true;
  if (item.priority === "High" && item.progress >= 80) return true;
  return false;
}

export function syncApprovalQueue() {
  const current = readApprovals();
  const existing = new Set(current.map(item => item.workId));
  const policy = getApprovalPolicy();
  const candidates = getLiveWorkQueue()
    .filter(item => needsApproval(item, existing))
    .map(item => ({
      id: "APP-" + item.id.replace(/[^0-9]/g, ""),
      workId: item.id,
      title: item.title,
      lane: item.lane,
      priority: item.priority,
      gate: item.priority === "High" ? "High-impact approval" : "Completion approval",
      status: "Pending Approval",
      approver: policy.approver,
      createdAt: new Date().toLocaleString(),
      decision: "Open",
      notes: "Awaiting operator decision."
    }));
  if (!candidates.length) return current;
  return writeApprovals([...candidates, ...current]);
}

export function getApprovalQueue() {
  return syncApprovalQueue();
}

export function requestApprovalForWork(workId) {
  const work = getLiveWorkQueue().find(item => item.id === workId);
  if (!work) return null;
  const current = readApprovals();
  if (current.some(item => item.workId === workId && item.status === "Pending Approval")) return current.find(item => item.workId === workId);
  const policy = getApprovalPolicy();
  const approval = {
    id: "APP-" + work.id.replace(/[^0-9]/g, ""),
    workId: work.id,
    title: work.title,
    lane: work.lane,
    priority: work.priority,
    gate: "Manual approval request",
    status: "Pending Approval",
    approver: policy.approver,
    createdAt: new Date().toLocaleString(),
    decision: "Open",
    notes: "Approval requested manually from Command Center."
  };
  writeApprovals([approval, ...current]);
  recordExecutionHistory("Approval requested", approval.workId + " routed to " + approval.approver, "Pending Approval");
  pushNotification("Approval requested", approval.id + " created.", "Success");
  return approval;
}

export function decideApproval(id, decision, notes = "") {
  let target;
  const next = readApprovals().map(item => {
    if (item.id !== id) return item;
    target = item;
    return {
      ...item,
      decision,
      notes: notes || item.notes,
      status: decision === "Approved" ? "Approved" : "Needs Changes",
      decidedAt: new Date().toLocaleString()
    };
  });
  writeApprovals(next);
  if (target && decision === "Approved") advanceWorkItem(target.workId);
  recordExecutionHistory("Approval decision", id + " marked " + decision, decision);
  pushNotification("Approval updated", id + " marked " + decision + ".", decision === "Approved" ? "Success" : "Warning");
  return next;
}

export function resetApprovalDecision(id) {
  const next = readApprovals().map(item => item.id === id ? {
    ...item,
    decision: "Open",
    status: "Pending Approval",
    decidedAt: "",
    notes: "Decision reset by operator."
  } : item);
  writeApprovals(next);
  pushNotification("Approval reset", id + " reopened.", "Info");
  return next;
}

export function approvalMetrics() {
  const approvals = getApprovalQueue();
  return {
    total: approvals.length,
    pending: approvals.filter(item => item.status === "Pending Approval").length,
    approved: approvals.filter(item => item.status === "Approved").length,
    changes: approvals.filter(item => item.status === "Needs Changes").length,
    high: approvals.filter(item => item.priority === "High").length
  };
}
