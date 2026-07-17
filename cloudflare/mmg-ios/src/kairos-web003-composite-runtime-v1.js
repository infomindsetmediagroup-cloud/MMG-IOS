import { prepareWebsiteRetoolExceptions } from "./kairos-website-retool-exception-planner-v1.js";
import {
  executeWebsiteRetoolExceptions,
  rollbackWebsiteRetoolExceptions,
} from "./kairos-website-retool-exception-executor-v1.js";

export const KAIROS_WEB003_COMPOSITE_BUILD = "kairos-web003-composite-runtime-20260716-1";

const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const EXECUTE_ROUTE = "/api/shopify/staging/execute/jobs";
const ROLLBACK_ROUTE = "/api/shopify/staging/rollback/jobs";
const PLAN_JOB_ROUTE = /^\/api\/shopify\/staging\/plan\/jobs\/([a-f0-9-]+)$/i;
const EXECUTION_JOB_ROUTE = /^\/api\/shopify\/staging\/execute\/jobs\/([a-f0-9-]+)$/i;
const CACHE_SECONDS = 60 * 60;

export async function handleWeb003CompositeRequest(request, env, ctx, delegate) {
  const url = new URL(request.url);
  try {
    const planJob = url.pathname.match(PLAN_JOB_ROUTE);
    if (request.method === "GET" && planJob) {
      const record = await loadCompositeJob(request, "plan", planJob[1]);
      return record ? json(record) : null;
    }

    const executionJob = url.pathname.match(EXECUTION_JOB_ROUTE);
    if (request.method === "GET" && executionJob) {
      const record = await loadCompositeJob(request, "execution", executionJob[1]);
      return record ? json(record) : null;
    }

    if (request.method === "POST" && url.pathname === PLAN_ROUTE) {
      const payload = await safeJSON(request.clone());
      if (!isExplicitCompositeRetool(payload)) return null;
      return createCompositePlan(request, payload, env, ctx, delegate);
    }

    if (request.method === "POST" && url.pathname === EXECUTE_ROUTE) {
      const payload = await safeJSON(request.clone());
      if (!payload?.plan?.plan?.websiteRetoolExceptions) return null;
      return executeCompositePlan(request, payload, env, ctx, delegate);
    }

    if (request.method === "POST" && url.pathname === ROLLBACK_ROUTE) {
      const payload = await safeJSON(request.clone());
      if (payload?.rollback?.packageType !== "web-003-composite") return null;
      return rollbackCompositePlan(request, payload, env, ctx, delegate);
    }
    return null;
  } catch (error) {
    return failure(error?.code || "web003_composite_failed", safeMessage(error), Number(error?.status || 500), {
      recovery: error?.recovery || null,
    });
  }
}

async function createCompositePlan(request, payload, env, ctx, delegate) {
  const canonicalResponse = await delegate(jsonRequest(request, payload));
  const canonicalSubmission = await safeJSON(canonicalResponse.clone());
  if (!canonicalResponse.ok) return canonicalResponse;
  const canonicalEnvelope = await resolveCompletedEnvelope(request, canonicalSubmission, delegate);
  const canonicalResult = canonicalEnvelope?.result;
  if (!canonicalResult?.planID || !canonicalResult?.plan?.targetTheme?.gid) {
    throw httpError(502, "canonical_plan_receipt_missing", "The canonical homepage planner did not return a completed source-bound plan.");
  }

  const exceptionPlan = await prepareWebsiteRetoolExceptions(request, env);
  if (exceptionPlan?.stagingTheme?.gid !== canonicalResult.plan.targetTheme.gid) {
    throw httpError(409, "composite_staging_target_mismatch", "The native-header inspection and canonical homepage plan do not target the same Kairos Staging theme.");
  }

  const result = buildCompositePlan(canonicalResult, exceptionPlan);
  const jobID = String(canonicalSubmission.jobID || canonicalEnvelope.jobID || crypto.randomUUID());
  const now = new Date().toISOString();
  const completed = {
    jobID,
    status: "completed",
    build: KAIROS_WEB003_COMPOSITE_BUILD,
    submittedAt: canonicalEnvelope.submittedAt || now,
    updatedAt: now,
    completedAt: now,
    summary: result.summary,
    result,
  };
  await saveCompositeJob(request, "plan", jobID, completed);
  return json({
    jobID,
    status: "completed",
    build: KAIROS_WEB003_COMPOSITE_BUILD,
    pollURL: `/api/shopify/staging/plan/jobs/${jobID}`,
    summary: result.summary,
    result,
  }, 202);
}

async function executeCompositePlan(request, payload, env, ctx, delegate) {
  const selectedChanges = Array.isArray(payload?.websiteRetool?.selectedChanges) ? payload.websiteRetool.selectedChanges : [];
  const nativeThemeDecision = String(payload?.websiteRetool?.nativeThemeDecision || "").trim();
  validateNativeThemeDecision(nativeThemeDecision, selectedChanges);

  const canonicalResponse = await delegate(jsonRequest(request, {
    plan: payload.plan,
    approval: payload.approval,
  }));
  const canonicalSubmission = await safeJSON(canonicalResponse.clone());
  if (!canonicalResponse.ok) return canonicalResponse;
  const canonicalEnvelope = await resolveCompletedEnvelope(request, canonicalSubmission, delegate);
  const canonicalResult = canonicalEnvelope?.result;
  if (canonicalResult?.status !== "completed" || !canonicalResult?.execution?.targetTheme?.gid || !canonicalResult?.rollback) {
    throw httpError(502, "canonical_execution_receipt_missing", "The canonical homepage execution did not return a verified staging receipt and rollback package.");
  }

  let exceptionResult = null;
  if (selectedChanges.length) {
    try {
      exceptionResult = await executeWebsiteRetoolExceptions(request, env, {
        plan: payload.plan.plan.websiteRetoolExceptions,
        approval: {
          status: "approved",
          approvedAt: payload?.approval?.approvedAt || new Date().toISOString(),
          targetThemeID: canonicalResult.execution.targetTheme.gid,
        },
        selectedChanges,
      });
    } catch (error) {
      const recovery = await rollbackCanonicalExecution(request, canonicalResult.rollback, delegate);
      const restored = recovery?.response?.ok && recovery?.body?.status === "completed";
      const failureError = httpError(
        502,
        restored ? "composite_native_theme_failed_auto_restored" : "composite_execution_recovery_required",
        restored
          ? `${safeMessage(error)} Kairos also restored the canonical homepage staging package, so no part of the composite preview remains applied.`
          : `${safeMessage(error)} Canonical homepage recovery also needs attention.`,
      );
      failureError.recovery = {
        nativeTheme: error?.recovery || null,
        canonicalHomepage: recovery?.body || null,
        fullyRestored: restored,
      };
      throw failureError;
    }
  }

  const result = mergeCompositeExecution(canonicalResult, exceptionResult, nativeThemeDecision);
  const jobID = String(canonicalSubmission.jobID || canonicalEnvelope.jobID || crypto.randomUUID());
  const now = new Date().toISOString();
  const completed = {
    jobID,
    status: "completed",
    build: KAIROS_WEB003_COMPOSITE_BUILD,
    submittedAt: canonicalEnvelope.submittedAt || now,
    updatedAt: now,
    completedAt: now,
    summary: result.summary,
    result,
  };
  await saveCompositeJob(request, "execution", jobID, completed);
  return json({
    jobID,
    status: "completed",
    build: KAIROS_WEB003_COMPOSITE_BUILD,
    pollURL: `/api/shopify/staging/execute/jobs/${jobID}`,
    summary: result.summary,
    result,
  }, 202);
}

async function rollbackCompositePlan(request, payload, env, ctx, delegate) {
  const rollback = payload.rollback;
  const approval = payload.approval || {};
  if (approval.status !== "approved" || approval.targetThemeID !== rollback.targetThemeID) {
    throw httpError(403, "composite_rollback_approval_required", "Explicit approval for the exact composite staging rollback target is required.");
  }

  let nativeThemeResult = null;
  if (rollback.nativeTheme?.files?.length) {
    nativeThemeResult = await rollbackWebsiteRetoolExceptions(request, env, {
      rollback: rollback.nativeTheme,
      approval: {
        status: "approved",
        approvedAt: approval.approvedAt || new Date().toISOString(),
        targetThemeID: rollback.targetThemeID,
      },
    });
  }

  const canonicalResponse = await delegate(jsonRequest(new Request(new URL(ROLLBACK_ROUTE, request.url), request), {
    rollback: rollback.canonical,
    approval: {
      ...approval,
      targetThemeID: rollback.targetThemeID,
      currentHashes: rollback.canonical?.currentHashes || {},
      expectedCurrentHashes: rollback.canonical?.currentHashes || {},
    },
  }));
  const canonicalBody = await safeJSON(canonicalResponse.clone());
  if (!canonicalResponse.ok) {
    const error = httpError(502, "composite_rollback_partial", "Native-theme files were restored, but the canonical homepage staging rollback needs attention.");
    error.recovery = { nativeTheme: nativeThemeResult, canonicalHomepage: canonicalBody };
    throw error;
  }
  const result = canonicalBody?.result ? {
    ...canonicalBody.result,
    build: KAIROS_WEB003_COMPOSITE_BUILD,
    summary: "Kairos restored and verified the complete pre-WEB-003 staging package.",
    nativeThemeRollback: nativeThemeResult,
  } : null;
  return json({
    ...canonicalBody,
    build: KAIROS_WEB003_COMPOSITE_BUILD,
    summary: result?.summary || canonicalBody?.summary,
    ...(result ? { result } : {}),
  }, canonicalResponse.status);
}

export function buildCompositePlan(canonicalResult, exceptionPlan) {
  const candidates = exceptionCandidates(exceptionPlan);
  const exceptionHashes = Object.fromEntries(candidates.map(candidate => [candidate.filename, candidate.sourceSha256]));
  const changes = [
    ...(Array.isArray(canonicalResult?.plan?.changes) ? canonicalResult.plan.changes : []),
    ...candidates.map(candidate => ({
      filename: candidate.filename,
      changeType: "native-theme-exception-candidate",
      purpose: candidate.authorizedChange,
      expectedOutcome: candidate.requiresExecutiveApproval ? "Apply only if explicitly selected for the rendered preview." : "Optional verified native-theme normalization.",
      confidence: candidate.confidence,
      requiresExecutiveApproval: candidate.requiresExecutiveApproval,
    })),
  ];
  return {
    ...canonicalResult,
    build: KAIROS_WEB003_COMPOSITE_BUILD,
    kernel: "web-003-composite-plan-v1",
    requestType: "full-retool",
    mutationScope: "canonical-homepage-plus-native-theme",
    summary: "Kairos prepared one source-bound WEB-003 package for the canonical homepage and explicitly selected native Shopify header/footer settings.",
    plan: {
      ...canonicalResult.plan,
      summary: "Install the canonical MMG homepage and include only the native-theme settings selected in this approval.",
      changes,
      sourceHashes: { ...(canonicalResult?.plan?.sourceHashes || {}), ...exceptionHashes },
      websiteRetoolExceptions: exceptionPlan,
      compositePackage: {
        build: KAIROS_WEB003_COMPOSITE_BUILD,
        canonicalFiles: (canonicalResult?.plan?.canonicalPackage?.files || []).map(file => file.filename),
        nativeThemeCandidateFiles: [...new Set(candidates.map(candidate => candidate.filename))],
        sourceHashBound: true,
        stagingOnly: true,
        explicitNativeThemeDecisionRequired: true,
      },
    },
    evidence: {
      ...(canonicalResult.evidence || {}),
      nativeThemeInspection: {
        build: exceptionPlan?.build,
        candidateCount: candidates.length,
        verifiedThemeSchemes: exceptionPlan?.verifiedThemeSchemes || [],
        liquidEvidence: exceptionPlan?.liquidEvidence || [],
      },
    },
  };
}

export function mergeCompositeExecution(canonicalResult, exceptionResult, nativeThemeDecision) {
  const canonicalFiles = Array.isArray(canonicalResult?.execution?.filesWritten) ? canonicalResult.execution.filesWritten : [];
  const nativeFiles = Array.isArray(exceptionResult?.execution?.filesWritten) ? exceptionResult.execution.filesWritten : [];
  const filesWritten = dedupeFiles([...canonicalFiles, ...nativeFiles]);
  const canonicalRollback = canonicalResult.rollback;
  const nativeRollback = exceptionResult?.rollback || null;
  const rollbackFiles = [
    ...(Array.isArray(canonicalRollback?.files) ? canonicalRollback.files : []),
    ...(Array.isArray(nativeRollback?.files) ? nativeRollback.files : []),
  ];
  const currentHashes = {
    ...(canonicalRollback?.currentHashes || {}),
    ...(nativeRollback?.currentHashes || {}),
  };
  return {
    ...canonicalResult,
    build: KAIROS_WEB003_COMPOSITE_BUILD,
    kernel: "web-003-composite-execution-v1",
    completedAt: new Date().toISOString(),
    summary: exceptionResult
      ? "Kairos installed and verified the canonical MMG homepage and the selected native Shopify theme settings on Kairos Staging."
      : "Kairos installed and verified the canonical MMG homepage while preserving the current native Shopify theme settings by explicit decision.",
    execution: {
      ...canonicalResult.execution,
      engine: "web-003-composite-v1",
      filesWritten,
      packageBoundary: filesWritten.map(file => file.filename),
      nativeThemeDecision,
      nativeThemeChangesApplied: nativeFiles.length,
      sourceHashBound: true,
      stagingOnly: true,
    },
    verification: [
      ...(Array.isArray(canonicalResult.verification) ? canonicalResult.verification : []),
      ...nativeFiles.map(file => ({
        filename: file.filename,
        expectedSha256: file.afterSha256,
        actualSha256: file.afterSha256,
        matched: file.verified === true,
        verificationSource: "shopify-native-theme-readback",
      })),
    ],
    evidence: {
      ...(canonicalResult.evidence || {}),
      nativeThemeExecution: exceptionResult ? {
        build: exceptionResult.build,
        receipts: exceptionResult.receipts,
        safeguards: exceptionResult.safeguards,
      } : {
        decision: "keep-current",
        mutationPerformed: false,
      },
    },
    rollback: {
      packageType: "web-003-composite",
      required: false,
      authorized: false,
      targetThemeID: canonicalRollback.targetThemeID,
      currentHashes,
      files: rollbackFiles,
      canonical: canonicalRollback,
      nativeTheme: nativeRollback,
      instruction: "Rollback requires a separate approval and restores the complete pre-WEB-003 homepage and native-theme staging package.",
    },
  };
}

function validateNativeThemeDecision(decision, selectedChanges) {
  const headerSelected = selectedChanges.some(change => change?.category === "header-branding"
    || change?.category === "visual-color"
    || /^sections\/header/i.test(String(change?.filename || "")));
  if (headerSelected && decision !== "approved-selection") {
    throw httpError(403, "native_header_selection_approval_required", "Approve the exact native-header selections before building the composite preview.");
  }
  if (!headerSelected && decision !== "keep-current") {
    throw httpError(403, "native_header_decision_required", "Explicitly keep the current native header or approve at least one exact header selection.");
  }
}

function exceptionCandidates(plan) {
  return [
    ...(Array.isArray(plan?.highConfidence) ? plan.highConfidence : []),
    ...(Array.isArray(plan?.executiveReview) ? plan.executiveReview : []),
  ];
}

function dedupeFiles(files) {
  return [...new Map(files.map(file => [file.filename, file])).values()];
}

function isExplicitCompositeRetool(payload) {
  return String(payload?.requestType || payload?.intent || "").toLowerCase() === "full-retool"
    && payload?.fullRetoolConfirmed === true
    && payload?.structuralMutationAuthorized === true
    && payload?.styleMutationAuthorized === true
    && payload?.contentOnlyLocked !== true;
}

async function resolveCompletedEnvelope(request, submission, delegate) {
  if (submission?.status === "completed" && submission?.result) return submission;
  if (!submission?.pollURL) return submission || {};
  const pollRequest = new Request(new URL(submission.pollURL, request.url), {
    method: "GET",
    headers: request.headers,
  });
  const response = await delegate(pollRequest);
  const body = await safeJSON(response.clone());
  if (!response.ok || body?.status !== "completed" || !body?.result) {
    throw httpError(response.status || 502, body?.error?.code || "website_job_incomplete", body?.error?.message || body?.summary || "The delegated website job did not return a completed receipt.");
  }
  return body;
}

async function rollbackCanonicalExecution(request, rollback, delegate) {
  const rollbackRequest = new Request(new URL(ROLLBACK_ROUTE, request.url), {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      rollback,
      approval: {
        status: "approved",
        approvedAt: new Date().toISOString(),
        targetThemeID: rollback.targetThemeID,
        currentHashes: rollback.currentHashes || {},
        expectedCurrentHashes: rollback.currentHashes || {},
        reason: "Automatic recovery after WEB-003 native-theme execution failure",
      },
    }),
  });
  const response = await delegate(rollbackRequest);
  return { response, body: await safeJSON(response.clone()) };
}

function jsonRequest(request, payload) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(payload),
    redirect: request.redirect,
  });
}

function jobCacheRequest(request, type, jobID) {
  return new Request(`${new URL(request.url).origin}/__kairos/web003-${type}/${jobID}`);
}

async function saveCompositeJob(request, type, jobID, value) {
  await caches.default.put(jobCacheRequest(request, type, jobID), new Response(JSON.stringify(value), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  }));
}

async function loadCompositeJob(request, type, jobID) {
  const response = await caches.default.match(jobCacheRequest(request, type, jobID));
  return response ? safeJSON(response) : null;
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function safeMessage(error) {
  return error instanceof Error && error.message ? error.message.slice(0, 1600) : "Kairos could not complete the WEB-003 composite operation.";
}

async function safeJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function failure(code, message, status = 500, additional = {}) {
  return json({
    status: status >= 500 ? "failed" : "needs-attention",
    build: KAIROS_WEB003_COMPOSITE_BUILD,
    error: { code, message },
    safeguards: {
      liveThemeChanged: false,
      sourceHashBound: true,
      compositeStagingTransaction: true,
    },
    ...additional,
  }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_WEB003_COMPOSITE_BUILD,
      "X-Kairos-WEB-003": "canonical-homepage-plus-native-theme",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
