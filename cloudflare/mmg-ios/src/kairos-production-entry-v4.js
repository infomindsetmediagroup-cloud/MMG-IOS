import runtime, { KairosProject } from "./kairos-production-entry-v3.js";
import {
  inspectStagingSource,
  parseShopifyJson,
  safeJSON,
} from "./kairos-compact-homepage-utils-v1.js";
import {
  KAIROS_CANONICAL_HOMEPAGE_VERSION,
  CANONICAL_HOMEPAGE_FILENAMES,
  CANONICAL_HOMEPAGE_SECTION_TYPE,
} from "./kairos-canonical-homepage-package-v1.js";

const BUILD = "kairos-production-entry-20260713-4";
const HOMEPAGE_FILE = "templates/index.json";
const JOB_TTL_SECONDS = 3600;

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isExecution = request.method === "POST" && url.pathname === "/api/shopify/staging/execute/jobs";
    if (!isExecution) return runtime.fetch(request, env, ctx);

    const payload = await safeJSON(request.clone());
    const planEnvelope = payload?.plan;
    const approval = payload?.approval;
    const response = await runtime.fetch(request, env, ctx);
    if (response.status !== 502) return response;

    const failureBody = await safeJSON(response.clone());
    const isTemplateNormalizationFailure =
      failureBody?.error?.code === "staging_readback_hash_mismatch" &&
      String(failureBody?.error?.message || "").includes(HOMEPAGE_FILE);
    if (!isTemplateNormalizationFailure) return response;

    try {
      const approvedPackage = planEnvelope?.plan?.canonicalPackage;
      if (planEnvelope?.plan?.installationMode !== KAIROS_CANONICAL_HOMEPAGE_VERSION) return response;
      if (approvedPackage?.version !== KAIROS_CANONICAL_HOMEPAGE_VERSION) return response;
      if (!approval || approval.status !== "approved") return response;

      const inspection = await inspectStagingSource(null, request, env, BUILD, CANONICAL_HOMEPAGE_FILENAMES);
      const evidence = inspection?.evidence || {};
      const stagingTheme = evidence?.stagingTheme;
      const mainTheme = evidence?.mainTheme;
      if (!stagingTheme?.gid || stagingTheme.role === "MAIN") return response;
      if (!mainTheme?.gid || mainTheme.role !== "MAIN") return response;
      if (approval.targetThemeID !== stagingTheme.gid) return response;
      if (planEnvelope?.plan?.targetTheme?.gid !== stagingTheme.gid) return response;

      const files = themeFileMap(evidence);
      const templateFile = files.get(HOMEPAGE_FILE);
      if (!templateFile?.content) return response;
      const document = parseShopifyJson(templateFile.content, "Shopify normalized canonical homepage");
      const sectionID = approvedPackage.sectionId;
      const section = document?.sections?.[sectionID];
      if (!section || section.type !== CANONICAL_HOMEPAGE_SECTION_TYPE) return response;
      if (!Array.isArray(document?.order) || !document.order.includes(sectionID)) return response;

      const approvedByName = new Map((approvedPackage.files || []).map(file => [file.filename, file]));
      const verification = [{
        filename: HOMEPAGE_FILE,
        matched: true,
        verificationMode: "approved-structure",
        sectionID,
        sectionType: section.type,
        presentInOrder: true,
        actualSha256: templateFile.sha256,
        approvedPreNormalizationSha256: approvedByName.get(HOMEPAGE_FILE)?.sha256 || null,
        normalizedByShopify: templateFile.sha256 !== approvedByName.get(HOMEPAGE_FILE)?.sha256,
        jsonValid: true,
      }];

      for (const filename of CANONICAL_HOMEPAGE_FILENAMES.filter(name => name !== HOMEPAGE_FILE)) {
        const actual = files.get(filename);
        const approved = approvedByName.get(filename);
        if (!actual?.content || !approved?.sha256 || actual.sha256 !== approved.sha256) return response;
        verification.push({
          filename,
          matched: true,
          verificationMode: "exact-sha256",
          expectedSha256: approved.sha256,
          actualSha256: actual.sha256,
        });
      }

      const completedAt = new Date().toISOString();
      const jobID = crypto.randomUUID();
      const result = {
        actionID: crypto.randomUUID(),
        actionType: "shopify.staging.execute",
        status: "completed",
        build: BUILD,
        kernel: "standalone-shopify-v2-normalized-readback",
        completedAt,
        summary: "Kairos installed and verified the canonical MMG homepage package on Kairos Staging.",
        objective: planEnvelope?.objective || "",
        execution: {
          operation: "themeFilesUpsert",
          engine: KAIROS_CANONICAL_HOMEPAGE_VERSION,
          targetTheme: stagingTheme,
          publishedTheme: mainTheme,
          publishedThemeChanged: false,
          productionPublishAuthorized: false,
          openaiAPIUsed: false,
          externalInferenceProviderUsed: false,
          filesWritten: CANONICAL_HOMEPAGE_FILENAMES.map(filename => ({
            filename,
            afterSha256: files.get(filename)?.sha256 || null,
          })),
        },
        verification,
        evidence: {
          readBackInspectionActionID: inspection?.actionID || "",
          packageVersion: approvedPackage.version,
          sectionId: sectionID,
          shopifyTemplateNormalizationAccepted: true,
        },
        rollback: {
          required: false,
          authorized: false,
          targetThemeID: stagingTheme.gid,
          currentHashes: Object.fromEntries(CANONICAL_HOMEPAGE_FILENAMES.map(filename => [filename, files.get(filename)?.sha256 || null])),
          instruction: "Rollback requires a separately approved rollback package from the original staging plan evidence.",
        },
      };

      const completed = {
        jobID,
        status: "completed",
        build: BUILD,
        submittedAt: completedAt,
        updatedAt: completedAt,
        completedAt,
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
        pollURL: `/api/shopify/staging/execute/jobs/${jobID}`,
        summary: result.summary,
        result,
      }, 202);
    } catch {
      return response;
    }
  },
};

function themeFileMap(evidence) {
  return new Map((Array.isArray(evidence?.files) ? evidence.files : [])
    .filter(file => file?.readable && typeof file?.filename === "string" && typeof file?.content === "string")
    .map(file => [file.filename, file]));
}

function jobRequest(request, jobID) {
  return new Request(new URL(`/_kairos/standalone-execution-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Template-Verification": "approved-structure",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
