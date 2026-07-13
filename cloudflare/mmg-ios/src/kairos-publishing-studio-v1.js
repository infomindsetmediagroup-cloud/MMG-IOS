import { createWorkflow, readWorkflow } from "./kairos-workflow-runtime-v1.js";

const BUILD = "kairos-publishing-studio-20260713-1";
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const TYPES = new Set(["book", "ebook", "guide", "workbook", "prompt-library", "report", "journal", "custom"]);

export async function createPublishingProject(request, payload = {}) {
  const title = clean(payload.title, 240);
  const objective = clean(payload.objective, 4000);
  if (!title) throw new Error("Enter the publication title.");
  if (!objective) throw new Error("Describe the finished publication outcome.");

  const type = TYPES.has(payload.type) ? payload.type : "custom";
  const now = new Date().toISOString();
  const workflow = await createWorkflow(request, {
    title: `Publishing Studio · ${title}`,
    objective,
    center: "content",
    priority: payload.priority || "normal",
    approvalRequired: Boolean(payload.approvalRequired),
    owner: "Publishing Studio",
    source: "content/publishing-studio",
    tasks: [
      { title: "Confirm editorial readiness", description: "Verify manuscript or source material, scope, completeness, and required editorial work." },
      { title: "Build publication metadata", description: "Prepare title, subtitle, author, description, categories, keywords, rights, pricing inputs, and identifiers." },
      { title: "Prepare production files", description: "Create and verify the required digital, print, cover, and platform-ready production files." },
      { title: "Assemble catalog and commerce package", description: "Prepare Shopify, marketplace, distribution, product media, and launch handoff records." },
      { title: "Approve release package", description: "Verify evidence, approve the final publication package, and authorize only the approved release path." },
    ],
  });

  const project = {
    id: `publication-${crypto.randomUUID()}`,
    build: BUILD,
    title,
    objective,
    type,
    status: "intake-complete",
    workflowID: workflow.id,
    createdAt: now,
    updatedAt: now,
    publication: {
      author: clean(payload.author, 240),
      subtitle: clean(payload.subtitle, 500),
      imprint: clean(payload.imprint || "Mindset Media Group", 240),
      sourceStatus: clean(payload.sourceStatus, 240),
      formats: normalizeList(payload.formats, 12),
      channels: normalizeList(payload.channels, 12),
      audience: clean(payload.audience, 1500),
      description: clean(payload.description, 4000),
      identifiers: clean(payload.identifiers, 1000),
      pricingNotes: clean(payload.pricingNotes, 2000),
      releaseTarget: clean(payload.releaseTarget, 240),
    },
    releaseBoundary: {
      draftFilesStayInternal: true,
      sourceFilesStayInternal: true,
      platformSubmissionAutomatic: false,
      liveStorePublicationAutomatic: false,
      pricingRequiresApproval: true,
      finalReleaseRequiresApproval: true,
    },
    nextAction: workflow.approvalRequired ? "Approve the workflow, then confirm editorial readiness." : "Open the workflow and confirm editorial readiness.",
  };

  await caches.default.put(projectRequest(request, project.id), stored(project));
  await caches.default.put(latestRequest(request), stored(project));
  return { project, workflow };
}

export async function readPublishingProject(request, projectID) {
  if (!projectID) return null;
  const response = await caches.default.match(projectRequest(request, projectID));
  if (!response) return null;
  try {
    const project = await response.json();
    const workflow = await readWorkflow(request, project.workflowID);
    return { project, workflow };
  } catch { return null; }
}

export async function readLatestPublishingProject(request) {
  const response = await caches.default.match(latestRequest(request));
  if (!response) return null;
  try {
    const project = await response.json();
    const workflow = await readWorkflow(request, project.workflowID);
    return { project, workflow };
  } catch { return null; }
}

function normalizeList(value, max) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  return source.map(item => clean(item, 180)).filter(Boolean).slice(0, max);
}
function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function stored(value) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }); }
function projectRequest(request, id) { return new Request(new URL(`/_kairos/publishing-studio/${encodeURIComponent(id)}`, request.url).toString(), { method: "GET" }); }
function latestRequest(request) { return new Request(new URL("/_kairos/publishing-studio/latest", request.url).toString(), { method: "GET" }); }
