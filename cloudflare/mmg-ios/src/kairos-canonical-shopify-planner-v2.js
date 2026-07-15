import runtime from "./kairos-standalone-shopify-worker-v1.js";
import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
} from "./kairos-compact-homepage-utils-v1.js";
import {
  KAIROS_CANONICAL_HOMEPAGE_VERSION,
  CANONICAL_HOMEPAGE_FILENAMES,
  buildCanonicalHomepagePackage,
} from "./kairos-canonical-homepage-package-v1.js";

const BUILD = "kairos-canonical-shopify-planner-20260715-1";
const HOMEPAGE_FILE = "templates/index.json";
const JOB_TTL_SECONDS = 3600;
const MAX_OBJECTIVE_CHARS = 12000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/shopify/staging/plan/jobs" && request.method === "POST") {
      return createCanonicalPlan(request, env);
    }
    const response = await runtime.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-Kairos-Canonical-Planner", BUILD);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

async function createCanonicalPlan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 8) throw httpError(400, "objective_required", "Enter a specific website objective before starting the job.");
    if (objective.length > MAX_OBJECTIVE_CHARS) throw httpError(413, "objective_too_long", `Website objective exceeds ${MAX_OBJECTIVE_CHARS.toLocaleString()} characters.`);

    const sourceBody = await inspectStagingSource(null, request, env, BUILD, CANONICAL_HOMEPAGE_FILENAMES);
    const evidence = sourceBody?.evidence || {};
    const stagingTheme = evidence?.stagingTheme;
    const mainTheme = evidence?.mainTheme;
    validateBoundary(stagingTheme, mainTheme);

    const filesByName = new Map((Array.isArray(evidence.files) ? evidence.files : [])
      .filter(file => file?.readable && typeof file?.filename === "string" && typeof file?.content === "string")
      .map(file => [file.filename, file]));
    const sourceFile = filesByName.get(HOMEPAGE_FILE);
    if (!sourceFile?.content) throw httpError(409, "homepage_source_unavailable", "templates/index.json was not readable from Kairos Staging.");

    const document = parseShopifyJson(sourceFile.content, "Current Kairos Staging homepage");
    const packageResult = buildCanonicalHomepagePackage(document, objective);
    const manifest = await fileManifest(packageResult.files);
    const sourceHashes = Object.fromEntries(CANONICAL_HOMEPAGE_FILENAMES.map(filename => [filename, filesByName.get(filename)?.sha256 || null]));
    const now = new Date().toISOString();
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      status: "ready-for-approval",
      readOnly: true,
      build: BUILD,
      kernel: "canonical-shopify-planner-v2",
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
        installationMode: KAIROS_CANONICAL_HOMEPAGE_VERSION,
        deterministicPatch: null,
        canonicalPackage: {
          version: packageResult.version,
          sectionId: packageResult.sectionId,
          files: manifest,
        },
        targetTheme: stagingTheme,
        publishedTheme: mainTheme,
        sourceHashes,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
        providerPolicy: { externalInferenceProviders: "prohibited" },
      },
      evidence: {
        sourceInspectionActionID: sourceBody.actionID || "",
        stagingTheme,
        mainTheme,
        suppliedFiles: CANONICAL_HOMEPAGE_FILENAMES.map(filename => ({
          filename,
          exists: filesByName.has(filename),
          sha256: filesByName.get(filename)?.sha256 || null,
          bytes: filesByName.get(filename)?.bytes || 0,
        })),
        planningEngine: KAIROS_CANONICAL_HOMEPAGE_VERSION,
        externalInferenceProviderUsed: false,
        evidenceNotes: packageResult.evidenceNotes,
      },
    };

    const jobID = crypto.randomUUID();
    const completed = {
      jobID,
      status: "completed",
      build: BUILD,
      submittedAt: now,
      updatedAt: now,
      completedAt: now,
      summary: result.summary,
      result,
    };
    await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(completed), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`,
        "X-MMG-Runtime": BUILD,
      },
    }));
    return json({
      jobID,
      status: "completed",
      build: BUILD,
      pollURL: `/api/shopify/staging/plan/jobs/${jobID}`,
      summary: result.summary,
    }, 202);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return json({
      status: "needs-attention",
      build: BUILD,
      summary: "Kairos could not prepare the canonical Shopify homepage plan.",
      error: {
        status,
        code: typeof error?.code === "string" ? error.code : "canonical_homepage_plan_failed",
        message: error instanceof Error ? error.message : "Canonical homepage planning failed.",
      },
    }, status);
  }
}

async function fileManifest(files) {
  const manifest = [];
  for (const file of files) {
    manifest.push({
      filename: file.filename,
      sha256: await hashText(file.content),
      bytes: new TextEncoder().encode(file.content).length,
    });
  }
  return manifest;
}

function validateBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") {
    throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  }
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") {
    throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
  }
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
      "X-Kairos-Canonical-Planner": BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
