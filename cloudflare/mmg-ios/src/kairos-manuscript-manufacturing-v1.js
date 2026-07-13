import { strToU8, zipSync } from "fflate";
import { buildArtifact, artifactContentType } from "./kairos-native-publishing-artifacts-v1.js";
import { buildCreationArtifact } from "./kairos-creation-artifacts-v1.js";

const BUILD = "kairos-manuscript-manufacturing-20260713-1";
const CHUNK_BYTES = 128 * 1024;
const CONFIRMATION = "MANUFACTURE APPROVED PACKAGE";
const ROLLBACK_CONFIRMATION = "ROLL BACK MANUFACTURING PACKAGE";

export async function handleManuscriptManufacturingObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/manufacturing(?:\/(prepare|execute|rollback|artifacts))?(?:\/([a-z0-9._-]+))?$/i);
  if (!match) return null;
  const projectId = match[1];
  const action = match[2] || "status";
  const artifactName = match[3] || null;
  try {
    if (action === "status" && request.method === "GET") return readStatus(state, projectId);
    if (action === "prepare" && request.method === "POST") return prepare(state, request, projectId);
    if (action === "execute" && request.method === "POST") return execute(state, request, projectId);
    if (action === "rollback" && request.method === "POST") return rollback(state, request, projectId);
    if (action === "artifacts" && artifactName && request.method === "GET") return downloadArtifact(state, projectId, artifactName);
    return json({ status: "not-found", error: { code: "manufacturing_route_not_found", message: "Manufacturing route not found." } }, 404);
  } catch (error) {
    return json({ status: "failed", build: BUILD, error: { code: error?.code || "manufacturing_failed", message: error instanceof Error ? error.message : "Manufacturing failed." } }, Number(error?.status || 500));
  }
}

async function readStatus(state, projectId) {
  await requireProject(state, projectId);
  const record = await state.storage.get(recordKey(projectId));
  return json({ status: record?.status || "not-prepared", build: BUILD, manufacturing: record ? publicRecord(record) : null });
}

async function prepare(state, request, projectId) {
  const project = await requireProject(state, projectId);
  const setup = await state.storage.get(setupKey(projectId));
  const editorial = await state.storage.get(editorialKey(projectId));
  const cover = await state.storage.get(coverMetadataKey(projectId));
  if (!setup) throw fail(409, "project_setup_required", "Complete manuscript project setup before manufacturing.");
  if (!cover) throw fail(409, "customer_cover_required", "A customer-supplied cover is required before manufacturing.");
  if (editorial?.status !== "ready-for-manufacturing" || !editorial.finalVersionId) throw fail(409, "editorial_handoff_required", "Complete editorial approval and manufacturing handoff first.");
  const version = (editorial.versions || []).find(item => item.versionId === editorial.finalVersionId);
  if (!version) throw fail(409, "final_editorial_version_missing", "The approved final editorial version could not be resolved.");
  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  const record = {
    projectId,
    releaseId: `mfg-${crypto.randomUUID()}`,
    status: "awaiting-manufacturing-approval",
    title: setup.publicationTitle || project.title,
    author: setup.authorName,
    edition: setup.edition,
    trimSize: setup.trimSize,
    isbnStatus: setup.isbnStatus,
    finalVersionId: version.versionId,
    finalVersionChecksum: version.checksum,
    cover: publicCover(cover),
    requestedBy: String(body?.actor || "Executive").slice(0, 180),
    confirmationRequired: CONFIRMATION,
    rollbackConfirmation: ROLLBACK_CONFIRMATION,
    proposedArtifacts: artifactNames(cover.contentType),
    createdAt: now,
    updatedAt: now,
    build: BUILD,
    artifacts: [],
    verification: null,
    externalInferenceAPI: false,
  };
  await state.storage.put(recordKey(projectId), record);
  await updateRegistry(state, projectId, { status: "awaiting-manufacturing-approval", stage: "manufacturing-approval", progress: 92, summary: "The final manufacturing package is ready for executive authorization.", nextAction: `Type ${CONFIRMATION} to build the approved files.`, checkpoint: { id: record.releaseId, label: "Manufacturing package prepared", status: "completed", recordedAt: now } });
  return json({ status: record.status, build: BUILD, manufacturing: publicRecord(record) }, 201);
}

async function execute(state, request, projectId) {
  const project = await requireProject(state, projectId);
  const body = await request.json();
  const confirmation = String(body?.confirmation || "").trim();
  if (confirmation !== CONFIRMATION) throw fail(403, "manufacturing_confirmation_required", `Type ${CONFIRMATION} to authorize manufacturing.`);
  const record = await state.storage.get(recordKey(projectId));
  if (!record || record.status !== "awaiting-manufacturing-approval") throw fail(409, "manufacturing_state_invalid", "Prepare the manufacturing package before execution.");
  const [setup, editorial, coverMetadata] = await Promise.all([
    state.storage.get(setupKey(projectId)),
    state.storage.get(editorialKey(projectId)),
    state.storage.get(coverMetadataKey(projectId)),
  ]);
  if (editorial?.finalVersionId !== record.finalVersionId || editorial?.status !== "ready-for-manufacturing") throw fail(409, "editorial_state_changed", "The approved editorial state changed after manufacturing preparation.");
  const version = (editorial.versions || []).find(item => item.versionId === record.finalVersionId);
  if (!version || version.checksum !== record.finalVersionChecksum) throw fail(409, "final_version_changed", "The final editorial version changed after manufacturing preparation.");
  const manuscript = await loadVersionText(state, projectId, version);
  const cover = await loadCover(state, projectId, coverMetadata);
  const publication = buildPublication(projectId, setup, manuscript, version);
  const files = {};
  files["gold-master.docx"] = await buildArtifact("gold-master.docx", publication);
  files["digital-asset.pdf"] = await buildArtifact("digital-asset.pdf", publication, { coverBytes: cover.bytes, coverMime: cover.type });
  files["kdp-interior.pdf"] = await buildArtifact("kdp-interior.pdf", publication);
  files["kdp-full-wrap-cover.pdf"] = await buildArtifact("kdp-full-wrap-cover.pdf", publication, { coverBytes: cover.bytes, coverMime: cover.type });
  files["ebook.epub"] = await buildCreationArtifact("ebook.epub", publication, {}, cover);
  files[approvedCoverName(cover.type)] = cover.bytes;

  const generatedAt = new Date().toISOString();
  const artifactMetadata = [];
  for (const [name, bytes] of Object.entries(files)) artifactMetadata.push(await storeArtifact(state, projectId, name, bytes, contentType(name)));
  const manifest = {
    version: BUILD,
    releaseId: record.releaseId,
    projectId,
    title: publication.title,
    author: publication.author,
    generatedAt,
    source: { finalVersionId: version.versionId, checksum: version.checksum, wordCount: version.wordCount },
    cover: { filename: approvedCoverName(cover.type), contentType: cover.type, source: "customer-supplied" },
    publishing: { edition: setup.edition, trimSize: setup.trimSize, isbnStatus: setup.isbnStatus },
    files: artifactMetadata.map(item => ({ name: item.name, bytes: item.bytes, sha256: item.sha256, contentType: item.contentType })),
    validations: ["final editorial version checksum matched", "customer cover loaded", "all deliverables generated", "all artifact hashes recorded"],
    externalInferenceAPI: false,
    platformValidationRequired: ["Amazon KDP final acceptance", "ISBN confirmation", "publisher account submission"],
  };
  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  files["manufacturing-manifest.json"] = manifestBytes;
  artifactMetadata.push(await storeArtifact(state, projectId, "manufacturing-manifest.json", manifestBytes, "application/json; charset=utf-8"));
  const readme = strToU8(`${publication.title}\n\nMMG Final Manufacturing Package\n\nThis package contains the approved Gold Master DOCX, digital PDF, KDP interior PDF, KDP full-wrap cover PDF, EPUB, customer-supplied cover, and manufacturing manifest.\n\nFinal ISBN confirmation and platform submission remain controlled publishing decisions. Amazon KDP performs final acceptance validation.\n`);
  files["README.txt"] = readme;
  artifactMetadata.push(await storeArtifact(state, projectId, "README.txt", readme, "text/plain; charset=utf-8"));
  const zipBytes = zipSync(files, { level: 6 });
  artifactMetadata.push(await storeArtifact(state, projectId, "final-manufacturing-package.zip", zipBytes, "application/zip"));

  const verification = {
    passed: artifactMetadata.every(item => item.bytes > 0 && /^[a-f0-9]{64}$/.test(item.sha256)),
    artifactCount: artifactMetadata.length,
    checkedAt: generatedAt,
    checks: artifactMetadata.map(item => ({ name: item.name, status: item.bytes > 0 ? "passed" : "failed", bytes: item.bytes, sha256: item.sha256 })),
  };
  if (!verification.passed) throw fail(502, "manufacturing_verification_failed", "One or more generated artifacts failed verification.");
  const completed = { ...record, status: "manufactured-and-verified", artifacts: artifactMetadata, verification, approvedBy: String(body?.actor || "Executive").slice(0, 180), approvedAt: generatedAt, updatedAt: generatedAt };
  await state.storage.put(recordKey(projectId), completed);
  await updateRegistry(state, projectId, { status: "manufactured-and-verified", stage: "delivery-package", progress: 100, summary: `${artifactMetadata.length} final manufacturing artifacts were generated and verified.`, nextAction: "Download the final package or begin controlled platform submission.", checkpoint: { id: "manufacturing-complete", label: "Final manufacturing and delivery package completed", status: "completed", recordedAt: generatedAt } });
  return json({ status: completed.status, build: BUILD, manufacturing: publicRecord(completed) });
}

async function rollback(state, request, projectId) {
  await requireProject(state, projectId);
  const body = await request.json();
  if (String(body?.confirmation || "").trim() !== ROLLBACK_CONFIRMATION) throw fail(403, "manufacturing_rollback_confirmation_required", `Type ${ROLLBACK_CONFIRMATION} to authorize rollback.`);
  const record = await state.storage.get(recordKey(projectId));
  if (!record?.artifacts?.length) throw fail(409, "manufacturing_package_missing", "No generated manufacturing package is available to roll back.");
  for (const artifact of record.artifacts) await deleteArtifact(state, projectId, artifact);
  const now = new Date().toISOString();
  const rolledBack = { ...record, status: "manufacturing-rolled-back", artifacts: [], verification: null, rolledBackBy: String(body?.actor || "Executive").slice(0, 180), rolledBackAt: now, updatedAt: now };
  await state.storage.put(recordKey(projectId), rolledBack);
  await updateRegistry(state, projectId, { status: "ready-for-manufacturing", stage: "manufacturing-handoff", progress: 90, summary: "The generated manufacturing package was rolled back; the approved editorial source remains intact.", nextAction: "Prepare a new manufacturing release when authorized.", checkpoint: { id: `manufacturing-rollback-${Date.now()}`, label: "Manufacturing package rolled back", status: "completed", recordedAt: now } });
  return json({ status: rolledBack.status, build: BUILD, manufacturing: publicRecord(rolledBack) });
}

async function downloadArtifact(state, projectId, name) {
  const record = await state.storage.get(recordKey(projectId));
  const artifact = record?.artifacts?.find(item => item.name === name);
  if (!artifact || record.status !== "manufactured-and-verified") throw fail(404, "manufacturing_artifact_not_found", "The requested manufacturing artifact is not available.");
  const bytes = await loadStoredArtifact(state, projectId, artifact);
  const hash = await sha256Bytes(bytes);
  if (hash !== artifact.sha256) throw fail(502, "manufacturing_artifact_integrity_failed", "The stored manufacturing artifact failed integrity verification.");
  return new Response(bytes, { status: 200, headers: { "Content-Type": artifact.contentType, "Content-Disposition": `attachment; filename="${artifact.name.replace(/[\"\r\n]/g, "")}"`, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Kairos-Manufacturing": BUILD } });
}

function buildPublication(projectId, setup, manuscript, version) {
  return {
    projectId,
    title: setup.publicationTitle || "Untitled Publication",
    subtitle: "",
    author: setup.authorName || "Mindset Media Group",
    engineVersion: BUILD,
    createdAt: new Date().toISOString(),
    wordCount: version.wordCount || countWords(manuscript),
    pageCount: Math.max(1, Math.ceil((version.wordCount || countWords(manuscript)) / 250)),
    chapters: splitChapters(manuscript),
    research: { evidenceStandard: "Customer-supplied manuscript; no research claims added during manufacturing.", synthesis: "", sources: [], diagnostics: [] },
  };
}

function splitChapters(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const chapters = [];
  let title = "Manuscript";
  let buffer = [];
  const flush = () => { const content = buffer.join("\n").trim(); if (content) chapters.push({ title, content }); buffer = []; };
  for (const line of lines) {
    const heading = line.match(/^\s*(?:#{1,3}\s+|(?:chapter|part)\s+(?:\d+|[ivxlcdm]+)\s*[:.-]?\s*)(.+)$/i);
    if (heading) { flush(); title = heading[1].trim() || `Chapter ${chapters.length + 1}`; }
    else buffer.push(line);
  }
  flush();
  if (chapters.length > 1) return chapters;
  const paragraphs = String(text || "").split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
  const generated = [];
  let chunk = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (length + paragraph.length > 9000 && chunk.length) { generated.push({ title: `Section ${generated.length + 1}`, content: chunk.join("\n\n") }); chunk = []; length = 0; }
    chunk.push(paragraph); length += paragraph.length;
  }
  if (chunk.length) generated.push({ title: generated.length ? `Section ${generated.length + 1}` : "Manuscript", content: chunk.join("\n\n") });
  return generated.length ? generated : [{ title: "Manuscript", content: String(text || "") }];
}

async function loadVersionText(state, projectId, version) {
  const bytes = await loadChunks(state, `manuscript:${projectId}:editorial:${version.versionId}:`, version.chunks, version.bytes);
  const text = new TextDecoder().decode(bytes);
  if (await sha256Text(text) !== version.checksum) throw fail(502, "final_version_integrity_failed", "The final editorial version failed checksum verification.");
  return text;
}

async function loadCover(state, projectId, metadata) {
  if (!metadata) throw fail(409, "customer_cover_required", "Customer cover is required.");
  const bytes = await loadChunks(state, `manuscript:${projectId}:cover:chunk:`, metadata.chunks, metadata.size);
  return { bytes, type: metadata.contentType, name: metadata.filename };
}

async function storeArtifact(state, projectId, name, input, type) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const prefix = artifactPrefix(projectId, name);
  const prior = await state.storage.get(`${prefix}metadata`);
  if (prior) for (let index = 0; index < prior.chunks; index += 1) await state.storage.delete(`${prefix}${index}`);
  const chunks = Math.ceil(bytes.length / CHUNK_BYTES);
  for (let index = 0; index < chunks; index += 1) await state.storage.put(`${prefix}${index}`, bytes.slice(index * CHUNK_BYTES, Math.min(bytes.length, (index + 1) * CHUNK_BYTES)));
  const metadata = { name, contentType: type, bytes: bytes.length, chunks, sha256: await sha256Bytes(bytes), downloadURL: `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/manufacturing/artifacts/${encodeURIComponent(name)}` };
  await state.storage.put(`${prefix}metadata`, metadata);
  return metadata;
}

async function loadStoredArtifact(state, projectId, artifact) { return loadChunks(state, artifactPrefix(projectId, artifact.name), artifact.chunks, artifact.bytes); }
async function deleteArtifact(state, projectId, artifact) { const prefix = artifactPrefix(projectId, artifact.name); for (let index = 0; index < Number(artifact.chunks || 0); index += 1) await state.storage.delete(`${prefix}${index}`); await state.storage.delete(`${prefix}metadata`); }
async function loadChunks(state, prefix, count, length) { const output = new Uint8Array(length); let offset = 0; for (let index = 0; index < Number(count || 0); index += 1) { const raw = await state.storage.get(`${prefix}${index}`); if (!raw) throw fail(502, "stored_chunk_missing", "A required stored data chunk is missing."); const chunk = raw instanceof Uint8Array ? raw : new Uint8Array(raw); output.set(chunk, offset); offset += chunk.length; } if (offset !== length) throw fail(502, "stored_length_mismatch", "Stored data failed length verification."); return output; }

async function requireProject(state, projectId) { const records = (await state.storage.get("production-registry")) || {}; const project = records[projectId]; if (!project || project.projectType !== "manuscript-studio") throw fail(404, "manuscript_project_not_found", "The manuscript production project was not found."); return project; }
async function updateRegistry(state, projectId, change) { const records = (await state.storage.get("production-registry")) || {}; const current = records[projectId]; if (!current) return; const list = Array.isArray(current.checkpoints) ? current.checkpoints.filter(item => item?.id !== change.checkpoint?.id) : []; records[projectId] = { ...current, status: change.status, stage: change.stage, progress: change.progress, summary: change.summary, nextAction: change.nextAction, checkpoints: change.checkpoint ? [...list.slice(-29), change.checkpoint] : list, updatedAt: new Date().toISOString(), revision: Number(current.revision || 0) + 1 }; await state.storage.put("production-registry", records); }

function artifactNames(coverType) { return ["gold-master.docx", "digital-asset.pdf", "kdp-interior.pdf", "kdp-full-wrap-cover.pdf", "ebook.epub", approvedCoverName(coverType), "manufacturing-manifest.json", "README.txt", "final-manufacturing-package.zip"]; }
function contentType(name) { if (name === "ebook.epub") return "application/epub+zip"; if (name.endsWith(".json")) return "application/json; charset=utf-8"; if (name.endsWith(".txt")) return "text/plain; charset=utf-8"; if (name.endsWith(".jpg")) return "image/jpeg"; return artifactContentType(name); }
function approvedCoverName(type) { return type === "image/jpeg" ? "approved-cover.jpg" : "approved-cover.png"; }
function publicCover(value) { const { chunks, ...rest } = value; return rest; }
function publicRecord(value) { return { ...value, artifacts: (value.artifacts || []).map(({ chunks, ...artifact }) => artifact) }; }
function recordKey(id) { return `manuscript:${id}:manufacturing`; }
function setupKey(id) { return `manuscript:${id}:setup`; }
function editorialKey(id) { return `manuscript:${id}:editorial`; }
function coverMetadataKey(id) { return `manuscript:${id}:cover:metadata`; }
function artifactPrefix(id, name) { return `manuscript:${id}:manufacturing:${name}:`; }
function countWords(value) { return (String(value || "").match(/\b[\w’'-]+\b/g) || []).length; }
async function sha256Text(value) { return sha256Bytes(new TextEncoder().encode(value)); }
async function sha256Bytes(bytes) { const digest = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Manufacturing": BUILD } }); }
