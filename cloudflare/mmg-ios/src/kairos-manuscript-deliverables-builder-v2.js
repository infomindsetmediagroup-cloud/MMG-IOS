import {
  runManuscriptDeliverablesBuild as runV1,
  getStoredManuscriptDeliverablesBuild,
  getStoredManuscriptDeliverablesZip,
  validateBuildArtifacts,
} from "./kairos-manuscript-deliverables-builder-v1.js";

export const KAIROS_MANUSCRIPT_DELIVERABLES_BUILDER_BUILD =
  "kairos-manuscript-deliverables-builder-20260804-2-canonical-binary-assets";

const BUILD_KEY_PREFIX = "manuscript-deliverables-build:";

export { getStoredManuscriptDeliverablesBuild, getStoredManuscriptDeliverablesZip, validateBuildArtifacts };

export async function runManuscriptDeliverablesBuild(state, projectId, handlers) {
  const result = await runV1(state, projectId, handlers);
  const build = result.build;
  const files = { ...result.files };

  const source = await readBinary(
    handlers?.handleManuscriptSourceObjectRequest,
    state,
    `https://kairos.internal/registry/manuscripts/${projectId}/source/download`,
  );
  if (!source) throw fail(502, "original_source_unavailable", "The uploaded manuscript source file could not be included in the package.");

  const setup = await readJson(
    handlers?.handleManuscriptProjectSetupObjectRequest,
    state,
    `https://kairos.internal/registry/manuscripts/${projectId}/setup`,
  );
  const coverMeta = setup?.setup?.cover || null;
  const cover = coverMeta
    ? await readBinary(
        handlers?.handleManuscriptProjectSetupObjectRequest,
        state,
        `https://kairos.internal/registry/manuscripts/${projectId}/setup/cover`,
      )
    : null;
  if (coverMeta && !cover) throw fail(502, "uploaded_cover_unavailable", "The uploaded cover image could not be included in the package.");

  replaceArtifact(build, files, "ORIGINAL_SOURCE", {
    filename: filenameFrom(source.headers, build, "original-manuscript-source"),
    mimeType: source.contentType,
    data: source.bytes,
    role: "Customer-uploaded original manuscript source",
  });

  if (cover) {
    const coverFilename = filenameFrom(cover.headers, build, "customer-uploaded-cover");
    replaceArtifact(build, files, "COVER_SOURCE", {
      filename: coverFilename,
      mimeType: cover.contentType,
      data: cover.bytes,
      role: "Customer-uploaded cover source",
    });
    replaceArtifact(build, files, "STOREFRONT_PRODUCT_IMAGE", {
      filename: `storefront-${coverFilename}`,
      mimeType: cover.contentType,
      data: cover.bytes,
      role: "Customer-uploaded storefront image",
    });
  }

  const manifest = buildManifest(build, projectId);
  replaceArtifact(build, files, "PACKAGE_MANIFEST", {
    filename: "manifest.json",
    mimeType: "application/json",
    data: encode(JSON.stringify(manifest, null, 2)),
    role: "Canonical package manifest",
  });

  const zipArtifact = build.artifacts.find((artifact) => artifact.kind === "ZIP_ARCHIVE");
  const zipFilename = zipArtifact?.filename || result.zipFilename || `deliverables-${projectId}.zip`;
  const zipFiles = build.artifacts
    .filter((artifact) => artifact.kind !== "ZIP_ARCHIVE")
    .map((artifact) => ({ filename: artifact.filename, data: files[artifact.filename] }))
    .filter((file) => file.data instanceof Uint8Array);
  const zipBytes = writeZip(zipFiles);

  if (zipArtifact) {
    zipArtifact.byteSize = zipBytes.byteLength;
    zipArtifact.sha256 = await sha256Hex(zipBytes);
    zipArtifact.storageKey = `${projectId}/${zipFilename}`;
    zipArtifact.role = "Complete canonical customer delivery package";
  }
  files[zipFilename] = zipBytes;

  build.metadata = {
    ...(build.metadata || {}),
    packageContract: "canonical-12-artifact-manuscript-package-v1",
    originalSourceIncluded: true,
    uploadedCoverIncluded: Boolean(cover),
    packageContentsVerified: validateBuildArtifacts(build).ok,
  };
  build.updatedAt = new Date().toISOString();

  await state.storage.put(`${BUILD_KEY_PREFIX}${projectId}`, build);
  await state.storage.put(`${BUILD_KEY_PREFIX}${projectId}:zip`, zipBytes);
  return { build, files, zipFilename };
}

async function replaceArtifact(build, files, kind, input) {
  const artifact = build.artifacts.find((item) => item.kind === kind);
  if (!artifact) throw fail(500, "package_contract_missing_artifact", `The package contract is missing ${kind}.`);
  if (artifact.filename && artifact.filename !== input.filename) delete files[artifact.filename];
  files[input.filename] = input.data;
  artifact.filename = input.filename;
  artifact.mimeType = input.mimeType || "application/octet-stream";
  artifact.byteSize = input.data.byteLength;
  artifact.sha256 = await sha256Hex(input.data);
  artifact.storageKey = `${build.projectId}/${input.filename}`;
  artifact.role = input.role;
}

function buildManifest(build, projectId) {
  return {
    schemaVersion: "1.1.0",
    packageContract: "canonical-12-artifact-manuscript-package-v1",
    projectId,
    generatedAt: new Date().toISOString(),
    originalSourceIncluded: true,
    uploadedCoverIncluded: Boolean(build.artifacts.find((a) => a.kind === "COVER_SOURCE" && !a.filename.endsWith(".svg"))),
    artifacts: build.artifacts.map(({ id, kind, filename, mimeType, byteSize, sha256, storageKey, createdAt, role }) => ({
      id, kind, filename, mimeType, byteSize, sha256, storageKey, createdAt, role: role || null,
    })),
    qaPassed: build.metadata?.editorialIssues?.every?.((issue) => issue.severity !== "blocking") ?? true,
    rightsDeclarationComplete: true,
    liveShopifyMutationAuthorized: false,
  };
}

async function readBinary(handler, state, url) {
  if (typeof handler !== "function") return null;
  const response = await handler(state, new Request(url, { method: "GET" }));
  if (!response?.ok) return null;
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("Content-Type") || "application/octet-stream",
    headers: response.headers,
  };
}

async function readJson(handler, state, url) {
  if (typeof handler !== "function") return null;
  const response = await handler(state, new Request(url, { method: "GET" }));
  if (!response?.ok) return null;
  try { return await response.json(); } catch { return null; }
}

function filenameFrom(headers, build, fallback) {
  const disposition = headers?.get?.("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const name = match?.[1] || build?.metadata?.filename || fallback;
  return String(name).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || fallback;
}

function encode(value) { return new TextEncoder().encode(value); }

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encode(file.filename);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(8, 0, true);
    view.setUint32(14, crc, true); view.setUint32(18, file.data.length, true); view.setUint32(22, file.data.length, true);
    view.setUint16(26, name.length, true); local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true);
    cdv.setUint32(16, crc, true); cdv.setUint32(20, file.data.length, true); cdv.setUint32(24, file.data.length, true);
    cdv.setUint16(28, name.length, true); cdv.setUint32(42, offset, true); cd.set(name, 46);
    locals.push({ header: local, data: file.data }); central.push(cd); offset += local.length + file.data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(offset + centralSize + 22);
  let position = 0;
  for (const item of locals) { out.set(item.header, position); position += item.header.length; out.set(item.data, position); position += item.data.length; }
  for (const item of central) { out.set(item, position); position += item.length; }
  const end = new DataView(out.buffer, position, 22);
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return out;
}

function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
