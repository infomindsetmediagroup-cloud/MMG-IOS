import { getLiveWorkQueue } from "./live-work-queue.js";
import { pushNotification } from "./notifications.js";

const approvalKey = "kairos.approval.workflow.v1";

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

export function syncApprovalQueue() {
  const current = readApprovals();
  const existing = new Set(current.map(item => item.workId));
  const candidates = getLiveWorkQueue()
    .filter(item => item.status === "Ready for Approval" && !existing.has(item.id))
    .map(item => ({
      id: "APP-" + item.id.replace(/[^0-9]/g, ""),
      workId: item.id,
      title: item.title,
      lane: item.lane,
      status: "Pending Approval",
      approver: "Mike",
      createdAt: new Date().toLocaleString(),
      decision: "Open"
    }));
  if (!candidates.length) return current;
  return writeApprovals([...candidates, ...current]);
}

export function getApprovalQueue() {
  return syncApprovalQueue();
}

export function decideApproval(id, decision) {
  const next = readApprovals().map(item => item.id === id ? {
    ...item,
    decision,
    status: decision === "Approved" ? "Approved" : "Needs Changes",
    decidedAt: new Date().toLocaleString()
  } : item);
  writeApprovals(next);
  pushNotification("Approval updated", id + " marked " + decision + ".", decision === "Approved" ? "Success" : "Warning");
  return next;
}

export function approvalMetrics() {
  const approvals = getApprovalQueue();
  return {
    total: approvals.length,
    pending: approvals.filter(item => item.status === "Pending Approval").length,
    approved: approvals.filter(item => item.status === "Approved").length,
    changes: approvals.filter(item => item.status === "Needs Changes").length
  };
}
