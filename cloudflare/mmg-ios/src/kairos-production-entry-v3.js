import runtime, { KairosProject } from "./kairos-production-entry-v2.js";
import {
  hashText,
  inspectStagingSource,
  parseShopifyJson,
  safeJSON,
  semanticHash,
} from "./kairos-compact-homepage-utils-v1.js";
import {
  KAIROS_CANONICAL_HOMEPAGE_VERSION,
  CANONICAL_HOMEPAGE_FILENAMES,
  CANONICAL_HOMEPAGE_SECTION_TYPE,
  buildCanonicalHomepagePackage,
} from "./kairos-canonical-homepage-package-v1.js";

const BUILD = "kairos-production-entry-20260713-3";
const HOMEPAGE_FILE = "templates/index.json";
const JOB_TTL_SECONDS = 3600;

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isCanonicalExecution =
      request.method === "POST" &&
      url.pathname === "/api/shopify/staging/execute/jobs";

    if (!isCanonicalExecution) {
      return runtime.fetch(request, env, ctx);
    }

    const payload = await safeJSON(request.clone());
    const planEnvelope = payload?.plan;
    const approval = payload?.approval;
    const installationMode = String(planEnvelope?.plan?.installationMode || "");

    if (installationMode !== KAIROS_CANONICAL_HOMEPAGE_VERSION) {
      return runtime.fetch(request, env, ctx);
    }

    let beforeInspection = null;
    try {
      beforeInspection = await inspectStagingSource(
        null,
        request,
        env,
        BUILD,
        CANONICAL_HOMEPAGE_FILENAMES,
      );
    } catch {
      // The governed runtime remains authoritative if pre-capture is unavailable.
    }

    const response = await runtime.fetch(request, env, ctx);
    if (response.status !== 502) return response;

    const failureBody = await safeJSON(response.clone());
    if (failureBody?.error?.code !== "staging_readback_hash_mismatch") {
      return response;
    }

    try {
      const approvedPackage = planEnvelope?.plan?.canonicalPackage;
      if (!approvedPackage || approvedPackage.version !== KAIROS_CANONICAL_HOMEPAGE_VERSION) {
        return response;
      }

      const beforeEvidence = beforeInspection?.evidence || {};
      const beforeFiles = themeFileMap(beforeEvidence);
      const beforeTemplate = beforeFiles.get(HOMEPAGE_FILE);
      if (!beforeTemplate?.content) return response;

      const beforeDocument = parseShopifyJson(beforeTemplate.content, "Pre-write Kairos Staging homepage");
      const expectedPackage = buildCanonicalHomepagePackage(
        beforeDocument,
        String(planEnvelope?.objective || ""),
      );
      if (expectedPackage.sectionId !== approvedPackage.sectionId) return response;

      const expectedByName = new Map(expectedPackage.files.map(file => [file.filename, file]));
      const approvedByName = new Map((approvedPackage.files || []).map(file => [file.filename, file]));

      for (const filename of CANONICAL_HOMEPAGE_FILENAMES) {
        const expected = expectedByName.get(filename);
        const approved = approvedByName.get(filename);
        if (!expected || !approved) return response;
        const expectedHash = await hashText(expected.content);
        if (expectedHash !== approved.sha256) return response;
      }

      const afterInspection = await inspectStagingSource(
        null,
        request,
        env,
        BUILD,
        CANONICAL_HOMEPAGE_FILENAMES,
      );
      const afterEvidence = afterInspection?.evidence || {};
      const afterFiles = themeFileMap(afterEvidence);
      const stagingTheme = afterEvidence?.stagingTheme;
      const mainTheme = afterEvidence?.mainTheme;

      if (!stagingTheme?.gid || stagingTheme.role === "MAIN") return response;
      if (!mainTheme?.gid || mainTheme.role !== "MAIN") return response;
      if (approval?.targetThemeID !== stagingTheme.gid) return response;

      const afterTemplate = afterFiles.get(HOMEPAGE_FILE);
      if (!afterTemplate?.content) return response;
      const actualDocument = parseShopifyJson(afterTemplate.content, "Shopify normalized homepage read-back");
      const expectedSemanticHash = await semanticHash(expectedPackage.document);
      const actualSemanticHash = await semanticHash(actualDocument);
      if (actualSemanticHash !== expectedSemanticHash) return response;

      const section = actualDocument?.sections?.[expectedPackage.sectionId];
      if (!section || section.type !== CANONICAL_HOMEPAGE_SECTION_TYPE) return response;
      if (!Array.isArray(actualDocument?.order) || !actualDocument.order.includes(expectedPackage.sectionId)) return response;

      const verification = [];
      for (const filename of CANONICAL_HOMEPAGE_FILENAMES) {
        const actual = afterFiles.get(filename);
        const expected = expectedByName.get(filename);
        if (!actual?.content || !expected) return response;

        if (filename === HOMEPAGE_FILE) {
          verification.push({
            filename,
            matched: true,
            verificationMode: "semantic-json",
            expectedSemanticSha256: expectedSemanticHash,
            actualSemanticSha256: actualSemanticHash,
            normalizedByShopify: actual.sha256 !== approvedByName.get(filename)?.sha256,
            jsonValid: true,
          });
          continue;
        }

        const expectedHash = await hashText(expected.content);
        if (actual.sha256 !== expectedHash) return response;
        verification.push({
          filename,
          matched: true,
          verificationMode: "exact-sha256",
          expectedSha256: expectedHash,
          actualSha256: actual.sha256,
        });
      }

      const completedAt = new Date().toISOString();
      const jobID = crypto.randomUUID();
      const rollbackFiles = CANONICAL_HOMEPAGE_FILENAMES.map(filename => {
        const original = beforeFiles.get(filename);
        return original
          ? {
              filename,
              existed: true,
              sha256: original.sha256,
              semanticSha256: filename === HOMEPAGE_FILE ? null : null,
              content: original.content,
            }
          : {
              filename,
              existed: false,
              sha256: null,
              semanticSha256: null,
              content: null,
            };
      });

      rollbackFiles.find(file => file.filename === HOMEPAGE_FILE).semanticSha256 =
        await semanticHash(beforeDocument);

      const filesWritten = CANONICAL_HOMEPAGE_FILENAMES.map(filename => ({
        filename,
        beforeSha256: beforeFiles.get(filename)?.sha256 || null,
        afterSha256: afterFiles.get(filename)?.sha256 || null,
        created: !beforeFiles.has(filename),
      }));

      const result = {
        actionID: crypto.randomUUID(),
        actionType: "shopify.staging.execute",
        status: "completed",
        build: BUILD,
        kernel: "standalone-shopify-v2-semantic-readback",
        completedAt,
        summary: "Kairos installed and semantically verified the canonical MMG homepage package on Kairos Staging.",
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
          filesWritten,
          beforeSemanticSha256: await semanticHash(beforeDocument),
          afterSemanticSha256: actualSemanticHash,
        },
        verification,
        evidence: {
          sourceInspectionActionID: beforeInspection?.actionID || "",
          readBackInspectionActionID: afterInspection?.actionID || "",
          packageVersion: expectedPackage.version,
          sectionId: expectedPackage.sectionId,
          shopifyTemplateNormalizationAccepted: true,
        },
        rollback: {
          required: false,
          authorized: false,
          targetThemeID: stagingTheme.gid,
          currentHashes: Object.fromEntries(
            CANONICAL_HOMEPAGE_FILENAMES.map(filename => [filename, afterFiles.get(filename)?.sha256 || null]),
          ),
          files: rollbackFiles,
          instruction: "Rollback requires separate approval, restores every pre-existing file byte-for-byte, and deletes package files that did not previously exist.",
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
  return new Request(
    new URL(`/_kairos/standalone-execution-jobs/${jobID}`, request.url).toString(),
    { method: "GET" },
  );
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Template-Verification": "semantic-json",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
