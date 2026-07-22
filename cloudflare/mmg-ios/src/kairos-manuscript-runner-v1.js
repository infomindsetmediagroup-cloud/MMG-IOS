import { ManuscriptProcessingError, processManuscriptSource } from "./kairos-manuscript-processor-v1.js";

const BUILD = "kairos-manuscript-runner-20260722-1";
const PROJECT_KEY = "publishing:project";

export async function handleManuscriptRunObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/internal\/publishing\/projects\/([^/]+)\/run$/);
  if (!match || request.method !== "POST") return null;

  const project = await state.storage.get(PROJECT_KEY);
  if (!project) return error("project_not_found", "Project not found.", 404);
  if (project.status === "RUNNING") return error("run_in_progress", "A pipeline run is already active.", 409);
  if (!["READY", "FAILED"].includes(project.status)) {
    return error("project_not_runnable", `Project status ${project.status} cannot start a pipeline run.`, 409);
  }

  const roles = new Set(project.sourceAssets.map((asset) => asset.role));
  if (!roles.has("COVER_SOURCE") || !roles.has("MANUSCRIPT_SOURCE")) {
    return error("sources_incomplete", "One cover and one manuscript are required before running.", 409);
  }

  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  const runningProject = {
    ...project,
    status: "RUNNING",
    stages: resetStagesForExtraction(project.stages, startedAt),
    run: {
      id: runId,
      status: "RUNNING",
      currentStage: "MANUSCRIPT_EXTRACTION",
      startedAt,
      lastHeartbeatAt: startedAt,
      attempt: Number(project.run?.attempt || 0) + 1,
    },
    updatedAt: startedAt,
  };
  await state.storage.put(PROJECT_KEY, runningProject);

  try {
    const result = await processManuscriptSource(state, runningProject);
    const completedAt = new Date().toISOString();
    const artifacts = [
      ...runningProject.artifacts.filter((artifact) => artifact.kind !== "NORMALIZED_MANUSCRIPT"),
      result.artifact,
    ];
    const updated = {
      ...runningProject,
      status: "RUNNING",
      artifacts,
      stages: runningProject.stages.map((stage) => {
        if (stage.name === "MANUSCRIPT_EXTRACTION") {
          return { ...stage, status: "SUCCEEDED", completedAt, requiresHumanReview: false };
        }
        if (stage.name === "METADATA_INFERENCE") {
          return { ...stage, status: "RUNNING", startedAt: completedAt };
        }
        return stage;
      }),
      run: {
        ...runningProject.run,
        currentStage: "METADATA_INFERENCE",
        lastHeartbeatAt: completedAt,
        extractionArtifactId: result.artifact.id,
        extractionReport: result.report,
      },
      updatedAt: completedAt,
    };
    await state.storage.put(PROJECT_KEY, updated);

    return json({
      status: "accepted",
      build: BUILD,
      run: updated.run,
      project: updated,
      extraction: result.report,
      artifact: publicArtifact(result.artifact),
      safeguards: safeguards(),
    }, 202);
  } catch (caught) {
    const failure = normalizeFailure(caught);
    const failedAt = new Date().toISOString();
    const failed = {
      ...runningProject,
      status: "FAILED",
      stages: runningProject.stages.map((stage) => stage.name === "MANUSCRIPT_EXTRACTION"
        ? {
            ...stage,
            status: "FAILED",
            completedAt: failedAt,
            errorCode: failure.code,
            errorMessage: failure.message,
            requiresHumanReview: failure.requiresHumanReview,
          }
        : stage),
      run: {
        ...runningProject.run,
        status: "FAILED",
        currentStage: "MANUSCRIPT_EXTRACTION",
        failedAt,
        lastHeartbeatAt: failedAt,
        error: failure,
      },
      updatedAt: failedAt,
    };
    await state.storage.put(PROJECT_KEY, failed);

    return json({
      status: "failed",
      build: BUILD,
      error: failure,
      project: failed,
      retry: {
        allowed: failure.retryable,
        endpoint: `/api/kairos/projects/${failed.id}/run`,
        sourceReplacementRequired: failure.retryable === false,
      },
      safeguards: safeguards(),
    }, failure.requiresHumanReview ? 422 : 500);
  }
}

function resetStagesForExtraction(stages, now) {
  return stages.map((stage) => {
    if (stage.name === "INTAKE" || stage.name === "SOURCE_VALIDATION") {
      return { name: stage.name, status: "SUCCEEDED", startedAt: now, completedAt: now };
    }
    if (stage.name === "MANUSCRIPT_EXTRACTION") {
      return { name: stage.name, status: "RUNNING", startedAt: now };
    }
    return { name: stage.name, status: "PENDING" };
  });
}

function normalizeFailure(caught) {
  if (caught instanceof ManuscriptProcessingError) {
    return {
      code: caught.code,
      message: caught.message,
      requiresHumanReview: caught.requiresHumanReview,
      retryable: caught.retryable,
    };
  }
  return {
    code: "manuscript_processing_failed",
    message: caught instanceof Error ? caught.message : "Manuscript processing failed.",
    requiresHumanReview: false,
    retryable: true,
  };
}

function publicArtifact(artifact) {
  const { storageKey, ...safe } = artifact;
  return safe;
}

function safeguards() {
  return {
    liveShopifyMutation: "blocked",
    shopifyOutputStatus: "DRAFT",
    humanReviewRequired: true,
    sourceAssetsImmutable: true,
  };
}

function error(code, message, status) {
  return json({ status: "failed", build: BUILD, error: { code, message } }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Manuscript-Runner": BUILD,
    },
  });
}
