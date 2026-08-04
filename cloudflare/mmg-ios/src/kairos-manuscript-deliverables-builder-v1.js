/**
 * Kairos Manuscript Deliverables Builder — production port (backend/API only)
 *
 * Ports the A-to-Z "Manuscript Builder" asset-generation pipeline that already
 * exists in the local-only dev console (kairos-web-admin/src/manuscript-builder.mjs)
 * into the real production Worker, so the live Kairos dashboard can eventually
 * trigger it through a real API route.
 *
 * Canonical contract (mirrors server/kairos/publishing/contracts.ts and the
 * local console reference implementation):
 *
 *   Pipeline stages (10, canonical order):
 *     INTAKE -> SOURCE_VALIDATION -> MANUSCRIPT_EXTRACTION -> METADATA_INFERENCE ->
 *     EDITORIAL_ANALYSIS -> DELIVERABLE_GENERATION -> PRODUCT_METADATA_GENERATION ->
 *     PACKAGE_ASSEMBLY -> REVIEW -> SHOPIFY_STAGING_HANDOFF
 *
 *   Required artifact kinds (12):
 *     ORIGINAL_SOURCE, NORMALIZED_MANUSCRIPT, EDITABLE_MANUSCRIPT, FINAL_MANUSCRIPT,
 *     COVER_SOURCE, STOREFRONT_PRODUCT_IMAGE, PRODUCT_METADATA, CUSTOMER_README,
 *     QA_REPORT, RIGHTS_DECLARATION, PACKAGE_MANIFEST, ZIP_ARCHIVE
 *
 * This module is intentionally self-contained (no npm dependencies, Workers
 * runtime only) and does not touch any visual/shell/dashboard file. It reads
 * a project's already-stored manuscript source/setup/editorial state from the
 * dedicated KairosManuscriptSource Durable Object (by re-invoking the existing,
 * already-exported object-request handlers against synthetic same-origin
 * requests) and produces the same 12 deliverable artifacts + ZIP archive that
 * the local console produces, persisted into Durable Object storage so the
 * build record and the ZIP bytes can be fetched back out over HTTP.
 */

export const KAIROS_MANUSCRIPT_DELIVERABLES_BUILDER_BUILD =
  "kairos-manuscript-deliverables-builder-20260803-1-production-port";

export const PIPELINE_STAGES = [
  "INTAKE",
  "SOURCE_VALIDATION",
  "MANUSCRIPT_EXTRACTION",
  "METADATA_INFERENCE",
  "EDITORIAL_ANALYSIS",
  "DELIVERABLE_GENERATION",
  "PRODUCT_METADATA_GENERATION",
  "PACKAGE_ASSEMBLY",
  "REVIEW",
  "SHOPIFY_STAGING_HANDOFF",
];

export const REQUIRED_ARTIFACT_KINDS = [
  "ORIGINAL_SOURCE",
  "NORMALIZED_MANUSCRIPT",
  "EDITABLE_MANUSCRIPT",
  "FINAL_MANUSCRIPT",
  "COVER_SOURCE",
  "STOREFRONT_PRODUCT_IMAGE",
  "PRODUCT_METADATA",
  "CUSTOMER_README",
  "QA_REPORT",
  "RIGHTS_DECLARATION",
  "PACKAGE_MANIFEST",
  "ZIP_ARCHIVE",
];

const BUILD_KEY_PREFIX = "manuscript-deliverables-build:";

// ── Utility functions ──────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function kebabCase(text) {
  return (
    String(text || "untitled")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

function createInitialStages() {
  return PIPELINE_STAGES.map((name) => ({
    name,
    status: "PENDING",
    startedAt: null,
    completedAt: null,
    errorMessage: null,
  }));
}

function artifactId() {
  return `ka_${crypto.randomUUID()}`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Zero-dependency ZIP writer (store method, no compression) ──────────────
// Ported verbatim (algorithm-for-algorithm) from kairos-web-admin/src/manuscript-builder.mjs
// so both the local dev console and the production Worker produce byte-compatible ZIPs.

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeZip(files) {
  // files: [{ filename, data: Uint8Array }]
  const localHeaders = [];
  const fileData = [];
  const centralDir = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.filename);
    const crc = crc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(localHeader.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localHeaders.push(localHeader);
    fileData.push(file.data);

    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cdHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, size, true);
    cdv.setUint32(24, size, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    cdHeader.set(nameBytes, 46);
    centralDir.push(cdHeader);

    offset += localHeader.length + file.data.length;
  }

  const cdSize = centralDir.reduce((sum, h) => sum + h.length, 0);
  const cdOffset = offset;

  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, cdOffset, true);
  edv.setUint16(20, 0, true);

  const totalSize = offset + cdSize + 22;
  const zip = new Uint8Array(totalSize);
  let pos = 0;
  for (let i = 0; i < files.length; i++) {
    zip.set(localHeaders[i], pos);
    pos += localHeaders[i].length;
    zip.set(fileData[i], pos);
    pos += fileData[i].length;
  }
  for (const cd of centralDir) {
    zip.set(cd, pos);
    pos += cd.length;
  }
  zip.set(eocd, pos);

  return zip;
}

// ── Project source resolution ───────────────────────────────────────────────
// Reuses the already-exported, unmodified object-request handlers for the
// manuscript source / project setup / editorial workbench, invoking them
// in-process against the same Durable Object `state` via synthetic requests.
// This avoids duplicating or forking their private storage-key logic.

async function readJsonOrNull(response) {
  if (!response) return null;
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

async function resolveProjectSource(state, projectId, handlers) {
  const { handleManuscriptSourceObjectRequest, handleManuscriptProjectSetupObjectRequest, handleManuscriptEditorialObjectRequest } = handlers;

  const metadataReq = new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`, { method: "GET" });
  const metadataRes = await handleManuscriptSourceObjectRequest(state, metadataReq);
  const metadataBody = await readJsonOrNull(metadataRes);
  if (!metadataRes || metadataRes.status === 404 || !metadataBody?.source) {
    const error = new Error("No manuscript source has been stored for this project yet.");
    error.status = 404;
    error.code = "manuscript_source_required";
    throw error;
  }

  const textReq = new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source/text`, { method: "GET" });
  const textRes = await handleManuscriptSourceObjectRequest(state, textReq);
  const textBody = await readJsonOrNull(textRes);
  const manuscriptText = String(textBody?.manuscript || "");

  let setup = null;
  if (typeof handleManuscriptProjectSetupObjectRequest === "function") {
    const setupReq = new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`, { method: "GET" });
    const setupRes = await handleManuscriptProjectSetupObjectRequest(state, setupReq);
    const setupBody = await readJsonOrNull(setupRes);
    setup = setupBody?.setup || null;
  }

  let editorial = null;
  if (typeof handleManuscriptEditorialObjectRequest === "function") {
    try {
      const editorialReq = new Request(`https://kairos.internal/registry/manuscripts/${projectId}/editorial`, { method: "GET" });
      const editorialRes = await handleManuscriptEditorialObjectRequest(state, editorialReq);
      const editorialBody = await readJsonOrNull(editorialRes);
      editorial = editorialBody?.editorial || null;
    } catch {
      // Editorial status is informational-only for the deliverables pipeline; a
      // project that has not yet been registered globally simply has no editorial
      // history to surface, which is not fatal to building deliverables.
      editorial = null;
    }
  }

  return {
    source: metadataBody.source,
    manuscriptText,
    setup,
    editorial,
  };
}

// ── Pipeline stage implementations ──────────────────────────────────────────

function stageIntake(project, build) {
  const setup = project.setup || {};
  const source = project.source || {};
  build.metadata = {
    workingTitle: setup.publicationTitle || source.title || "Untitled Manuscript",
    author: setup.authorName || "Unknown Author",
    service: setup.service || "Publishing Service",
    projectId: project.projectId,
  };
  return build;
}

function stageSourceValidation(project, build) {
  const errors = [];
  if (!project.manuscriptText || project.manuscriptText.trim().length < 50) {
    errors.push("Extracted manuscript text is required (minimum 50 characters).");
  }
  if (!build.metadata.workingTitle) errors.push("A working title is required.");
  if (errors.length > 0) throw new Error(`Source validation failed: ${errors.join("; ")}`);
  return build;
}

function stageManuscriptExtraction(project, build) {
  const manuscriptText = project.manuscriptText || "";
  build._manuscriptText = manuscriptText;
  build.metadata.wordCount = manuscriptText.trim().length ? manuscriptText.trim().split(/\s+/).length : 0;
  return build;
}

function stageMetadataInference(project, build) {
  const title = build.metadata.workingTitle;
  const author = build.metadata.author;
  build.metadata.inferred = {
    title,
    subtitle: `A publishing production by ${author}`,
    author,
    productType: "GUIDE",
    intendedAudience: "Readers and customers of the purchased publishing service",
    categories: ["Education", "Self-Help", "Business"],
    keywords: ["manuscript", "publishing", "guide"],
    language: "en",
    estimatedReadingTime: Math.max(1, Math.ceil((build.metadata.wordCount || 0) / 200)),
  };
  return build;
}

function stageEditorialAnalysis(project, build) {
  const issues = [];
  const text = build._manuscriptText || "";
  if (text.length < 500) issues.push({ severity: "warning", message: "Manuscript is very short." });
  if (!/chapter|introduction/i.test(text)) issues.push({ severity: "info", message: "Consider adding chapter markers." });
  const editorialStatus = project.editorial?.status;
  if (editorialStatus && editorialStatus !== "ready-for-manufacturing" && editorialStatus !== "customer-approved") {
    issues.push({ severity: "info", message: `Editorial status is currently "${editorialStatus}"; final sign-off may still be pending.` });
  }
  build._editorialIssues = issues;
  build.metadata.editorialIssues = issues;
  return build;
}

function stageDeliverableGeneration(project, build) {
  const title = build.metadata.workingTitle;
  const author = build.metadata.author;
  const manuscriptText = build._manuscriptText || "";

  build._normalizedManuscript = manuscriptText;

  build._editableManuscript = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeXml(title)}</title>
<style>
body { font-family: Georgia, serif; max-width: 720px; margin: 0 auto; padding: 40px; line-height: 1.7; color: #1a1a1a; }
h1 { font-size: 2.2em; text-align: center; margin-bottom: 0.3em; }
h2 { font-size: 1.5em; margin-top: 2em; border-bottom: 1px solid #ddd; padding-bottom: 0.2em; }
.subtitle { text-align: center; font-size: 1.1em; color: #555; margin-bottom: 2em; }
p { margin: 1em 0; }
</style>
</head>
<body>
<h1>${escapeXml(title)}</h1>
<p class="subtitle">By ${escapeXml(author)}</p>
<pre style="white-space: pre-wrap; font-family: Georgia, serif;">${escapeXml(manuscriptText)}</pre>
</body>
</html>`;

  build._finalManuscript = `---
title: "${title}"
author: "${author}"
language: en
---

${manuscriptText}
`;

  return build;
}

function stageProductMetadataGeneration(project, build) {
  const inferred = build.metadata.inferred || {};
  const title = inferred.title || build.metadata.workingTitle;
  const handle = kebabCase(title);

  build._productMetadata = {
    title,
    handle,
    descriptionHtml: `<p><strong>${escapeXml(title)}</strong></p><p>${escapeXml(inferred.subtitle)}</p><p>Intended audience: ${escapeXml(inferred.intendedAudience)}</p>`,
    seoTitle: `${title} | Mindset Media Group`,
    metaDescription: `${title} — ${inferred.subtitle}`.slice(0, 155),
    socialTitle: `${title} by ${build.metadata.author}`,
    socialDescription: String(inferred.subtitle || "").slice(0, 155),
    vendor: "Mindset Media Group",
    productType: "Digital Product",
    status: "DRAFT",
    categories: inferred.categories || ["Education"],
    keywords: inferred.keywords || [],
    estimatedReadingTime: inferred.estimatedReadingTime || null,
  };

  return build;
}

function generateCoverSvg(title, author) {
  const safeTitle = escapeXml(title);
  const safeAuthor = escapeXml(author);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2400" viewBox="0 0 1600 2400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="2400" fill="url(#bg)"/>
  <rect x="80" y="80" width="1440" height="2240" fill="none" stroke="#38bdf8" stroke-width="3" rx="24" opacity="0.4"/>
  <text x="800" y="1000" font-family="Georgia, serif" font-size="64" fill="#f8fafc" text-anchor="middle" font-weight="bold">${safeTitle}</text>
  <text x="800" y="1080" font-family="Inter, sans-serif" font-size="28" fill="#7dd3fc" text-anchor="middle" letter-spacing="4">MINDSET MEDIA GROUP</text>
  <line x1="600" y1="1200" x2="1000" y2="1200" stroke="#38bdf8" stroke-width="2" opacity="0.5"/>
  <text x="800" y="1280" font-family="Georgia, serif" font-size="36" fill="#94a3b8" text-anchor="middle">${safeAuthor}</text>
</svg>`;
}

function generateCustomerReadme(project, build) {
  const title = build.metadata.workingTitle;
  const author = build.metadata.author;
  const artifacts = build.artifacts || [];
  const wordCount = build.metadata.wordCount || 0;

  return `# ${title}

## Deliverables Package

This package contains the complete set of deliverables generated by the Kairos Manuscript Builder.

### Project Information

- **Project:** ${project.projectId}
- **Author:** ${author}
- **Service:** ${build.metadata.service}
- **Generated:** ${now()}
- **Word Count:** ${wordCount.toLocaleString()}

### Contents

${artifacts.map((a) => `- **${a.filename}** (${a.kind}) — ${a.byteSize.toLocaleString()} bytes`).join("\n")}

### Important Notes

- Shopify product status is set to DRAFT — no live mutations are authorized.
- All source files are immutable.
- This package was generated by the Kairos Manuscript Deliverables Builder.

---
Generated by Kairos Manuscript Builder | Mindset Media Group`;
}

function generateQaReport(project, build, artifacts) {
  const issues = build._editorialIssues || [];
  const blocking = issues.filter((i) => i.severity === "blocking");

  return {
    reportId: crypto.randomUUID(),
    projectId: project.projectId,
    checkedAt: now(),
    passed: blocking.length === 0,
    summary: {
      totalArtifacts: artifacts.length,
      requiredArtifacts: REQUIRED_ARTIFACT_KINDS.length,
      allRequiredPresent: REQUIRED_ARTIFACT_KINDS.every((kind) => artifacts.some((a) => a.kind === kind)),
      wordCount: build.metadata.wordCount || 0,
      editorialIssues: issues.length,
      blocking: blocking.length,
    },
    checks: [
      { name: "All 12 required artifact kinds present", passed: REQUIRED_ARTIFACT_KINDS.every((kind) => artifacts.some((a) => a.kind === kind)) },
      { name: "Manuscript word count > 500", passed: (build.metadata.wordCount || 0) > 500 },
      { name: "Product metadata status is DRAFT", passed: build._productMetadata?.status === "DRAFT" },
      { name: "No blocking editorial issues", passed: blocking.length === 0 },
      { name: "Cover artwork generated", passed: artifacts.some((a) => a.kind === "COVER_SOURCE") },
      { name: "ZIP archive created", passed: artifacts.some((a) => a.kind === "ZIP_ARCHIVE") },
    ],
    issues,
  };
}

function generateRightsDeclaration(project, build) {
  const author = build.metadata.author;
  const title = build.metadata.workingTitle;

  return `# Rights Declaration

## Ownership

The content contained in this deliverables package, including the manuscript titled "${title}", is the intellectual property of ${author}.

## License

Mindset Media Group has been engaged to provide publishing services including editorial review, formatting, and product metadata generation. The customer retains full ownership of all original content.

## Shopify Staging Authorization

- Shopify product status: DRAFT
- Live Shopify mutation authorized: false
- No live publication or pricing changes are authorized without explicit executive approval from Mindset Media Group.

## Distribution

This deliverables package is intended for the customer and authorized Mindset Media Group staff.

---
Declared: ${now()}
Project: ${project.projectId}`;
}

async function stagePackageAssembly(project, build) {
  const now_ts = now();
  const artifacts = [];
  const files = {};

  async function addArtifact(kind, filename, mimeType, content) {
    const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
    files[filename] = data;
    artifacts.push({
      id: artifactId(),
      kind,
      filename,
      mimeType,
      byteSize: data.byteLength,
      sha256: await sha256Hex(data),
      storageKey: `${project.projectId}/${filename}`,
      createdAt: now_ts,
    });
  }

  await addArtifact(
    "ORIGINAL_SOURCE",
    "original-source.json",
    "application/json",
    JSON.stringify(
      {
        projectId: project.projectId,
        title: project.source?.title,
        filename: project.source?.filename,
        format: project.source?.format,
        wordCount: project.source?.wordCount,
        checksum: project.source?.checksum,
        capturedAt: project.source?.createdAt,
      },
      null,
      2
    )
  );

  await addArtifact("NORMALIZED_MANUSCRIPT", "normalized-manuscript.md", "text/markdown", build._normalizedManuscript);
  await addArtifact("EDITABLE_MANUSCRIPT", "editable-manuscript.html", "text/html", build._editableManuscript);
  await addArtifact("FINAL_MANUSCRIPT", "final-manuscript.md", "text/markdown", build._finalManuscript);

  const coverSvg = generateCoverSvg(build.metadata.workingTitle, build.metadata.author);
  await addArtifact("COVER_SOURCE", "cover-source.svg", "image/svg+xml", coverSvg);
  await addArtifact("STOREFRONT_PRODUCT_IMAGE", "storefront-product-image.svg", "image/svg+xml", coverSvg);

  await addArtifact("PRODUCT_METADATA", "product-metadata.json", "application/json", JSON.stringify(build._productMetadata, null, 2));

  const readme = generateCustomerReadme(project, { ...build, artifacts });
  await addArtifact("CUSTOMER_README", "README.md", "text/markdown", readme);

  const qaReport = generateQaReport(project, build, artifacts);
  await addArtifact("QA_REPORT", "qa-report.json", "application/json", JSON.stringify(qaReport, null, 2));

  const rights = generateRightsDeclaration(project, build);
  await addArtifact("RIGHTS_DECLARATION", "rights-declaration.md", "text/markdown", rights);

  const zipFilename = `deliverables-${kebabCase(build.metadata.workingTitle)}.zip`;
  const manifestArtifactId = artifactId();
  const zipArtifactId = artifactId();

  function buildManifest() {
    return {
      schemaVersion: "1.0.0",
      projectId: project.projectId,
      generatedAt: now_ts,
      artifacts: artifacts.map((a) => ({
        id: a.id,
        kind: a.kind,
        filename: a.filename,
        mimeType: a.mimeType,
        byteSize: a.byteSize,
        sha256: a.sha256,
        storageKey: a.storageKey,
        createdAt: a.createdAt,
      })),
      shopifyMetadata: build._productMetadata,
      qaPassed: qaReport.passed,
      rightsDeclarationComplete: true,
      liveShopifyMutationAuthorized: false,
    };
  }

  let manifestArtifact = {
    id: manifestArtifactId,
    kind: "PACKAGE_MANIFEST",
    filename: "manifest.json",
    mimeType: "application/json",
    byteSize: 0,
    sha256: "",
    storageKey: `${project.projectId}/manifest.json`,
    createdAt: now_ts,
  };
  let zipArtifact = {
    id: zipArtifactId,
    kind: "ZIP_ARCHIVE",
    filename: zipFilename,
    mimeType: "application/zip",
    byteSize: 0,
    sha256: "",
    storageKey: `${project.projectId}/${zipFilename}`,
    createdAt: now_ts,
  };

  artifacts.push(manifestArtifact);
  let manifest = buildManifest();
  let manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  files["manifest.json"] = manifestData;
  manifestArtifact.byteSize = manifestData.byteLength;
  manifestArtifact.sha256 = await sha256Hex(manifestData);

  // Rewrite manifest now that PACKAGE_MANIFEST's own hash is known.
  manifest = buildManifest();
  manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  files["manifest.json"] = manifestData;
  manifestArtifact.byteSize = manifestData.byteLength;
  manifestArtifact.sha256 = await sha256Hex(manifestData);

  artifacts.push(zipArtifact);
  const zipFiles = artifacts.filter((a) => a.kind !== "ZIP_ARCHIVE").map((a) => ({ filename: a.filename, data: files[a.filename] }));
  let zipData = writeZip(zipFiles);
  zipArtifact.byteSize = zipData.byteLength;
  zipArtifact.sha256 = await sha256Hex(zipData);

  // Final manifest rewrite with the ZIP hash filled in, then rebuild the ZIP once more
  // so the manifest inside the archive matches (mirrors the local console's 3-pass approach).
  manifest = buildManifest();
  manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  files["manifest.json"] = manifestData;
  manifestArtifact.byteSize = manifestData.byteLength;
  manifestArtifact.sha256 = await sha256Hex(manifestData);

  const finalZipFiles = artifacts.filter((a) => a.kind !== "ZIP_ARCHIVE").map((a) => ({ filename: a.filename, data: files[a.filename] }));
  zipData = writeZip(finalZipFiles);
  zipArtifact.byteSize = zipData.byteLength;
  zipArtifact.sha256 = await sha256Hex(zipData);
  files[zipFilename] = zipData;

  build.artifacts = artifacts;
  build._files = files;
  build._zipFilename = zipFilename;
  return build;
}

function cleanupBuild(build) {
  for (const key of Object.keys(build)) {
    if (key.startsWith("_") && key !== "_files" && key !== "_zipFilename") delete build[key];
  }
}

/**
 * Run the full manuscript deliverables build pipeline for a project whose
 * source/setup/editorial state already exists in the given Durable Object state.
 *
 * @param {DurableObjectState} state
 * @param {string} projectId
 * @param {{ handleManuscriptSourceObjectRequest: Function, handleManuscriptProjectSetupObjectRequest?: Function, handleManuscriptEditorialObjectRequest?: Function }} handlers
 * @returns {Promise<{ build: object, files: Record<string, Uint8Array>, zipFilename: string }>}
 */
export async function runManuscriptDeliverablesBuild(state, projectId, handlers) {
  if (!projectId) throw Object.assign(new Error("A project id is required."), { status: 400, code: "project_id_required" });

  const projectSource = await resolveProjectSource(state, projectId, handlers);
  const project = { projectId, ...projectSource };

  const build = {
    id: `mb_${crypto.randomUUID()}`,
    projectId,
    status: "RUNNING",
    stages: createInitialStages(),
    artifacts: [],
    metadata: {},
    createdAt: now(),
    updatedAt: now(),
    errorMessage: null,
  };

  const stageImplementations = [
    { name: "INTAKE", fn: () => stageIntake(project, build) },
    { name: "SOURCE_VALIDATION", fn: () => stageSourceValidation(project, build) },
    { name: "MANUSCRIPT_EXTRACTION", fn: () => stageManuscriptExtraction(project, build) },
    { name: "METADATA_INFERENCE", fn: () => stageMetadataInference(project, build) },
    { name: "EDITORIAL_ANALYSIS", fn: () => stageEditorialAnalysis(project, build) },
    { name: "DELIVERABLE_GENERATION", fn: () => stageDeliverableGeneration(project, build) },
    { name: "PRODUCT_METADATA_GENERATION", fn: () => stageProductMetadataGeneration(project, build) },
    { name: "PACKAGE_ASSEMBLY", fn: () => stagePackageAssembly(project, build) },
    {
      name: "REVIEW",
      fn: () => {
        build._qaReport = build.artifacts.find((a) => a.kind === "QA_REPORT");
        return build;
      },
    },
    {
      name: "SHOPIFY_STAGING_HANDOFF",
      fn: () => {
        build.metadata.shopifyReady = true;
        build.metadata.liveShopifyMutationAuthorized = false;
        return build;
      },
    },
  ];

  for (const stage of stageImplementations) {
    const stageRecord = build.stages.find((s) => s.name === stage.name);
    stageRecord.status = "RUNNING";
    stageRecord.startedAt = now();
    build.updatedAt = now();

    try {
      await stage.fn();
      stageRecord.status = "SUCCEEDED";
      stageRecord.completedAt = now();
      build.updatedAt = now();
    } catch (error) {
      stageRecord.status = "FAILED";
      stageRecord.completedAt = now();
      stageRecord.errorMessage = error instanceof Error ? error.message : String(error);
      build.status = "FAILED";
      build.errorMessage = `Stage ${stage.name} failed: ${stageRecord.errorMessage}`;
      build.updatedAt = now();
      cleanupBuild(build);
      const failure = new Error(build.errorMessage);
      failure.status = error?.status || 422;
      failure.code = error?.code || "manuscript_build_stage_failed";
      failure.build = build;
      throw failure;
    }
  }

  build.status = "COMPLETED";
  build.updatedAt = now();
  const files = build._files;
  const zipFilename = build._zipFilename;
  cleanupBuild(build);
  delete build._files;
  delete build._zipFilename;

  await state.storage.put(`${BUILD_KEY_PREFIX}${projectId}`, build);
  await state.storage.put(`${BUILD_KEY_PREFIX}${projectId}:zip`, files[zipFilename]);

  return { build, files, zipFilename };
}

/**
 * Fetch the most recently persisted build record for a project (without re-running the pipeline).
 */
export async function getStoredManuscriptDeliverablesBuild(state, projectId) {
  return state.storage.get(`${BUILD_KEY_PREFIX}${projectId}`);
}

/**
 * Fetch the most recently persisted ZIP bytes for a project (without re-running the pipeline).
 */
export async function getStoredManuscriptDeliverablesZip(state, projectId) {
  return state.storage.get(`${BUILD_KEY_PREFIX}${projectId}:zip`);
}

/**
 * Validate that a build has all required artifact kinds.
 */
export function validateBuildArtifacts(build) {
  const present = new Set((build.artifacts || []).map((a) => a.kind));
  const missing = REQUIRED_ARTIFACT_KINDS.filter((kind) => !present.has(kind));
  return { ok: missing.length === 0, missing };
}
