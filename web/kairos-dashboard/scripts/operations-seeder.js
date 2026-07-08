import { websiteAudit } from "./website-ops.js";
import { shopifyOps } from "./shopify-ops.js";
import { kairosState } from "./state.js";
import { getRuntimeStore, queueExecutionWork, setExecutionWorkStatus } from "./runtime-store.js";
import { pushNotification } from "./notifications.js";

function executionStatusFromRecord(record) {
  if (record.status === "Complete") return "Completed";
  if (record.status === "Ready") return "Ready";
  if (record.status === "Open" || record.status === "Active") return "In Progress";
  return "Queued";
}

function seedRecords(records, source) {
  const store = getRuntimeStore();
  const existing = new Set((store.executionPipeline || []).map(item => `${item.source}:${item.title}`));
  let created = 0;

  records.forEach(record => {
    const key = `${source}:${record.title}`;
    if (existing.has(key)) return;
    const work = queueExecutionWork(record.title, source, `${record.id || record.area || record.priority || "Kairos"} • ${record.detail || record.lane || "Operational item"}`);
    setExecutionWorkStatus(work.id, executionStatusFromRecord(record));
    created += 1;
  });

  return created;
}

export function seedWebsiteOperations() {
  const count = seedRecords(websiteAudit.findings, "Website Ops");
  pushNotification("Website ops seeded", `${count} website items added to the execution pipeline.`, "Success");
  return count;
}

export function seedShopifyOperations() {
  const count = seedRecords(shopifyOps.queues, "Shopify Ops");
  pushNotification("Shopify ops seeded", `${count} Shopify items added to the execution pipeline.`, "Success");
  return count;
}

export function seedKairosPriorities() {
  const records = kairosState.priorities.map(priority => ({
    ...priority,
    id: priority.priority,
    detail: priority.lane,
    status: priority.status
  }));
  const count = seedRecords(records, "Kairos Priority");
  pushNotification("Kairos priorities seeded", `${count} priority items added to the execution pipeline.`, "Success");
  return count;
}

export function seedAllOperations() {
  const total = seedKairosPriorities() + seedWebsiteOperations() + seedShopifyOperations();
  pushNotification("Operations seeded", `${total} total items added across Kairos, website, and Shopify queues.`, "Success");
  return total;
}
