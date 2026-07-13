import { createWorkflow, readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-creative-studio-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const FORMATS = new Set(["social-post", "carousel", "video-cover", "product-image", "book-cover", "website-asset", "print-asset", "custom"]);

export async function createCreativeProject(request, payload = {}) {
  const title = clean(payload.title, 180);
  const objective = clean(payload.objective, 4000);
  if (!title) throw new Error("Enter a creative project title.");
  if (!objective) throw new Error("Describe the finished creative outcome.");

  const format = FORMATS.has(payload.format) ? payload.format : "custom";
  const now = new Date().toISOString();
  const workflow = await createWorkflow(request, {
    title: `Creative Studio · ${title}`,
    objective,
    center: "content",
    priority: payload.priority || "normal",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Creative Studio",
    source: "content/creative-studio",
    tasks: [
      { title: "Lock creative brief", description: "Confirm audience, message, dimensions, references, and production constraints." },
      { title: "Prepare source assets", description: "Collect approved copy, imagery, logos, and brand references inside the MMG workspace." },
      { title: "Build production draft", description: `Create the governed ${format.replaceAll("-", " ")} production draft.` },
      { title: "Review and revise", description: "Check visual quality, spelling, brand alignment, dimensions, and requested corrections." },
      { title: "Approve final deliverable", description: "Record approval and release only the approved final deliverable." },
    ],
  });

  const project = {
    id: `creative-${crypto.randomUUID()}`,
    build: BUILD,
    title,
    objective,
    format,
    status: "brief-ready",
    workflowID: workflow.id,
    createdAt: now,
    updatedAt: now,
    brief: {
      audience: clean(payload.audience, 1000),
      message: clean(payload.message, 2000),
      dimensions: clean(payload.dimensions, 200),
      platform: clean(payload.platform, 300),
      references: clean(payload.references, 4000),
      constraints: clean(payload.constraints, 4000),
      due: clean(payload.due, 120),
    },
    productionBoundary: {
      intermediateAssetsStayInWorkspace: true,
      editableSourceFilesStayInWorkspace: true,
      finalDeliverableRequiresApproval: true,
      externalPublicationAutomatic: false,
    },
    nextAction: workflow.approvalRequired ? "Approve workflow, then lock the creative brief." : "Open the workflow and lock the creative brief.",
  };

  await caches.default.put(projectRequest(request, project.id), stored(project));
  await caches.default.put(latestRequest(request), stored(project));
  return { project, workflow };
}

export async function readCreativeProject(request, projectID) {
  if (!projectID) return null;
  const response = await caches.default.match(projectRequest(request, projectID));
  if (!response) return null;
  try {
    const project = await response.json();
    const workflow = await readWorkflow(request, project.workflowID);
    return { project, workflow };
  } catch { return null; }
}

export async function readLatestCreativeProject(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try {
    const project = await response.json();
    const workflow = await readWorkflow(request, project.workflowID);
    return { project, workflow };
  } catch { return null; }
}

function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function projectRequest(request, id) { return new Request(new URL(`/_kairos/creative-studio/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/creative-studio/latest", request.url).toString(), { method: "GET" }); }
