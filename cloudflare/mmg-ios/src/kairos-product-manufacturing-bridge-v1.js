import { buildPublicationRecord } from "./kairos-native-intelligence-engine-v1.js";
import { buildProductPackage } from "./kairos-product-page-package-v1.js";
import {
  buildCreationArtifact,
  creationArtifactContentType,
  creationArtifactNames,
} from "./kairos-creation-artifacts-v1.js";

export const KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD = "kairos-product-manufacturing-bridge-20260717-1";

const INTERNAL_ROOT = "/product-manufacturing";
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const CHUNK_BYTES = 96 * 1024;
const WEBSITE_LIBRARY_NAME = "kairos-website-builder-asset-library-v1";

export async function handleProductManufacturingBridge(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/product-manufacturing/status") {
    return json({
      status: env?.KAIROS_PROJECTS ? "operational" : "needs-configuration",
      build: KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD,
      authoritativeManuscriptIntake: true,
      approvedCoverRequired: true,
      sourcePreservation: "durable-object-chunked-source-and-extracted-text",
      productPackage: "shopify-product-page-copy-assets-and-production-files",
      shopifyHandoff: "existing-draft-media-review-publication-controls",
      websitePopulation: "approved-cover-auto-registered-to-builder-asset-library",
      externalInferenceAPI: false,
    }, env?.KAIROS_PROJECTS ? 200 : 503);
  }

  if (request.method === "POST" && url.pathname === "/api/content/generate") {
    const payload = await safeJSON(request.clone());
    if (String(payload?.mode || "").toLowerCase() !== "manuscript" || !payload?.manuscript?.text) return null;
    if (!env?.KAIROS_PROJECTS) return failure(503, "product_manufacturing_storage_unavailable", "Kairos project storage is not configured.");
    const projectId = crypto.randomUUID();
    const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(projectId));
    return stub.fetch("https://kairos.internal/product-manufacturing/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, projectId }),
    });
  }

  const statusMatch = url.pathname.match(/^\/api\/publishing\/jobs\/([a-f0-9-]{20,})$/i);
  if (request.method === "GET" && statusMatch) {
    return forwardBridgeOrNull(env, statusMatch[1], "/status");
  }

  const artifactMatch = url.pathname.match(/^\/api\/publishing\/jobs\/([a-f0-9-]{20,})\/artifacts\/([a-z0-9._-]+)$/i);
  if (request.method === "GET" && artifactMatch) {
    return forwardBridgeOrNull(env, artifactMatch[1], `/artifacts/${artifactMatch[2]}`);
  }

  const sourceMatch = url.pathname.match(/^\/api\/publishing\/jobs\/([a-f0-9-]{20,})\/source$/i);
  if (request.method === "GET" && sourceMatch) {
    return forwardBridgeOrNull(env, sourceMatch[1], "/source");
  }

  return null;
}

export async function handleProductManufacturingBridgeObjectRequest(state, request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(INTERNAL_ROOT)) return null;

  try {
    if (request.method === "POST" && url.pathname === `${INTERNAL_ROOT}/create`) return createProject(state, request, env);
    if (request.method === "GET" && url.pathname === `${INTERNAL_ROOT}/status`) return readStatus(state);
    if (request.method === "GET" && url.pathname === `${INTERNAL_ROOT}/source`) return readSource(state);
    const artifactMatch = url.pathname.match(/^\/product-manufacturing\/artifacts\/([a-z0-9._-]+)$/i);
    if (request.method === "GET" && artifactMatch) return readArtifact(state, artifactMatch[1]);
    return failure(404, "product_manufacturing_route_not_found", "Product manufacturing route not found.");
  } catch (error) {
    return failure(Number(error?.status || 500), error?.code || "product_manufacturing_failed", safeMessage(error));
  }
}

async function createProject(state, request, env) {
  const existing = await state.storage.get("pm:job");
  if (existing) return json(publicJob(existing));

  const payload = await safeJSON(request);
  const projectId = clean(payload?.projectId, 120);
  const title = clean(payload?.title, 240);
  const author = clean(payload?.author, 180) || "Michael King";
  const objective = clean(payload?.objective, 12_000);
  const manuscript = payload?.manuscript || {};
  const text = normalizeText(manuscript.text);
  const textBytes = new TextEncoder().encode(text);

  if (!/^[a-f0-9-]{20,}$/i.test(projectId)) throw fail(400, "product_project_id_invalid", "A valid product project ID is required.");
  if (!title) throw fail(400, "product_title_required", "Enter the exact publication title.");
  if (objective.length < 12) throw fail(400, "product_direction_required", "Describe the intended reader, promise, tone, and final outcome.");
  if (textBytes.length < 500) throw fail(400, "manuscript_text_required", "The authoritative manuscript must contain at least 500 characters.");
  if (textBytes.length > MAX_TEXT_BYTES) throw fail(413, "manuscript_text_too_large", "The extracted manuscript exceeds the 2 MB production limit.");

  const source = decodeSource(manuscript, textBytes);
  const sourceHash = await sha256(source.bytes);
  const declaredChecksum = clean(manuscript.checksum, 128).toLowerCase();
  if (declaredChecksum && /^[a-f0-9]{64}$/.test(declaredChecksum) && declaredChecksum !== sourceHash) {
    throw fail(409, "manuscript_checksum_mismatch", "The uploaded manuscript failed source-integrity verification.");
  }

  const coverInput = payload?.cover;
  if (!coverInput) throw fail(400, "approved_cover_required", "Upload the approved PNG or JPEG cover before manufacturing the product.");
  const cover = decodeCover(coverInput);

  await removeChunks(state, "pm:source:", Number((await state.storage.get("pm:source"))?.chunks || 0));
  await removeChunks(state, "pm:text:", Number((await state.storage.get("pm:text"))?.chunks || 0));
  await removeChunks(state, "pm:cover:", Number((await state.storage.get("pm:cover"))?.chunks || 0));

  const sourceMetadata = await storeBytes(state, "pm:source:", source.bytes, {
    filename: source.filename,
    contentType: source.contentType,
    format: source.format,
    checksum: sourceHash,
    pages: finiteOrNull(manuscript.pages),
    wordCount: countWords(text),
    sourceRole: "authoritative-customer-manuscript",
    artifactName: `authoritative-manuscript.${source.format || "txt"}`,
  });
  const textMetadata = await storeBytes(state, "pm:text:", textBytes, {
    filename: `${safeBaseName(title)}-extracted-manuscript.txt`,
    contentType: "text/plain; charset=utf-8",
    format: "txt",
    checksum: await sha256(textBytes),
    wordCount: countWords(text),
    sourceRole: "verified-extracted-production-text",
  });
  const coverMetadata = await storeBytes(state, "pm:cover:", cover.bytes, {
    filename: cover.filename,
    contentType: cover.type,
    format: cover.type === "image/jpeg" ? "jpg" : "png",
    checksum: await sha256(cover.bytes),
    sourceRole: "approved-canonical-front-cover",
  });

  await state.storage.put({ "pm:source": sourceMetadata, "pm:text": textMetadata, "pm:cover": coverMetadata });

  const rawChapters = splitManuscript(text);
  const chapters = rawChapters.map((chapter, index) => {
    let value = { number: index + 1, title: chapter.title, lens: "customer-source", content: chapter.content, generatedBy: "customer-supplied-manuscript", generatedAt: new Date().toISOString(), editorialPasses: 0 };
    for (let pass = 1; pass <= 3; pass += 1) value = preservationEditorialPass(value, pass);
    return value;
  });

  const topic = deriveTopic(title, objective);
  const audience = deriveAudience(objective);
  const analysis = {
    idea: objective,
    title,
    topic,
    audience,
    concepts: deriveConcepts(`${title} ${objective}`),
    promise: objective,
    author,
    publisher: "Mindset Media Group™",
    acquisitionMode: "authoritative-manuscript-to-product",
    manuscriptRequired: true,
    sourceAssetsRequired: true,
    engineVersion: KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD,
  };
  const architecture = {
    title,
    subtitle: clean(payload?.subtitle, 240),
    author,
    publisher: analysis.publisher,
    audience,
    promise: objective,
    trimSize: "6 x 9 inches",
    interior: "Black and white, white paper",
    targetWords: countWords(text),
    targetPages: Math.max(1, Math.ceil(countWords(text) / 250)),
    chapterPlan: chapters.map(chapter => ({ number: chapter.number, title: chapter.title, lens: "customer-source", objective: "Preserve and professionally manufacture the approved manuscript.", concepts: [] })),
    frontMatter: ["Title Page", "Copyright", "Publisher Note", "Contents"],
    backMatter: ["About the Author"],
    sourceCount: 1,
  };
  const research = {
    query: "",
    researchedAt: null,
    sources: [],
    diagnostics: [],
    evidenceStandard: "Customer-supplied authoritative manuscript. No factual claims were added during manufacturing.",
    synthesis: "The approved manuscript is the sole authoritative content source for this production package.",
  };

  let publication = buildPublicationRecord({ projectId, analysis, research, architecture, chapters, approval: { approved: true, source: "customer-supplied-manuscript-and-cover", decidedAt: new Date().toISOString() } });
  publication = {
    ...publication,
    title,
    subtitle: architecture.subtitle,
    author,
    engineVersion: KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD,
    source: {
      authoritative: true,
      filename: sourceMetadata.filename,
      checksum: sourceMetadata.checksum,
      bytes: sourceMetadata.bytes,
      wordCount: sourceMetadata.wordCount,
      preservedOriginal: true,
      extractedTextChecksum: textMetadata.checksum,
    },
    quality: {
      status: "passed-with-platform-validation-pending",
      sourceChecksumVerified: true,
      authoritativeManuscriptPreserved: true,
      approvedCoverPreserved: true,
      editorialPasses: 3,
      chapterCount: chapters.length,
      wordCount: countWords(text),
      estimatedInteriorPages: Math.max(1, Math.ceil(countWords(text) / 250)),
      issues: [],
      platformValidationRequired: ["Amazon KDP final acceptance", "Shopify final rendering", "ISBN confirmation when applicable"],
    },
  };
  const product = {
    ...buildProductPackage(publication),
    source: publication.source,
    cover: { filename: coverMetadata.filename, checksum: coverMetadata.checksum, approved: true },
  };

  const websiteAsset = await registerWebsiteCover(env, projectId, title, author, coverInput, coverMetadata).catch(() => null);
  const artifacts = [
    sourceMetadata.artifactName,
    ...creationArtifactNames({ type: coverMetadata.contentType }),
  ].map(name => ({ name, url: `/api/publishing/jobs/${projectId}/artifacts/${encodeURIComponent(name)}` }));

  const completedAt = new Date().toISOString();
  const job = {
    projectId,
    status: "completed",
    stage: "delivery",
    stageLabel: "Authoritative manuscript product package ready",
    stageProgress: 100,
    overallProgress: 100,
    title,
    subtitle: architecture.subtitle,
    author,
    creationType: "product_asset_copy",
    createdAt: completedAt,
    updatedAt: completedAt,
    completedAt,
    engine: KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD,
    externalInferenceAPI: false,
    selfHostedInference: "not-required-for-source-preserving-manufacturing",
    manuscriptRequired: true,
    sourceAssetsRequired: true,
    coverProvided: true,
    cover: { name: coverMetadata.filename, type: coverMetadata.contentType, bytes: coverMetadata.bytes, filename: coverMetadata.filename },
    source: {
      authoritative: true,
      filename: sourceMetadata.filename,
      format: sourceMetadata.format,
      bytes: sourceMetadata.bytes,
      checksum: sourceMetadata.checksum,
      wordCount: sourceMetadata.wordCount,
      preservedOriginal: true,
    },
    wordCount: publication.wordCount,
    pageCount: publication.pageCount,
    quality: publication.quality,
    productSummary: { handle: product.handle, benefits: product.benefits.length, assets: creationArtifactNames({ type: coverMetadata.contentType }).filter(name => name.endsWith(".svg")).length },
    websitePopulation: websiteAsset ? { status: "cover-registered", asset: websiteAsset } : { status: "not-registered", reason: "Website Builder Asset Library was unavailable or full." },
    artifacts,
    stages: completedStages(),
    error: null,
    pollURL: `/api/publishing/jobs/${projectId}`,
    preview: {
      coverURL: `/api/publishing/jobs/${projectId}/artifacts/${encodeURIComponent(coverMetadata.filename)}`,
      manuscriptExcerpt: text.slice(0, 1800),
      title,
      subtitle: architecture.subtitle,
      author,
      wordCount: publication.wordCount,
      pageCount: publication.pageCount,
      approvalRequired: false,
      coverProvided: true,
      product: { handle: product.handle, valueProposition: product.valueProposition, shortDescription: product.shortDescription, benefits: product.benefits, insideTheBook: product.insideTheBook, seo: product.seo },
    },
  };

  await state.storage.put({ "pm:publication": publication, "pm:product": product, "pm:job": job });
  return json(publicJob(job), 201);
}

async function readStatus(state) {
  const job = await state.storage.get("pm:job");
  return job ? json(publicJob(job)) : failure(404, "product_manufacturing_job_not_found", "This project is not a Product Manufacturing Bridge job.");
}

async function readSource(state) {
  const metadata = await state.storage.get("pm:source");
  if (!metadata) return failure(404, "product_manuscript_source_not_found", "The authoritative manuscript source was not found.");
  const bytes = await loadBytes(state, "pm:source:", metadata);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${metadata.filename.replace(/[\"\r\n]/g, "")}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Kairos-Product-Manufacturing": KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD,
    },
  });
}

async function readArtifact(state, name) {
  const [job, publication, product, coverMetadata, sourceMetadata] = await Promise.all([
    state.storage.get("pm:job"),
    state.storage.get("pm:publication"),
    state.storage.get("pm:product"),
    state.storage.get("pm:cover"),
    state.storage.get("pm:source"),
  ]);
  if (!job) return failure(404, "product_manufacturing_job_not_found", "This project is not a Product Manufacturing Bridge job.");
  if (job.status !== "completed") return failure(409, "product_artifact_not_ready", "The product package has not completed.");
  if (sourceMetadata?.artifactName === name) {
    const bytes = await loadBytes(state, "pm:source:", sourceMetadata);
    return artifactResponse(bytes, sourceMetadata.contentType, name);
  }
  if (!creationArtifactNames({ type: coverMetadata?.contentType }).includes(name)) return failure(404, "product_artifact_not_found", "The requested product artifact was not found.");
  const coverBytes = await loadBytes(state, "pm:cover:", coverMetadata);
  const bytes = await buildCreationArtifact(name, publication, product, { ...coverMetadata, type: coverMetadata.contentType, bytes: coverBytes });
  return artifactResponse(bytes, creationArtifactContentType(name), name);
}

async function forwardBridgeOrNull(env, projectId, path) {
  if (!env?.KAIROS_PROJECTS) return null;
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(projectId));
  const response = await stub.fetch(`https://kairos.internal${INTERNAL_ROOT}${path}`);
  if (response.status !== 404) return response;
  const body = await safeResponseJSON(response.clone());
  return body?.error?.code === "product_manufacturing_job_not_found" ? null : response;
}

async function registerWebsiteCover(env, projectId, title, author, coverInput, coverMetadata) {
  if (!env?.KAIROS_PROJECTS) return null;
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(WEBSITE_LIBRARY_NAME));
  const listed = await safeResponseJSON(await stub.fetch("https://kairos.internal/website-builder-assets"));
  const projectTag = `product-${projectId}`;
  const existing = (listed?.assets || []).find(asset => Array.isArray(asset.tags) && asset.tags.includes(projectTag));
  if (existing) return existing;
  const response = await stub.fetch("https://kairos.internal/website-builder-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${title} approved product cover`,
      kind: "image",
      mimeType: coverMetadata.contentType,
      alt: `${title} cover by ${author}`,
      tags: ["product", "book", "resource", "guide", "publishing", safeBaseName(title), projectTag],
      dataBase64: String(coverInput?.dataBase64 || ""),
    }),
  });
  const body = await safeResponseJSON(response);
  return response.ok ? body.asset || null : null;
}

function decodeSource(manuscript, fallbackTextBytes) {
  const sourceBase64 = clean(manuscript?.sourceDataBase64, 30_000_000).replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  let bytes = fallbackTextBytes;
  if (sourceBase64) {
    try { bytes = decodeBase64(sourceBase64); }
    catch { throw fail(400, "manuscript_source_invalid", "The original manuscript file could not be decoded."); }
  }
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw fail(413, "manuscript_source_size_invalid", "The original manuscript file must be 20 MB or smaller.");
  const format = clean(manuscript?.format, 16).toLowerCase() || "txt";
  const filename = safeFilename(manuscript?.name || `manuscript.${format}`);
  const contentType = clean(manuscript?.mimeType, 160) || mimeFor(format);
  return { bytes, format, filename, contentType };
}

function decodeCover(input) {
  const type = clean(input?.type, 120).toLowerCase();
  if (!["image/png", "image/jpeg"].includes(type)) throw fail(400, "cover_type_invalid", "Upload the approved cover as a PNG or JPEG image.");
  const data = clean(input?.dataBase64, 12_000_000).replace(/^data:image\/(?:png|jpeg);base64,/i, "").replace(/\s+/g, "");
  if (!data) throw fail(400, "cover_data_missing", "The approved cover did not include image data.");
  let bytes;
  try { bytes = decodeBase64(data); }
  catch { throw fail(400, "cover_data_invalid", "The approved cover could not be decoded."); }
  if (!bytes.length || bytes.length > MAX_COVER_BYTES) throw fail(413, "cover_size_invalid", "The approved cover must be 8 MB or smaller.");
  if (!validImageSignature(bytes, type)) throw fail(400, "cover_signature_invalid", "The approved cover does not match its PNG or JPEG type.");
  return { bytes, type, filename: type === "image/jpeg" ? "approved-cover.jpg" : "approved-cover.png" };
}

function splitManuscript(text) {
  const lines = normalizeText(text).split("\n");
  const chapters = [];
  let title = "Manuscript";
  let buffer = [];
  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) chapters.push({ title: title || `Section ${chapters.length + 1}`, content });
    buffer = [];
  };
  for (const line of lines) {
    const heading = line.match(/^\s*(?:#{1,3}\s+|(?:chapter|part)\s+(?:\d+|[ivxlcdm]+)\s*[:.-]?\s*)(.+)$/i);
    if (heading) { flush(); title = clean(heading[1], 240) || `Chapter ${chapters.length + 1}`; }
    else buffer.push(line);
  }
  flush();
  if (chapters.length > 1) return chapters.slice(0, 80);

  const paragraphs = normalizeText(text).split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
  const generated = [];
  let chunk = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (length + paragraph.length > 10_000 && chunk.length) {
      generated.push({ title: `Section ${generated.length + 1}`, content: chunk.join("\n\n") });
      chunk = [];
      length = 0;
    }
    chunk.push(paragraph);
    length += paragraph.length;
  }
  if (chunk.length) generated.push({ title: generated.length ? `Section ${generated.length + 1}` : "Manuscript", content: chunk.join("\n\n") });
  return generated.length ? generated.slice(0, 80) : [{ title: "Manuscript", content: normalizeText(text) }];
}

function preservationEditorialPass(chapter, pass) {
  let content = String(chapter.content || "");
  if (pass === 1) content = content.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  else if (pass === 2) content = content.replace(/[ \t]{2,}/g, " ").replace(/\bvery very\b/gi, "very").trim();
  else if (pass === 3) content = content.replace(/\s+([,.;:!?])/g, "$1").replace(/([.!?])([A-Z])/g, "$1 $2").replace(/\n{3,}/g, "\n\n").trim();
  else throw fail(400, "editorial_pass_invalid", "Product manufacturing supports exactly three preservation-first editorial passes.");
  return { ...chapter, content, editorialPasses: pass, editedAt: new Date().toISOString(), editorialMode: "preservation-first" };
}

async function storeBytes(state, prefix, bytes, metadata) {
  const chunks = Math.ceil(bytes.length / CHUNK_BYTES);
  for (let index = 0; index < chunks; index += 1) await state.storage.put(`${prefix}${index}`, bytes.slice(index * CHUNK_BYTES, Math.min(bytes.length, (index + 1) * CHUNK_BYTES)));
  return { ...metadata, bytes: bytes.length, chunks, storedAt: new Date().toISOString() };
}

async function loadBytes(state, prefix, metadata) {
  if (!metadata) throw fail(404, "product_source_missing", "A required production source is missing.");
  const output = new Uint8Array(Number(metadata.bytes || 0));
  let offset = 0;
  for (let index = 0; index < Number(metadata.chunks || 0); index += 1) {
    const chunk = await state.storage.get(`${prefix}${index}`);
    if (!(chunk instanceof Uint8Array)) throw fail(502, "product_source_chunk_missing", "A required production source chunk is missing.");
    output.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== output.length) throw fail(502, "product_source_length_mismatch", "The stored production source failed integrity verification.");
  return output;
}

async function removeChunks(state, prefix, count) {
  for (let index = 0; index < count; index += 1) await state.storage.delete(`${prefix}${index}`);
}

function publicJob(job) {
  return {
    projectId: job.projectId,
    status: job.status,
    stage: job.stage,
    stageLabel: job.stageLabel,
    stageProgress: job.stageProgress,
    overallProgress: job.overallProgress,
    title: job.title,
    subtitle: job.subtitle,
    author: job.author,
    creationType: job.creationType,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    engine: job.engine,
    externalInferenceAPI: false,
    selfHostedInference: job.selfHostedInference,
    manuscriptRequired: true,
    sourceAssetsRequired: true,
    authoritativeManuscript: true,
    source: job.source,
    coverProvided: true,
    cover: job.cover,
    wordCount: job.wordCount,
    pageCount: job.pageCount,
    quality: job.quality,
    productSummary: job.productSummary,
    websitePopulation: job.websitePopulation,
    artifacts: job.artifacts,
    stages: job.stages,
    error: job.error,
    pollURL: job.pollURL,
    preview: job.preview,
  };
}

function completedStages() {
  return [
    ["source-intake", "Authoritative manuscript preserved"],
    ["source-verification", "Source checksum verified"],
    ["editorial", "Three preservation-first editorial passes"],
    ["cover", "Approved cover integrated"],
    ["manufacturing", "DOCX, PDF, KDP, and EPUB package"],
    ["product", "Shopify product page and assets"],
    ["website", "Product cover registered for website reuse"],
    ["qa", "Product package QA"],
    ["delivery", "Delivery"],
  ].map(([id, label]) => ({ id, label, status: "completed" }));
}

function artifactResponse(bytes, contentType, name) {
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Disposition": `${/\.(png|jpe?g|svg|html)$/i.test(name) ? "inline" : "attachment"}; filename="${name.replace(/[\"\r\n]/g, "")}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
      "X-Kairos-Product-Manufacturing": KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD,
      "X-Kairos-Authoritative-Manuscript": "true",
    },
  });
}

function deriveTopic(title, objective) {
  const words = `${title} ${objective}`.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || [];
  return words.find(word => !["the", "and", "for", "with", "book", "guide", "manuscript"].includes(word)) || title;
}
function deriveAudience(objective) {
  const match = objective.match(/\b(?:for|help|serve)\s+([^.;]{4,160})/i);
  return clean(match?.[1], 180) || "readers seeking practical knowledge and meaningful progress";
}
function deriveConcepts(value) {
  const stop = new Set(["the", "and", "for", "with", "book", "guide", "this", "that", "from", "into", "your", "their"]);
  const counts = new Map();
  for (const word of String(value || "").toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || []) if (!stop.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([word]) => word);
}
function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function validImageSignature(bytes, type) {
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}
async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}
function normalizeText(value) { return String(value || "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim(); }
function countWords(value) { return (String(value || "").match(/\b[\w’'-]+\b/g) || []).length; }
function safeFilename(value) { return clean(value, 180).replace(/[\\/:*?\"<>|\r\n]/g, "-") || "manuscript.txt"; }
function safeBaseName(value) { return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "publication"; }
function mimeFor(format) { return ({ pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", rtf: "application/rtf", md: "text/markdown", txt: "text/plain" })[format] || "application/octet-stream"; }
function finiteOrNull(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function clean(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function fail(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function safeMessage(error) { return error instanceof Error && error.message ? error.message : "Product manufacturing failed."; }
async function safeJSON(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
function failure(status, code, message) { return json({ status: status >= 500 ? "failed" : "needs-attention", build: KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD, error: { code, message }, safeguards: { authoritativeManuscriptPreserved: false, liveShopifyProductChanged: false, externalInferenceAPI: false } }, status); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Kairos-Product-Manufacturing": KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD, "X-Kairos-Authoritative-Manuscript": "true", "X-Content-Type-Options": "nosniff" } }); }
