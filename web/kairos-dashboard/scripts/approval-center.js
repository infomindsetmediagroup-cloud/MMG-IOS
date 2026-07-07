import { getRuntimeStore, saveRuntimeStore } from "./runtime-store.js";
import { pushNotification } from "./notifications.js";

export function getApprovals() {
  return getRuntimeStore().approvals || [];
}

export function setApprovalStatus(id, status) {
  const store = getRuntimeStore();
  const approvals = (store.approvals || []).map(item => item.id === id ? { ...item, status, resolvedAt: new Date().toLocaleString() } : item);
  saveRuntimeStore({ approvals });
  pushNotification("Approval updated", `${status}: ${id}`, status === "Approved" ? "Success" : "Warning");
  return approvals;
}

export function seedApprovalQueue() {
  const store = getRuntimeStore();
  if ((store.approvals || []).length) return store.approvals;
  const createdAt = new Date().toLocaleString();
  const approvals = [
    { id: "APP-001", title: "Activate first-order discount offer", source: "Revenue", status: "Pending", createdAt },
    { id: "APP-002", title: "Release Free Vault lead magnet", source: "Knowledge", status: "Pending", createdAt },
    { id: "APP-003", title: "Publish Creator Launch Bundle", source: "Bundles", status: "Pending", createdAt },
    { id: "APP-004", title: "Stage Judge.me product widget fix", source: "Shopify", status: "Pending", createdAt }
  ];
  saveRuntimeStore({ approvals });
  return approvals;
}
