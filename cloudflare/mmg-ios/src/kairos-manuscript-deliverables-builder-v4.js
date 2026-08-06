import {
  buildCreationArtifact,
  creationArtifactContentType,
} from "./kairos-creation-artifacts-v1.js";
import {
  DIGITAL_ASSET_V2_LABEL,
  KAIROS_DIGITAL_ASSET_V2_BUILD,
  MINIMUM_FINISHED_PAGES,
  customerReleaseNames,
  normalizeDigitalAssetV2Publication,
} from "./kairos-digital-asset-edition-v2-contract-v1.js";

export const KAIROS_MANUSCRIPT_DELIVERABLES_BUILDER_BUILD =
  "kairos-manuscript-deliverables-builder-20260805-4-canonical-digital-asset-v2";

export const PACKAGE_CONTRACT = "mmg-digital-asset-edition-v2-customer-package-v1";

export const REQUIRED_DELIVERABLE_KINDS = Object.freeze([
  "CUSTOMER_SPEC_SHEET_PDF",
  "KDP_INTERIOR_PDF",
  "DIGITAL_EDITION_V2_PDF",
  "COVER_PORTRAIT_PNG",
  "COVER_THUMBNAIL_PNG",
  "README_TXT",
]);

const BUILD_KEY_PREFIX = "manuscript-deliverables-build:";
const GENERIC_RELEASE_FILES = Object.freeze([
  ["CUSTOMER_SPEC_SHEET_PDF", "customer-spec-sheet.pdf", "specSheet", "Customer-facing product specification"],
  ["KDP_INTERIOR_PDF", "kdp-interior-6x9.pdf", "kdpInterior", "KDP-ready 6 x 9 inch cover-free interior"],
  ["DIGITAL_EDITION_V2_PDF", "digital-asset-edition-v2.pdf", "digitalEdition", "Premium MMG Digital Asset Edition V2"],
  ["COVER_PORTRAIT_PNG", "cover-portrait-2048x3072.png", "portraitCover", "Approved portrait cover at 2048 x 3072"],
  ["COVER_THUMBNAIL_PNG", "cover-thumbnail-2048x2048.png", "thumbnailCover", "Square thumbnail preserving the complete portrait cover"],
  ["README_TXT", "README.txt", "readme", "Customer package manifest and usage instructions"],
]);

export async function runManuscriptDeliverablesBuild(state, projectId, handlers) {
  if (!projectId) throw fail(400, "project_id_required", "A manuscript project id is required.");

  const project = await resolveProject(state, projectId, handlers);
  if (!project.cover) {
    throw fail(409, "uploaded_cover_required", "The approved customer cover is required before the Digital Asset Edition V2 package can be manufactured.");
  }

  const title = project.setup?.publicationTitle || project.source?.title || "Untitled Digital Asset";
  const subtitle = project.setup?.subtitle || project.source?.subtitle || "";
  const manuscript = String(project.manuscript || "").trim();
  if (manuscript.length < 500) {
    throw fail(409, "approved_manuscript_required", "The checksum-verified approved manuscript is incomplete.");
  }

  const chapters = splitManuscript(manuscript);
  const wordCount = countWords(manuscript);
  const pageCount = Math.ceil(wordCount / 250);
  const publication = normalizeDigitalAssetV2Publication({
    projectId,
    title,
    subtitle,
    author: "Mindset Media Group™",
    publisher: "Mindset Media Group™",
    creator: "Mindset Media Group™",
    chapters,
    wordCount,
    pageCount,
    architecture: {
      title,
      subtitle,
      trimSize: "6 x 9 inches",
      interior: "Color ink on white paper",
      frontMatter: ["Title Page", "Copyright", "Contents"],
      backMatter: ["About the Publisher", "Thank You"],
      chapterPlan: chapters.map((chapter) => ({
        number: chapter.number,
        title: chapter.title,
        objective: "Deliver substantive customer-ready instruction and implementation value.",
      })),
    },
    research: {
      evidenceStandard: "Approved final editorial manuscript is the sole manufacturing authority.",
      synthesis: "Customer-facing Digital Asset Edition V2 package.",
      sources: [],
      diagnostics: [],
    },
    quality: {
      manuscriptAuthority: project.manuscriptAuthority || "checksum-verified-final-editorial-version",
      substantiveMinimumPages: MINIMUM_FINISHED_PAGES,
      noPaddingOrDuplication: true,
      approvedCoverRequired: true,
    },
  });

  const releaseNames = customerReleaseNames(publication);
  const cover = { bytes: project.cover.bytes, type: project.cover.contentType };
  const product = { title: publication.title, publisher: publication.publisher };
  const createdAt = new Date().toISOString();
  const packageFiles = [];

  for (const [kind, genericName, releaseNameKey, role] of GENERIC_RELEASE_FILES) {
    const data = toBytes(await buildCreationArtifact(genericName, publication, product, cover));
    packageFiles.push({
      kind,
      filename: releaseNames[releaseNameKey],
      mimeType: creationArtifactContentType(genericName),
      data,
      role,
    });
  }

  const zipBytes = toBytes(await buildCreationArtifact("complete-production-package.zip", publication, product, cover));
  const releaseStem = releaseNames.specSheet.replace(/_Customer-Spec-Sheet\.pdf$/i, "");
  const zipFilename = `${releaseStem}_Digital-Asset-Edition-V2_Customer-Package.zip`;
  validatePackageFiles(packageFiles, zipBytes, releaseNames);

  const artifacts = [];
  for (const item of packageFiles) artifacts.push(await artifact(projectId, createdAt, item));
  artifacts.push(await artifact(projectId, createdAt, {
    kind: "ZIP_ARCHIVE",
    filename: zipFilename,
    mimeType: "application/zip",
    data: zipBytes,
    role: "Canonical six-file MMG Digital Asset Edition V2 customer package",
  }));

  const build = {
    id: `mb_${crypto.randomUUID()}`,
    projectId,
    status: "COMPLETED",
    artifacts,
    metadata: {
      workingTitle: title,
      publisher: "Mindset Media Group™",
      service: project.setup?.service || "Digital Asset Production",
      packageContract: PACKAGE_CONTRACT,
      digitalAssetEdition: DIGITAL_ASSET_V2_LABEL,
      digitalAssetContractBuild: KAIROS_DIGITAL_ASSET_V2_BUILD,
      packageFileCount: 6,
      packageContentsVerified: true,
      customerFacingOnly: true,
      wordCount,
      pageCount,
      minimumFinishedPages: MINIMUM_FINISHED_PAGES,
      substantiveMinimumMet: pageCount >= MINIMUM_FINISHED_PAGES,
      chapterCount: chapters.length,
      approvedCoverIncluded: true,
      portraitCoverDimensions: "2048x3072",
      thumbnailCoverDimensions: "2048x2048",
      kdpTrimSize: "6x9",
      digitalEditionFormat: "US Letter",
      sourceFilename: project.source?.filename || null,
      manuscriptAuthority: project.manuscriptAuthority || "stored-intake-source",
      sourceCoverChecksum: await sha256Hex(project.cover.bytes),
      forbiddenCustomerFilesExcluded: true,
      canvaExcluded: true,
      liveShopifyMutationAuthorized: false,
    },
    createdAt,
    updatedAt: createdAt,
    errorMessage: null,
  };

  await state.storage.put(`${BUILD_KEY_PREFIX}${projectId}`, build);
  await state.storage.put(`${BUILD_KEY_PREFIX}${projectId}:zip`, zipBytes);
  return {
    build,
    files: Object.fromEntries(packageFiles.map((item) => [item.filename, item.data])),
    zipFilename,
  };
}

export async function getStoredManuscriptDeliverablesBuild(state, projectId) {
  return state.storage.get(`${BUILD_KEY_PREFIX}${projectId}`);
}

export async function getStoredManuscriptDeliverablesZip(state, projectId) {
  return state.storage.get(`${BUILD_KEY_PREFIX}${projectId}:zip`);
}

export function validateBuildArtifacts(build) {
  const present = new Set((build?.artifacts || []).map((item) => item.kind));
  const missing = REQUIRED_DELIVERABLE_KINDS.filter((kind) => !present.has(kind));
  if (!present.has("ZIP_ARCHIVE")) missing.push("ZIP_ARCHIVE");
  return { ok: missing.length === 0, missing };
}

async function resolveProject(state, projectId, handlers) {
  const sourceHandler = handlers?.handleManuscriptSourceObjectRequest;
  const setupHandler = handlers?.handleManuscriptProjectSetupObjectRequest;
  if (typeof sourceHandler !== "function" || typeof setupHandler !== "function") {
    throw fail(500, "deliverable_handlers_unavailable", "The manuscript source and setup handlers are required.");
  }

  const metadataResponse = await sourceHandler(state, new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`));
  const metadataBody = await readJson(metadataResponse);
  if (!metadataResponse?.ok || !metadataBody?.source) {
    throw fail(404, "manuscript_source_required", "The saved manuscript source was not found.");
  }

  const textResponse = await sourceHandler(state, new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source/text`));
  const textBody = await readJson(textResponse);
  if (!textResponse?.ok) {
    throw fail(textResponse?.status || 502, "final_manuscript_unavailable", textBody?.error?.message || "The approved final manuscript could not be loaded.");
  }

  const setupResponse = await setupHandler(state, new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`));
  const setupBody = await readJson(setupResponse);
  if (!setupResponse?.ok || !setupBody?.setup) {
    throw fail(409, "manuscript_setup_required", "Project setup must be completed before final manufacturing.");
  }

  const coverResponse = await setupHandler(state, new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup/cover`));
  const cover = coverResponse?.ok
    ? {
        bytes: new Uint8Array(await coverResponse.arrayBuffer()),
        contentType: normalizeCoverMime(coverResponse.headers.get("Content-Type")),
        filename: dispositionFilename(coverResponse.headers.get("Content-Disposition")) || setupBody.setup.cover?.filename || "approved-cover.png",
      }
    : null;

  return {
    source: metadataBody.source,
    setup: setupBody.setup,
    manuscript: String(textBody?.manuscript || ""),
    manuscriptAuthority: textBody?.manuscriptAuthority || null,
    cover,
  };
}

function splitManuscript(manuscript) {
  const lines = String(manuscript || "").replace(/\r\n?/g, "\n").split("\n");
  const chapters = [];
  let title = "Introduction";
  let body = [];
  const headingPattern = /^(?:#{1,3}\s*)?(?:(?:part|chapter|section)\s+(?:\d+|[ivxlcdm]+)\b[^\n]*|introduction|conclusion|final conclusion|about the (?:author|publisher)|thank you)$/i;

  const push = () => {
    const content = body.join("\n").trim();
    if (content) chapters.push({ number: chapters.length + 1, title: cleanHeading(title), content });
    body = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line && headingPattern.test(line)) {
      push();
      title = line.replace(/^#{1,3}\s*/, "");
    } else {
      body.push(rawLine);
    }
  }
  push();
  return chapters;
}

function validatePackageFiles(packageFiles, zipBytes, names) {
  if (packageFiles.length !== 6) throw fail(500, "digital_asset_v2_package_count_invalid", "The customer package must contain exactly six files.");
  const actual = packageFiles.map((item) => item.filename);
  const expected = [names.specSheet, names.kdpInterior, names.digitalEdition, names.portraitCover, names.thumbnailCover, names.readme];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw fail(500, "digital_asset_v2_package_names_invalid", "The customer package filenames do not match the canonical title-specific contract.");
  }
  const entries = zipEntryNames(zipBytes);
  if (entries.length !== 6 || JSON.stringify(entries) !== JSON.stringify(expected)) {
    throw fail(500, "digital_asset_v2_zip_invalid", "The customer ZIP does not contain exactly the six canonical title-specific files.");
  }
  const forbidden = /\.docx$|\.md$|\.html?$|\.json$|source|internal|qa[-_ ]?report/i;
  if (entries.some((name) => forbidden.test(name))) {
    throw fail(500, "digital_asset_v2_forbidden_file", "The customer ZIP contains a prohibited internal or source file.");
  }
}

function zipEntryNames(bytes) {
  const names = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const compressedSize = view.getUint32(18, true);
    const filenameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const filenameStart = offset + 30;
    const dataStart = filenameStart + filenameLength + extraLength;
    names.push(new TextDecoder().decode(bytes.slice(filenameStart, filenameStart + filenameLength)));
    offset = dataStart + compressedSize;
  }
  return names;
}

async function artifact(projectId, createdAt, item) {
  return {
    id: `art_${crypto.randomUUID()}`,
    projectId,
    kind: item.kind,
    filename: item.filename,
    mimeType: item.mimeType,
    byteSize: item.data.byteLength,
    sha256: await sha256Hex(item.data),
    role: item.role,
    createdAt,
  };
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new TextEncoder().encode(String(value || ""));
}

function cleanHeading(value) {
  return String(value || "Section").replace(/\s+/g, " ").trim().slice(0, 240);
}

function countWords(value) {
  return (String(value || "").match(/\b[\w’'-]+\b/g) || []).length;
}

function normalizeCoverMime(value) {
  const mime = String(value || "image/png").split(";", 1)[0].trim().toLowerCase();
  return mime === "image/jpeg" || mime === "image/jpg" ? "image/jpeg" : "image/png";
}

function dispositionFilename(value) {
  const match = String(value || "").match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/"$/, "").trim()) : "";
}

async function readJson(response) {
  try { return await response.clone().json(); }
  catch { return {}; }
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
