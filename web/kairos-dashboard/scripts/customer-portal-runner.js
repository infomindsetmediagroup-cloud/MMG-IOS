import { recordAction } from "./runtime-actions.js";
import { pushNotification } from "./notifications.js";
import { moveTask } from "./task-board.js";

const portalKey = "kairos.customer.portal.runs.v1";

const portalBlueprint = [
  { title: "Portal entry route", status: "Ready", lane: "Access" },
  { title: "Free Vault member account type", status: "Ready", lane: "Accounts" },
  { title: "Product customer account type", status: "Needs Setup", lane: "Accounts" },
  { title: "Download center structure", status: "Needs Setup", lane: "Delivery" },
  { title: "License record template", status: "Needs Setup", lane: "Licensing" },
  { title: "Purchase-to-vault handoff", status: "Needs Setup", lane: "Commerce" },
  { title: "Review follow-up workflow", status: "Needs Setup", lane: "Trust" },
  { title: "Support request intake", status: "Needs Setup", lane: "Support" }
];

function readRuns() {
  try {
    return JSON.parse(localStorage.getItem(portalKey) || "[]");
  } catch {
    return [];
  }
}

export function getCustomerPortalRuns() {
  return readRuns();
}

export function runCustomerPortalBuild() {
  const score = Math.round((portalBlueprint.filter(item => item.status === "Ready").length / portalBlueprint.length) * 100);
  const run = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: "Customer Portal Build",
    score,
    items: portalBlueprint,
    createdAt: new Date().toLocaleString()
  };

  localStorage.setItem(portalKey, JSON.stringify([run, ...readRuns()].slice(0, 10)));
  recordAction("Map Customer Portal", `Customer Portal build pass completed with ${score}% readiness.`);
  moveTask("TASK-004", "Active");
  pushNotification("Customer Portal build pass completed", `Customer Portal readiness: ${score}%.`, score >= 80 ? "Success" : "Warning");
  return run;
}
