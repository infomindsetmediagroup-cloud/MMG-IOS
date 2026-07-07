import { buildExportPayload } from "./export-center.js";
import { createRuntimeSnapshot } from "./runtime-store.js";
import { pushNotification } from "./notifications.js";
import { recordAction } from "./runtime-actions.js";

const goldenKey = "kairos.golden.master.v1";

export function createGoldenMaster() {
  const payload = buildExportPayload();
  const goldenMaster = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: "Kairos Phase 1 Golden Master",
    createdAt: new Date().toLocaleString(),
    payload
  };

  localStorage.setItem(goldenKey, JSON.stringify(goldenMaster));
  createRuntimeSnapshot("Kairos Phase 1 Golden Master", {
    actions: payload.actions.length,
    tasks: payload.tasks.length,
    approvals: payload.approvals.length,
    notifications: payload.notifications.length
  });
  recordAction("Create Golden Master", "Golden Master saved to local browser runtime.");
  pushNotification("Golden Master created", "Kairos Phase 1 runtime baseline saved.", "Success");
  return goldenMaster;
}

export function getGoldenMaster() {
  try {
    return JSON.parse(localStorage.getItem(goldenKey) || "null");
  } catch {
    return null;
  }
}

export function clearGoldenMaster() {
  localStorage.removeItem(goldenKey);
  pushNotification("Golden Master cleared", "Local Golden Master baseline was removed.", "Warning");
}
