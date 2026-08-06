/**
 * Kairos Manuscript Deliverables — HTTP routing adapter.
 *
 * The authoritative builder manufactures the canonical six-file MMG Digital
 * Asset Edition V2 customer package. Every older manuscript or digital-asset
 * package contract is stale and must be rebuilt before customer delivery.
 */

import {
  runManuscriptDeliverablesBuild,
  getStoredManuscriptDeliverablesBuild,
  getStoredManuscriptDeliverablesZip,
  KAIROS_MANUSCRIPT_DELIVERABLES_BUILDER_BUILD,
  PACKAGE_CONTRACT,
} from "./kairos-manuscript-deliverables-builder-v4.js";

export const KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD =
  "kairos-manuscript-deliverables-http-20260805-6-canonical-digital-asset-v2";

const ROUTE = /^\/registry\/manuscripts\/([a-z0-9-]{8,})\/deliverables\/(build|zip)$/i;
const REQUIRED_KINDS = new Set([
  "CUSTOMER_SPEC_SHEET_PDF",
  "KDP_INTERIOR_PDF",
  "DIGITAL_EDITION_V2_PDF",
  "COVER_PORTRAIT_PNG",
  "COVER_THUMBNAIL_PNG",
  "README_TXT",
]);

export async function handleManuscriptDeliverablesObjectRequest(state, request, handlers) {
  const url = new URL(request.url);
  const match = url.pathname.match(ROUTE);
  if (!match) return null;

  const projectId = match[1];
  const action = match[2];

  try {
    if (action === "build" && request.method === "POST") {
      const resolved = await resolveApprovedEditorialHandlers(state, projectId, handlers);
      const { build } = await runManuscriptDeliverablesBuild(state, projectId, resolved.handlers);
      requireCanonicalPackage(build);

      if (resolved.approvedEditorial) {
        build.metadata = {
          ...(build.metadata || {}),
          approvedEditorial: resolved.approvedEditorial,
          manuscriptAuthority: "checksum-verified-final-editorial-version",
        };
        await state.storage.put(`manuscript-deliverables-build:${projectId}`, build);
      }

      return json({
        status: "completed",
        build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
        manuscriptAuthority: resolved.approvedEditorial
          ? "checksum-verified-final-editorial-version"
          : "stored-intake-source",
        approvedEditorial: resolved.approvedEditorial,
        packageContract: PACKAGE_CONTRACT,
        deliverablesBuild: build,
      }, 201);
    }

    if (action === "build" && request.method === "GET") {
      const stored = await getStoredManuscriptDeliverablesBuild(state, projectId);
      if (!stored) {
        return json({
          status: "not-found",
          build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
          error: {
            code: "manuscript_deliverables_not_built",
            message: "Deliverables have not been generated for this project yet. POST to /deliverables/build first.",
          },
        }, 404);
      }
      try {
        requireCanonicalPackage(stored);
      } catch (error) {
        return stalePackage(error, stored);
      }
      return json({
        status: "ready",
        build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
        packageContract: PACKAGE_CONTRACT,
        deliverablesBuild: stored,
      });
    }

    if (action === "zip" && request.method === "GET") {
      const stored = await getStoredManuscriptDeliverablesBuild(state, projectId);
      if (!stored) {
        return json({
          status: "not-found",
          build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
          error: {
            code: "manuscript_deliverables_zip_not_found",
            message: "No canonical six-file Digital Asset Edition V2 ZIP has been generated for this project yet.",
          },
        }, 404);
      }
      try {
        requireCanonicalPackage(stored);
      } catch (error) {
        return stalePackage(error, stored);
      }

      const zipBytes = await getStoredManuscriptDeliverablesZip(state, projectId);
      if (!zipBytes) {
        return json({
          status: "not-found",
          build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
          error: {
            code: "manuscript_deliverables_zip_not_found",
            message: "The canonical package record exists, but its ZIP bytes are unavailable. Rebuild the final deliverable.",
          },
        }, 404);
      }
      const zipArtifact = stored.artifacts.find((artifact) => artifact.kind === "ZIP_ARCHIVE");
      const filename = zipArtifact?.filename || `deliverables-${projectId}.zip`;
      return new Response(zipBytes, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(zipBytes.byteLength),
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Kairos-Manuscript-Package-Contract": PACKAGE_CONTRACT,
          "X-Kairos-Manuscript-Package-File-Count": "6",
          "X-Kairos-Manuscript-Deliverables-Http": KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
          "X-Kairos-Manuscript-Deliverables-Builder": KAIROS_MANUSCRIPT_DELIVERABLES_BUILDER_BUILD,
        },
      });
    }

    return json({
      status: "method-not-allowed",
      build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
      error: {
        code: "manuscript_deliverables_method_not_allowed",
        message: `${request.method} is not allowed on this deliverables route.`,
      },
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

function requireCanonicalPackage(build) {
  const contract = String(build?.metadata?.packageContract || "");
  if (contract !== PACKAGE_CONTRACT) {
    throw fail(409, "retired_manuscript_package_contract", `The stored package uses the retired ${contract || "unknown"} contract and must be rebuilt.`);
  }
  const artifacts = Array.isArray(build?.artifacts) ? build.artifacts : [];
  const packageFiles = artifacts.filter((artifact) => artifact?.kind !== "ZIP_ARCHIVE");
  const kinds = new Set(packageFiles.map((artifact) => artifact?.kind));
  const missing = [...REQUIRED_KINDS].filter((kind) => !kinds.has(kind));
  if (packageFiles.length !== 6 || missing.length) {
    throw fail(409, "canonical_digital_asset_v2_package_incomplete", `The stored package is not the canonical six-file Digital Asset Edition V2 package${missing.length ? `; missing ${missing.join(", ")}` : ""}.`);
  }
  if (!artifacts.some((artifact) => artifact?.kind === "ZIP_ARCHIVE")) {
    throw fail(409, "canonical_digital_asset_v2_package_zip_missing", "The canonical package ZIP record is missing.");
  }
  return build;
}

function stalePackage(error, stored) {
  return json({
    status: "stale-package",
    build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
    packageContract: stored?.metadata?.packageContract || "unknown",
    requiredPackageContract: PACKAGE_CONTRACT,
    error: {
      code: error?.code || "retired_manuscript_package_contract",
      message: error?.message || "The saved package must be rebuilt using the canonical six-file Digital Asset Edition V2 contract.",
    },
  }, 409);
}

async function resolveApprovedEditorialHandlers(state, projectId, handlers) {
  const sourceHandler = handlers?.handleManuscriptSourceObjectRequest;
  const editorialHandler = handlers?.handleManuscriptEditorialObjectRequest;
  if (typeof sourceHandler !== "function" || typeof editorialHandler !== "function") {
    return { handlers, approvedEditorial: null };
  }

  const editorialResponse = await editorialHandler(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/editorial`, { method: "GET" }),
  );
  const editorialBody = await readJSON(editorialResponse);
  const editorial = editorialBody?.editorial || null;
  if (!editorialResponse?.ok || editorial?.status !== "ready-for-manufacturing" || !editorial?.finalVersionId) {
    return { handlers, approvedEditorial: null };
  }

  const version = (editorial.versions || []).find((item) => item?.versionId === editorial.finalVersionId);
  if (!version?.checksum) {
    throw fail(409, "approved_editorial_version_missing", "The approved final editorial version could not be identified for deterministic manufacturing.");
  }

  const versionResponse = await editorialHandler(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/editorial/versions/${encodeURIComponent(editorial.finalVersionId)}`, { method: "GET" }),
  );
  const versionBody = await readJSON(versionResponse);
  if (!versionResponse?.ok) {
    throw fail(versionResponse?.status || 502, "approved_editorial_text_unavailable", versionBody?.error?.message || "The approved final editorial manuscript could not be loaded.");
  }

  const manuscript = String(versionBody?.manuscript || "");
  if (manuscript.trim().length < 500) {
    throw fail(409, "approved_editorial_incomplete", "The approved final editorial manuscript is incomplete.");
  }

  const checksum = await sha256(manuscript);
  if (checksum !== String(version.checksum).toLowerCase()) {
    throw fail(502, "approved_editorial_integrity_failed", "The approved final editorial manuscript failed checksum verification.");
  }

  const approvedEditorial = {
    versionId: version.versionId,
    label: version.label || "Final editorial version",
    passType: version.passType || "final",
    checksum,
    wordCount: Number(version.wordCount || countWords(manuscript)),
    characterCount: manuscript.length,
    status: editorial.status,
  };

  const approvedSourceHandler = async (objectState, sourceRequest) => {
    const sourceURL = new URL(sourceRequest.url);
    const isTextRead = sourceRequest.method === "GET"
      && sourceURL.pathname === `/registry/manuscripts/${projectId}/source/text`;
    if (!isTextRead) return sourceHandler(objectState, sourceRequest);

    const metadataResponse = await sourceHandler(
      objectState,
      new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`, { method: "GET" }),
    );
    const metadataBody = await readJSON(metadataResponse);
    return json({
      status: "ready",
      build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
      source: metadataBody?.source || null,
      manuscript,
      manuscriptAuthority: "checksum-verified-final-editorial-version",
      approvedEditorial,
    });
  };

  return {
    approvedEditorial,
    handlers: {
      ...handlers,
      handleManuscriptSourceObjectRequest: approvedSourceHandler,
    },
  };
}

async function readJSON(response) {
  if (!response) return {};
  try { return await response.clone().json(); }
  catch { return {}; }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function countWords(value) {
  return (String(value || "").match(/\b[\w’'-]+\b/g) || []).length;
}

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Kairos-Manuscript-Package-Contract": PACKAGE_CONTRACT,
      "X-Kairos-Manuscript-Deliverables-Http": KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
    },
  });
}
