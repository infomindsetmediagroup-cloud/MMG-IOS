/**
 * Kairos Manuscript Deliverables — canonical Digital Asset Edition V2 adapter.
 *
 * Customer delivery is governed by one contract only:
 * mmg-canonical-digital-asset-edition-v2.
 */

import {
  runManuscriptDeliverablesBuild,
  getStoredManuscriptDeliverablesBuild,
  getStoredManuscriptDeliverablesZip,
  validateBuildArtifacts,
  KAIROS_MANUSCRIPT_DELIVERABLES_BUILDER_BUILD,
  PACKAGE_CONTRACT,
  REQUIRED_DELIVERABLE_KINDS,
  REQUIRED_PACKAGE_FILE_COUNT,
  MINIMUM_KDP_INTERIOR_PAGES,
} from "./kairos-manuscript-deliverables-builder-v4.js";

export const KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD =
  "kairos-manuscript-deliverables-http-20260805-7-canonical-digital-asset-v2";

const ROUTE = /^\/registry\/manuscripts\/([a-z0-9-]{8,})\/deliverables\/(build|zip)$/i;
const REQUIRED_KINDS = new Set(REQUIRED_DELIVERABLE_KINDS);

export async function handleManuscriptDeliverablesObjectRequest(state, request, handlers) {
  const url = new URL(request.url);
  const match = url.pathname.match(ROUTE);
  if (!match) return null;

  const projectId = match[1];
  const action = match[2];

  try {
    if (action === "build" && request.method === "POST") {
      await requireManufacturingConfirmation(request);
      const setupMigration = await ensureManufacturingSetup(state, projectId, handlers);
      const resolved = await resolveApprovedEditorialHandlers(state, projectId, handlers);
      const { build } = await runManuscriptDeliverablesBuild(state, projectId, resolved.handlers);
      requireCanonicalPackage(build);

      build.metadata = {
        ...(build.metadata || {}),
        setupMigration,
        ...(resolved.approvedEditorial ? {
          approvedEditorial: resolved.approvedEditorial,
          manuscriptAuthority: "checksum-verified-final-editorial-version",
        } : {}),
      };
      await state.storage.put(`manuscript-deliverables-build:${projectId}`, build);

      return json({
        status: "completed",
        build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
        manuscriptAuthority: resolved.approvedEditorial
          ? "checksum-verified-final-editorial-version"
          : "stored-intake-source",
        approvedEditorial: resolved.approvedEditorial,
        setupMigration,
        packageContract: PACKAGE_CONTRACT,
        deliverablesBuild: build,
      }, 201);
    }

    if (action === "build" && request.method === "GET") {
      const stored = await getStoredManuscriptDeliverablesBuild(state, projectId);
      if (!stored) return notBuilt("Deliverables have not been generated for this project yet. POST to /deliverables/build first.");
      try { requireCanonicalPackage(stored); }
      catch (error) { return stalePackage(error, stored); }
      return json({
        status: "ready",
        build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
        packageContract: PACKAGE_CONTRACT,
        deliverablesBuild: stored,
      });
    }

    if (action === "zip" && request.method === "GET") {
      const stored = await getStoredManuscriptDeliverablesBuild(state, projectId);
      if (!stored) return notBuilt("No canonical Digital Asset Edition V2 customer package has been generated for this project yet.");
      try { requireCanonicalPackage(stored); }
      catch (error) { return stalePackage(error, stored); }

      const zipBytes = await getStoredManuscriptDeliverablesZip(state, projectId);
      if (!(zipBytes instanceof Uint8Array) || !zipBytes.byteLength) {
        return json({
          status: "not-found",
          build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
          error: {
            code: "canonical_customer_package_zip_not_found",
            message: "The canonical package record exists, but its ZIP bytes are unavailable. Rebuild Final Delivery.",
          },
        }, 404);
      }
      const zipArtifact = stored.artifacts.find((artifact) => artifact.kind === "ZIP_ARCHIVE");
      const filename = zipArtifact?.filename || `digital-asset-edition-v2-${projectId}.zip`;
      return new Response(zipBytes, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename.replace(/["\r\n]/g, "")}"`,
          "Content-Length": String(zipBytes.byteLength),
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Kairos-Manuscript-Package-Contract": PACKAGE_CONTRACT,
          "X-Kairos-Manuscript-Package-File-Count": String(REQUIRED_PACKAGE_FILE_COUNT),
          "X-Kairos-Manuscript-Minimum-Interior-Pages": String(MINIMUM_KDP_INTERIOR_PAGES),
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
      packageContract: PACKAGE_CONTRACT,
      error: {
        code: error?.code || "manuscript_deliverables_build_failed",
        message: error instanceof Error ? error.message : "The manuscript deliverables build failed.",
      },
      deliverablesBuild: error?.build || null,
    }, Number(error?.status || 500));
  }
}

async function requireManufacturingConfirmation(request) {
  const contentType = String(request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return;
  const body = await request.clone().json().catch(() => ({}));
  const confirmation = String(body?.confirmation || "").trim().toUpperCase();
  if (confirmation && confirmation !== "MANUFACTURE DELIVERY PACKAGE") {
    throw fail(400, "manufacturing_confirmation_invalid", "Final Delivery requires the exact manufacturing confirmation.");
  }
}

async function ensureManufacturingSetup(state, projectId, handlers) {
  const setupHandler = handlers?.handleManuscriptProjectSetupObjectRequest;
  const sourceHandler = handlers?.handleManuscriptSourceObjectRequest;
  if (typeof setupHandler !== "function" || typeof sourceHandler !== "function") {
    throw fail(500, "manuscript_setup_migration_unavailable", "The manuscript setup and source handlers are required for final manufacturing.");
  }

  const setupURL = `https://kairos.internal/registry/manuscripts/${projectId}/setup`;
  const currentResponse = await setupHandler(state, new Request(setupURL, { method: "GET" }));
  const currentBody = await readJSON(currentResponse);
  if (currentResponse?.ok && currentBody?.setup) {
    return {
      status: "existing",
      build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
      projectId,
      setupCreated: false,
      coverPreserved: Boolean(currentBody.setup.cover),
    };
  }
  if (currentResponse && ![404, 409].includes(currentResponse.status)) {
    throw fail(currentResponse.status, currentBody?.error?.code || "manuscript_setup_read_failed", currentBody?.error?.message || "The saved project setup could not be read.");
  }

  const sourceResponse = await sourceHandler(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`, { method: "GET" }),
  );
  const sourceBody = await readJSON(sourceResponse);
  if (!sourceResponse?.ok || !sourceBody?.source) {
    throw fail(sourceResponse?.status || 404, sourceBody?.error?.code || "manuscript_source_required", sourceBody?.error?.message || "The saved manuscript source was not found.");
  }

  const coverResponse = await setupHandler(state, new Request(`${setupURL}/cover`, { method: "GET" }));
  if (!coverResponse?.ok) {
    const coverBody = await readJSON(coverResponse);
    throw fail(409, coverBody?.error?.code || "uploaded_cover_required", coverBody?.error?.message || "The approved cover is required before final manufacturing.");
  }

  const records = (await state.storage.get("production-registry")) || {};
  const registry = records?.[projectId] || {};
  const source = sourceBody.source;
  const operationId = `canonical-setup-normalization-${crypto.randomUUID()}`;
  const authorName = firstText(
    registry.authorName,
    registry.author,
    registry.metadata?.authorName,
    registry.metadata?.author,
    registry.customer?.authorName,
    source.authorName,
    source.author,
    summaryAuthor(registry.summary),
    "Mindset Media Group",
  ).slice(0, 160);
  const publicationTitle = firstText(
    registry.publicationTitle,
    registry.title,
    source.title,
    filenameTitle(source.filename),
    "Untitled Manuscript",
  ).slice(0, 240);

  const saveResponse = await setupHandler(state, new Request(setupURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kairos-Operation-Id": operationId,
      "X-Kairos-Idempotency-Key": `canonical-setup:${projectId}`,
    },
    body: JSON.stringify({
      authorName,
      publicationTitle,
      service: approvedService(registry.service || registry.projectService || registry.metadata?.service),
      edition: "multi-format",
      trimSize: "6x9",
      isbnStatus: approvedISBN(registry.isbnStatus || registry.metadata?.isbnStatus),
      notes: "Canonical Digital Asset Edition V2 setup normalized in place. Existing approved manuscript and cover were preserved.",
    }),
  }));
  const saveBody = await readJSON(saveResponse);
  if (!saveResponse?.ok || !saveBody?.setup) {
    throw fail(saveResponse?.status || 500, saveBody?.error?.code || "manuscript_setup_normalization_failed", saveBody?.error?.message || "The saved project setup could not be normalized for final manufacturing.");
  }

  return {
    status: "normalized",
    build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
    projectId,
    setupCreated: true,
    coverPreserved: Boolean(saveBody.setup.cover),
    publicationTitle: saveBody.setup.publicationTitle,
    authorName: saveBody.setup.authorName,
    trimSize: saveBody.setup.trimSize,
    operationId,
  };
}

function requireCanonicalPackage(build) {
  const contract = String(build?.metadata?.packageContract || "");
  if (contract !== PACKAGE_CONTRACT) {
    throw fail(
      409,
      "retired_manuscript_package_contract",
      `The stored package uses the retired ${contract || "unknown"} contract and must be rebuilt as ${PACKAGE_CONTRACT}.`,
    );
  }
  const result = validateBuildArtifacts(build);
  const artifacts = Array.isArray(build?.artifacts) ? build.artifacts : [];
  const packageFiles = artifacts.filter((artifact) => artifact?.kind !== "ZIP_ARCHIVE");
  const kinds = new Set(packageFiles.map((artifact) => artifact?.kind));
  const missing = [...REQUIRED_KINDS].filter((kind) => !kinds.has(kind));
  if (!result.ok || packageFiles.length !== REQUIRED_PACKAGE_FILE_COUNT || missing.length) {
    throw fail(
      409,
      "canonical_digital_asset_package_incomplete",
      `The stored package is not the canonical six-file Digital Asset Edition V2 package${missing.length ? `; missing ${missing.join(", ")}` : ""}.`,
    );
  }
  if (!artifacts.some((artifact) => artifact?.kind === "ZIP_ARCHIVE")) {
    throw fail(409, "canonical_customer_package_zip_missing", "The canonical customer package ZIP record is missing.");
  }
  if (Number(build?.metadata?.kdpInteriorPageCount || build?.metadata?.pageCount || 0) < MINIMUM_KDP_INTERIOR_PAGES) {
    throw fail(409, "mmg_minimum_page_standard_not_met", `The KDP interior does not meet the ${MINIMUM_KDP_INTERIOR_PAGES}-page MMG minimum.`);
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
      message: error?.message || "The saved package must be rebuilt using the canonical Digital Asset Edition V2 contract.",
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
  if (manuscript.trim().length < 50) {
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

function notBuilt(message) {
  return json({
    status: "not-found",
    build: KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
    error: { code: "manuscript_deliverables_not_built", message },
  }, 404);
}

function approvedService(value) {
  const service = String(value || "").trim();
  return new Set([
    "manuscript-correction",
    "editorial-production",
    "complete-publishing-package",
    "digital-edition-production",
  ]).has(service) ? service : "complete-publishing-package";
}

function approvedISBN(value) {
  const status = String(value || "").trim();
  return new Set(["customer-supplied", "kdp-free", "not-decided", "not-required"]).has(status)
    ? status
    : "not-required";
}

function summaryAuthor(value) {
  const text = String(value || "").trim();
  if (!text.includes("·")) return "";
  return text.split("·", 1)[0].trim();
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function filenameTitle(value) {
  return String(value || "")
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      "X-Kairos-Manuscript-Package-File-Count": String(REQUIRED_PACKAGE_FILE_COUNT),
      "X-Kairos-Manuscript-Deliverables-Http": KAIROS_MANUSCRIPT_DELIVERABLES_HTTP_BUILD,
    },
  });
}
