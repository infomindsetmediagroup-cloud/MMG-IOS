import { pushNotification } from "./notifications.js";

const keysToClear = [
  "kairos.action.log.v1",
  "kairos.notifications.v1",
  "kairos.runtime.store.v1",
  "kairos.task.board.v1",
  "kairos.command.router.v1",
  "kairos.site.audit.runs.v1",
  "kairos.shopify.preflight.runs.v1",
  "kairos.revenue.funnel.runs.v1",
  "kairos.bundle.builder.runs.v1",
  "kairos.vault.builder.runs.v1",
  "kairos.knowledge.taxonomy.runs.v1",
  "kairos.customer.portal.runs.v1",
  "kairos.milestone.validation.runs.v1",
  "kairos.golden.master.v1"
];

export function resetRuntimeState() {
  keysToClear.forEach(key => localStorage.removeItem(key));
  pushNotification("Runtime reset complete", "Kairos local runtime state was reset. Refresh to reseed panels.", "Warning");
  return true;
}

export function getResetScope() {
  return keysToClear.map(key => ({ title: key, status: localStorage.getItem(key) ? "Stored" : "Clear" }));
}
