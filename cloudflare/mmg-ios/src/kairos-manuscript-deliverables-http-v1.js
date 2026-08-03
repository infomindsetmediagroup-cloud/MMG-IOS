/**
 * Kairos Manuscript Deliverables — HTTP routing adapter (production port)
 *
 * Thin HTTP layer over kairos-manuscript-deliverables-builder-v1.js. This is
 * intentionally separate from the pipeline/ZIP logic so the builder module can
 * be unit-tested outside of any Request/Response plumbing.
 *
 * Internal routes handled (co-located inside the KairosManuscriptSource Durable
 * Object, mirroring the existing source/setup/editorial object-request pattern):
 *   POST /registry/manuscripts/:projectId/deliverables/build  -> run the full
 *        10-stage pipeline and persist the build record + ZIP bytes.
 *   GET  /registry/manuscripts/:projectId/deliverables/build  -> return the
 *        most recently persisted build record (all 12 artifacts, SHA-256 hashes).
 *   GET  /registry/manuscripts/:projectId/deliverables/zip    -> stream back the
 *        most recently generated deliverables ZIP archive.
 *
 * These are reached publicly through the existing dedicated-manuscript-source
 * forwarding route in kairos-manuscript-source-shard-v1.js:
 *   POST /api/production-registry/manuscripts/:projectId/deliverables/build
 *   GET  /api/production-registry/manuscripts/:projectId/deliverables/build
 *   GET  /api/production-registry/manuscripts/:projectId/deliverables/zip
 *
 * No UI, CSS, or HTML file is touched by this route addition — it is API-only.
 */

import {
  runManuscriptDeliverablesBuild,
  getStoredManuscriptDeliverablesBuild,
  getStoredManuscriptDeliverablesZip,
  KAIROS_MANUSCRIPT_DELIVERABLES_BUILDER_BUILD,
} from "./kairos-manuscript-deliverables-builder-v1.js";

export const KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD =
  "kairos-manuscript-deliverables-http-20260803-1-production-port";

const ROUTE = /^\/registry\/manuscripts\/([a-z0-9-]{8,})\/deliverables\/(build|zip)$/i;

export async function handleManuscriptDeliverablesObjectRequest(state, request, handlers) {
  const url = new URL(request.url);
  const match = url.pathname.match(ROUTE);
  if (!match) return null;

  const projectId = match[1];
  const action = match[2];

  try {
    if (action === "build" && request.method === "POST") {
      const { build } = await runManuscriptDeliverablesBuild(state, projectId, handlers);
      return json({ status: build.status === "COMPLETED" ? "completed" : "failed", build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD, deliverablesBuild: build }, build.status === "COMPLETED" ? 201 : 422);
    }

    if (action === "build" && request.method === "GET") {
      const stored = await getStoredManuscriptDeliverablesBuild(state, projectId);
      if (!stored) {
        return json({
          status: "not-found",
          build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
          error: { code: "manuscript_deliverables_not_built", message: "Deliverables have not been generated for this project yet. POST to /deliverables/build first." },
        }, 404);
      }
      return json({ status: "ready", build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD, deliverablesBuild: stored });
    }

    if (action === "zip" && request.method === "GET") {
      const zipBytes = await getStoredManuscriptDeliverablesZip(state, projectId);
      if (!zipBytes) {
        return json({
          status: "not-found",
          build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
          error: { code: "manuscript_deliverables_zip_not_found", message: "No deliverables ZIP has been generated for this project yet." },
        }, 404);
      }
      const stored = await getStoredManuscriptDeliverablesBuild(state, projectId);
      const zipArtifact = stored?.artifacts?.find((a) => a.kind === "ZIP_ARCHIVE");
      const filename = zipArtifact?.filename || `deliverables-${projectId}.zip`;
      return new Response(zipBytes, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(zipBytes.byteLength),
          "Cache-Control": "no-store",
          "X-Kairos-Manuscript-Deliverables-Http": KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
          "X-Kairos-Manuscript-Deliverables-Builder": KAIROS_MANUSCRIPT_DELIVERABLES_BUILDER_BUILD,
        },
      });
    }

    return json({
      status: "method-not-allowed",
      build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
      error: { code: "manuscript_deliverables_method_not_allowed", message: `${request.method} is not allowed on this deliverables route.` },
    }, 405);
  } catch (error) {
    return json({
      status: "failed",
      build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
      error: {
        code: error?.code || "manuscript_deliverables_build_failed",
        message: error instanceof Error ? error.message : "The manuscript deliverables build failed.",
      },
      deliverablesBuild: error?.build || null,
    }, Number(error?.status || 500));
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Manuscript-Deliverables-Http": KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
    },
  });
}
