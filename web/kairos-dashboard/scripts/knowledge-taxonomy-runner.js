import { recordAction } from "./runtime-actions.js";
import { pushNotification } from "./notifications.js";
import { moveTask } from "./task-board.js";

const taxonomyKey = "kairos.knowledge.taxonomy.runs.v1";

const taxonomyBlueprint = [
  { title: "AI", status: "Ready", lane: "Category" },
  { title: "Publishing", status: "Ready", lane: "Category" },
  { title: "Content Creation", status: "Ready", lane: "Category" },
  { title: "Business Systems", status: "Needs Setup", lane: "Category" },
  { title: "Platform Income", status: "Needs Setup", lane: "Category" },
  { title: "Mindset", status: "Needs Setup", lane: "Category" },
  { title: "Article template", status: "Needs Setup", lane: "Template" },
  { title: "Internal linking rules", status: "Needs Setup", lane: "SEO" },
  { title: "Lead magnet handoff", status: "Needs Setup", lane: "Conversion" }
];

function readRuns() {
  try {
    return JSON.parse(localStorage.getItem(taxonomyKey) || "[]");
  } catch {
    return [];
  }
}

export function getKnowledgeTaxonomyRuns() {
  return readRuns();
}

export function runKnowledgeTaxonomyBuild() {
  const score = Math.round((taxonomyBlueprint.filter(item => item.status === "Ready").length / taxonomyBlueprint.length) * 100);
  const run = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: "Knowledge Bank Taxonomy",
    score,
    items: taxonomyBlueprint,
    createdAt: new Date().toLocaleString()
  };

  localStorage.setItem(taxonomyKey, JSON.stringify([run, ...readRuns()].slice(0, 10)));
  recordAction("Create Knowledge Module", `Knowledge taxonomy build completed with ${score}% readiness.`);
  moveTask("TASK-006", "Active");
  pushNotification("Knowledge taxonomy build completed", `Knowledge Bank readiness: ${score}%.`, score >= 80 ? "Success" : "Warning");
  return run;
}
