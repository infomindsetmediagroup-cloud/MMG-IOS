import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
} from "./kairos-compact-homepage-utils-v1.js";
import { buildDeterministicHomepagePackage } from "./kairos-deterministic-homepage-v1.js";

const BUILD = "kairos-content-only-shopify-planner-20260715-1";
const HOMEPAGE_FILE = "templates/index.json";
const JOB_TTL_SECONDS = 3600;
const MAX_OBJECTIVE_CHARS = 12000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/shopify/staging/plan/jobs" && request.method === "POST") {
      return createContentOnlyPlan(request, env);
    }
    return json({ status: "not-found", build: BUILD }, 404);
  },
};

async function createContentOnlyPlan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 8) throw httpError(400, "objective_required", "Enter a specific website objective before starting the job.");
    if (objective.length > MAX_OBJECTIVE_CHARS) throw httpError(413, "objective_too_long", `Website objective exceeds ${MAX_OBJECTIVE_CHARS.toLocaleString()} characters.`);

    const sourceBody = await inspectStagingSource(null, request, env, BUILD, [HOMEPAGE_FILE]);
    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    validateBoundary(stagingTheme, mainTheme);

    const sourceFile = (Array.isArray(evidence.files) ? evidence.files : [])
      .find(file => file?.filename === HOMEPAGE_FILE && file?.readable && typeof file?.content === "string");
    if (!sourceFile?.content) throw httpError(409, "homepage_source_unavailable", "templates/index.json was not readable from Kairos Staging.");

    const document = parseShopifyJson(sourceFile.content, "Current Kairos Staging homepage");
    let packageResult;
    try {
      packageResult = buildDeterministicHomepagePackage(document, objective);
    } catch (error) {
      if (error?.code === "canonical_homepage_package_required") {
        throw httpError(409, "content_only_fields_unavailable", "The current homepage does not expose safe text fields for a content-only update. Kairos will not rebuild or restyle the page. Use an explicit full retool request only when a structural redesign is intended.");
      }
      throw error;
    }

    validateContentOnlyPatch(packageResult?.patch);
    const now = new Date().toISOString();
    const sourceHashes = { [HOMEPAGE_FILE]: sourceFile.sha256 || await hashText(sourceFile.content) };
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      requestType: "content-only",
      mutationScope: "existing-text-settings-only",
      status: "ready-for-approval",
      readOnly: true,
      build: BUILD,
      kernel: "content-only-shopify-planner-v1",
      startedAt: now,
      completedAt: now,
      objective,
      summary: packageResult.summary,
      plan: {
        summary: packageResult.summary,
        strategy: packageResult.strategy,
        changes: packageResult.changes,
        risks: packageResult.risks,
        acceptanceCriteria: packageResult.acceptanceCriteria,
        rollbackPlan: packageResult.rollbackPlan,
        installationMode: "existing-text-settings",
        deterministicPatch: packageResult.patch,
        canonicalPackage: null,
        targetTheme: stagingTheme,
        publishedTheme: mainTheme,
        sourceHashes,
        mutationScope: "content-only",
        structuralMutationAuthorized: false,
        styleMutationAuthorized: false,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
        providerPolicy: { externalInferenceProviders: "prohibited" },
      },
      evidence: {
        sourceInspectionActionID: sourceBody.actionID || "",
        stagingTheme,
        mainTheme,
        suppliedFiles: [{ filename: HOMEPAGE_FILE, exists: true, sha256: sourceFile.sha256 || null, bytes: sourceFile.bytes || 0 }],
        planningEngine: BUILD,
        externalInferenceProviderUsed: false,
        evidenceNotes: packageResult.evidenceNotes,
      },
    };

    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary: result.summary, result };
    await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(completed), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`,
        "X-MMG-Runtime": BUILD,
      },
    }));
    return json({ jobID, status: "completed", build: BUILD, pollURL: `/api/shopify/staging/plan/jobs/${jobID}`, summary: result.summary }, 202);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return json({
      status: "needs-attention",
      build: BUILD,
      summary: "Kairos could not prepare the content-only Shopify plan.",
      error: {
        status,
        code: typeof error?.code === "string" ? error.code : "content_only_plan_failed",
        message: error instanceof Error ? error.message : "Content-only planning failed.",
      },
    }, status);
  }
}

function validateContentOnlyPatch(patch) {
  const operations = Array.isArray(patch?.operations) ? patch.operations : [];
  if (!operations.length) throw httpError(409, "content_only_patch_empty", "No safe customer-facing text fields were found to update.");
  for (const operation of operations) {
    if (!operation || !["section", "block"].includes(operation.scope)) throw httpError(409, "content_only_scope_invalid", "Content-only planning produced an unsupported mutation scope.");
    if (!operation.sectionId || !operation.key || typeof operation.valueJson !== "string") throw httpError(409, "content_only_operation_invalid", "Content-only planning produced an incomplete text replacement.");
    const key = String(operation.key).toLowerCase();
    if (/(color|scheme|font|size|spacing|padding|margin|layout|style|image|video|icon|border|shadow|animation|columns?|rows?|width|height|position|alignment|css|class|template|section|block|type|order)/.test(key)) {
      throw httpError(409, "content_only_style_mutation_blocked", `Content-only mode blocked a non-text setting: ${operation.key}`);
    }
  }
}

function validateBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
}

function jobRequest(request, jobID) {
  return new Request(new URL(`/_kairos/standalone-plan-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Website-Intent": "content-only",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
