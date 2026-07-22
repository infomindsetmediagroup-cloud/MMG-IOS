import { handleManuscriptRunObjectRequest } from "./kairos-manuscript-runner-v1.js";
import { DeliverableManufacturingError, manufactureDeliverables } from "./kairos-deliverable-manufacturing-v1.js";

const BUILD = "kairos-deliverable-runner-20260722-1";
const PROJECT_KEY = "publishing:project";
const MANUFACTURED_KINDS = new Set([
  "EDITABLE_MANUSCRIPT",
  "FINAL_MANUSCRIPT",
  "CUSTOMER_README",
  "RIGHTS_DECLARATION",
  "STOREFRONT_PRODUCT_IMAGE",
  "PRODUCT_METADATA",
]);

export async function handleDeliverableRunObjectRequest(state, request, env = {}) {
  const url = new URL(request.url);
  if (request.method !== "POST" || !/^\/internal\/publishing\/projects\/[^/]+\/run$/.test(url.pathname)) return null;

  const upstream = await handleManuscriptRunObjectRequest(state, request, env);
  if (!upstream) return null;
  if (!upstream.ok) return upstream;

  const upstreamBody = await safeJSON(upstream.clone());
  const project = await state.storage.get(PROJECT_KEY);
  if (!project || project.status !== "RUNNING" || project.run?.currentStage !== "DELIVERABLE_GENERATION") {
    return upstream;
  }

  try {
    const manufacturing = await manufactureDeliverables(state, project);
    const completedAt = new Date().toISOString();
    const retained = project.artifacts.filter((artifact) => !MANUFACTURED_KINDS.has(artifact.kind));
    const artifacts = [...retained, ...manufacturing.artifacts];
    const updated = {
      ...project,
      status: "RUNNING",
      artifacts,
      shopifyDraft: manufacturing.shopifyMetadata,
      storefrontImageContract: manufacturing.storefrontImageContract,
      rightsDeclaration: manufacturing.rightsDeclaration,
      stages: project.stages.map((stage) => {
        if (stage.name === "DELIVERABLE_GENERATION") {
          return { ...stage, status: "SUCCEEDED", completedAt, requiresHumanReview: false };
        }
        if (stage.name === "PRODUCT_METADATA_GENERATION") {
          return { ...stage, status: "RUNNING", startedAt: completedAt };
        }
        return stage;
      }),
      run: {
        ...project.run,
        currentStage: "PRODUCT_METADATA_GENERATION",
        lastHeartbeatAt: completedAt,
        deliverableArtifactIds: manufacturing.artifacts.map((artifact) => artifact.id),
        deliverableQA: manufacturing.qa,
      },
      updatedAt: completedAt,
    };
    await state.storage.put(PROJECT_KEY, updated);

    return json({
      status: "accepted",
      build: BUILD,
      run: updated.run,
      project: updated,
      extraction: upstreamBody.extraction,
      metadata: upstreamBody.metadata,
      editorial: upstreamBody.editorial,
      manufacturing: {
        build: manufacturing.build,
        generatedAt: manufacturing.generatedAt,
        qa: manufacturing.qa,
        shopifyMetadata: manufacturing.shopifyMetadata,
        storefrontImageContract: manufacturing.storefrontImageContract,
        artifacts: manufacturing.artifacts.map(publicArtifact),
      },
      safeguards: safeguards(),
    }, 202);
  } catch (caught) {
    const failure = normalizeFailure(caught);
    const failedAt = new Date().toISOString();
    const current = await state.storage.get(PROJECT_KEY) || project;
    const failed = {
      ...current,
      status: failure.requiresHumanReview ? "REVIEW_REQUIRED" : "FAILED",
      stages: current.stages.map((stage) => stage.name === "DELIVERABLE_GENERATION"
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
        currentStage: "DELIVERABLE_GENERATION",
        failedAt,
        lastHeartbeatAt: failedAt,
        error: failure,
      },
      review: failure.requiresHumanReview
        ? {
            required: true,
            stage: "DELIVERABLE_GENERATION",
            blockers: [failure.message],
            warnings: [],
            recommendations: ["Resolve the deliverable manufacturing issue and rerun the governed pipeline."],
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
      },
      safeguards: safeguards(),
    }, failure.requiresHumanReview ? 422 : 500);
  }
}

function normalizeFailure(caught) {
  if (caught instanceof DeliverableManufacturingError) {
    return {
      code: caught.code,
      message: caught.message,
      requiresHumanReview: caught.requiresHumanReview,
      retryable: caught.retryable,
    };
  }
  return {
    code: "deliverable_manufacturing_failed",
    message: caught instanceof Error ? caught.message : "Deliverable manufacturing failed.",
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
    coverTransformationAuthorized: false,
    rightsConfirmationRequired: true,
    humanReviewRequiredBeforeStaging: true,
  };
}

async function safeJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Deliverable-Runner": BUILD,
    },
  });
}
