import { ManuscriptProcessingError, processManuscriptSource } from "./kairos-manuscript-processor-v1.js";
import { PublishingIntelligenceError, runPublishingIntelligence } from "./kairos-publishing-intelligence-v1.js";

const BUILD = "kairos-manuscript-runner-20260722-2";
const PROJECT_KEY = "publishing:project";

export async function handleManuscriptRunObjectRequest(state, request, env = {}) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/internal\/publishing\/projects\/([^/]+)\/run$/);
  if (!match || request.method !== "POST") return null;

  const project = await state.storage.get(PROJECT_KEY);
  if (!project) return error("project_not_found", "Project not found.", 404);
  if (project.status === "RUNNING") return error("run_in_progress", "A pipeline run is already active.", 409);
  if (!["READY", "FAILED", "REVIEW_REQUIRED"].includes(project.status)) {
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
    const extraction = await processManuscriptSource(state, runningProject);
    const extractionCompletedAt = new Date().toISOString();
    const afterExtraction = {
      ...runningProject,
      artifacts: [
        ...runningProject.artifacts.filter((artifact) => artifact.kind !== "NORMALIZED_MANUSCRIPT"),
        extraction.artifact,
      ],
      stages: runningProject.stages.map((stage) => {
        if (stage.name === "MANUSCRIPT_EXTRACTION") {
          return { ...stage, status: "SUCCEEDED", completedAt: extractionCompletedAt, requiresHumanReview: false };
        }
        if (stage.name === "METADATA_INFERENCE") {
          return { ...stage, status: "RUNNING", startedAt: extractionCompletedAt };
        }
        return stage;
      }),
      run: {
        ...runningProject.run,
        currentStage: "METADATA_INFERENCE",
        lastHeartbeatAt: extractionCompletedAt,
        extractionArtifactId: extraction.artifact.id,
        extractionReport: extraction.report,
      },
      updatedAt: extractionCompletedAt,
    };
    await state.storage.put(PROJECT_KEY, afterExtraction);

    const intelligence = await runPublishingIntelligence(state, afterExtraction, env);
    const intelligenceCompletedAt = new Date().toISOString();
    const reviewRequired = intelligence.requiresHumanReview;
    const artifacts = [
      ...afterExtraction.artifacts.filter((artifact) => !["METADATA_INFERENCE", "QA_REPORT"].includes(artifact.kind)),
      ...intelligence.artifacts,
    ];
    const updated = {
      ...afterExtraction,
      status: reviewRequired ? "REVIEW_REQUIRED" : "RUNNING",
      metadata: {
        ...afterExtraction.metadata,
        ...intelligence.metadata.metadata,
      },
      artifacts,
      stages: afterExtraction.stages.map((stage) => {
        if (stage.name === "METADATA_INFERENCE") {
          return {
            ...stage,
            status: "SUCCEEDED",
            completedAt: intelligenceCompletedAt,
            requiresHumanReview: intelligence.metadata.requiresHumanReview,
          };
        }
        if (stage.name === "EDITORIAL_ANALYSIS") {
          return {
            ...stage,
            status: reviewRequired ? "BLOCKED" : "SUCCEEDED",
            startedAt: intelligenceCompletedAt,
            completedAt: intelligenceCompletedAt,
            requiresHumanReview: reviewRequired,
            errorCode: reviewRequired ? "editorial_review_required" : undefined,
            errorMessage: reviewRequired ? "Editorial QA requires human review before deliverable generation." : undefined,
          };
        }
        if (stage.name === "DELIVERABLE_GENERATION" && !reviewRequired) {
          return { ...stage, status: "RUNNING", startedAt: intelligenceCompletedAt };
        }
        return stage;
      }),
      run: {
        ...afterExtraction.run,
        status: reviewRequired ? "REVIEW_REQUIRED" : "RUNNING",
        currentStage: reviewRequired ? "EDITORIAL_ANALYSIS" : "DELIVERABLE_GENERATION",
        lastHeartbeatAt: intelligenceCompletedAt,
        metadataArtifactId: intelligence.artifacts.find((artifact) => artifact.kind === "METADATA_INFERENCE")?.id,
        qaArtifactId: intelligence.artifacts.find((artifact) => artifact.kind === "QA_REPORT")?.id,
        editorialScore: intelligence.editorial.score,
        editorialGrade: intelligence.editorial.grade,
        requiresHumanReview: reviewRequired,
      },
      review: reviewRequired
        ? {
            required: true,
            stage: "EDITORIAL_ANALYSIS",
            blockers: intelligence.editorial.blockers,
            warnings: intelligence.editorial.warnings,
            recommendations: intelligence.editorial.recommendations,
            requestedAt: intelligenceCompletedAt,
          }
        : null,
      updatedAt: intelligenceCompletedAt,
    };
    await state.storage.put(PROJECT_KEY, updated);

    return json({
      status: reviewRequired ? "review-required" : "accepted",
      build: BUILD,
      run: updated.run,
      project: updated,
      extraction: extraction.report,
      metadata: intelligence.metadata,
      editorial: intelligence.editorial,
      artifacts: intelligence.artifacts.map(publicArtifact),
      safeguards: safeguards(),
    }, reviewRequired ? 202 : 202);
  } catch (caught) {
    const failure = normalizeFailure(caught);
    const failedAt = new Date().toISOString();
    const current = await state.storage.get(PROJECT_KEY) || runningProject;
    const failedStage = current.run?.currentStage || "MANUSCRIPT_EXTRACTION";
    const failed = {
      ...current,
      status: failure.requiresHumanReview ? "REVIEW_REQUIRED" : "FAILED",
      stages: current.stages.map((stage) => stage.name === failedStage
        ? {
            ...stage,
            status: failure.requiresHumanReview ? "BLOCKED" : "FAILED",
            completedAt: failedAt,
            errorCode: failure.code,
            errorMessage: failure.message,
            requiresHumanReview: failure.requiresHumanReview,
          }
        : stage),
      run: {
        ...current.run,
        status: failure.requiresHumanReview ? "REVIEW_REQUIRED" : "FAILED",
        currentStage: failedStage,
        failedAt,
        lastHeartbeatAt: failedAt,
        error: failure,
      },
      review: failure.requiresHumanReview
        ? {
            required: true,
            stage: failedStage,
            blockers: [failure.message],
            warnings: [],
            recommendations: ["Review the source and project metadata, then retry the governed pipeline."],
            requestedAt: failedAt,
          }
        : current.review,
      updatedAt: failedAt,
    };
    await state.storage.put(PROJECT_KEY, failed);

    return json({
      status: failure.requiresHumanReview ? "review-required" : "failed",
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
  if (caught instanceof ManuscriptProcessingError || caught instanceof PublishingIntelligenceError) {
    return {
      code: caught.code,
      message: caught.message,
      requiresHumanReview: caught.requiresHumanReview,
      retryable: caught.retryable,
    };
  }
  return {
    code: "publishing_pipeline_failed",
    message: caught instanceof Error ? caught.message : "Publishing pipeline failed.",
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
    providerMayEnrichButNotAuthorize: true,
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
