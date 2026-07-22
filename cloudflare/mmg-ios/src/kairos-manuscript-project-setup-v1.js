const BUILD = "kairos-manuscript-project-setup-20260722-3";
const COVER_CHUNK_BYTES = 96 * 1024;
const COVER_WRITE_BATCH = 16;
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const SERVICES = new Set([
  "manuscript-correction",
  "editorial-production",
  "complete-publishing-package",
  "digital-edition-production",
]);

export async function handleManuscriptProjectSetupObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/setup(?:\/(cover))?$/i);
  if (!match) return null;

  const projectId = match[1];
  const action = match[2] || "setup";

  try {
    if (action === "setup" && request.method === "GET") return readSetup(state, projectId);
    if (action === "setup" && request.method === "POST") return saveSetup(state, request, projectId);
    if (action === "cover" && (request.method === "PUT" || request.method === "POST")) {
      return saveCover(state, request, projectId);
    }
    if (action === "cover" && request.method === "GET") return readCover(state, projectId);
    if (action === "cover" && request.method === "DELETE") return deleteCover(state, projectId);
    return json({
      status: "not-found",
      build: BUILD,
      error: {
        code: "manuscript_setup_route_not_found",
        message: "Manuscript project setup route not found.",
      },
    }, 404);
  } catch (error) {
    return json({
      status: "failed",
      build: BUILD,
      error: {
        code: error?.code || "manuscript_setup_failed",
        message: error instanceof Error ? error.message : "Project setup failed.",
      },
    }, Number(error?.status || 500));
  }
}

async function saveCover(state, request, projectId) {
  const operationId = operationIdFrom(request);
  await writeOperation(state, projectId, operationId, "cover-upload", "working");

  try {
    const contentType = normalizeMime(request.headers.get("Content-Type"));
    const filename = safeFilename(request.headers.get("X-Filename") || defaultCoverFilename(contentType));
    const declaredSize = Number(request.headers.get("Content-Length") || 0);
    if (declaredSize > MAX_COVER_BYTES) throw fail(413, "cover_too_large", "Customer cover files must be 8 MB or smaller.");

    const bytes = new Uint8Array(await request.arrayBuffer());
    const metadata = await storeCoverBytes(state, projectId, {
      bytes,
      filename,
      contentType,
      operationId,
    });

    await writeOperation(state, projectId, operationId, "cover-upload", "completed", {
      cover: publicCover(metadata),
    });

    return json({
      status: "stored",
      build: BUILD,
      operationId,
      cover: publicCover(metadata),
    }, 201, operationId);
  } catch (error) {
    await writeOperationSafe(state, projectId, operationId, "cover-upload", "failed", {
      error: { code: error?.code || "cover_upload_failed" },
    });
    throw error;
  }
}

async function saveSetup(state, request, projectId) {
  const operationId = operationIdFrom(request);
  const idempotencyKey = idempotencyKeyFrom(request, operationId);
  const existingReceipt = await state.storage.get(setupReceiptKey(projectId, idempotencyKey));
  if (existingReceipt?.response) {
    return json(existingReceipt.response, 200, operationId, true);
  }

  await writeOperation(state, projectId, operationId, "setup-validation", "working");

  try {
    const source = await state.storage.get(`manuscript:${projectId}:metadata`);
    if (!source) throw fail(409, "manuscript_source_required", "Store and validate the manuscript source before project setup.");

    const input = await readSetupInput(request);
    const authorName = required(input.authorName, "Author name", 160);
    const publicationTitle = required(input.publicationTitle || source.title, "Publication title", 240);
    const service = String(input.service || "").trim();
    if (!SERVICES.has(service)) throw fail(400, "publishing_service_invalid", "Select an approved MMG publishing service.");

    const trimSize = String(input.trimSize || "6x9").trim().slice(0, 40);
    const edition = ["ebook", "paperback", "hardcover", "digital-pdf", "multi-format"].includes(String(input.edition))
      ? String(input.edition)
      : "multi-format";
    const isbnStatus = ["customer-supplied", "kdp-free", "not-decided", "not-required"].includes(String(input.isbnStatus))
      ? String(input.isbnStatus)
      : "not-decided";
    const notes = String(input.notes || "").trim().slice(0, 4000);

    let coverMetadata = await state.storage.get(coverMetadataKey(projectId));
    if (input.cover instanceof File && input.cover.size) {
      coverMetadata = await storeCoverBytes(state, projectId, {
        bytes: new Uint8Array(await input.cover.arrayBuffer()),
        filename: safeFilename(input.cover.name || "customer-cover.png"),
        contentType: normalizeMime(input.cover.type),
        operationId,
      });
    }

    const now = new Date().toISOString();
    const previousSetup = await state.storage.get(setupKey(projectId));
    const setup = {
      projectId,
      publicationTitle,
      authorName,
      service,
      trimSize,
      edition,
      isbnStatus,
      notes,
      cover: coverMetadata ? publicCover(coverMetadata) : null,
      coverStatus: coverMetadata ? "customer-supplied-cover-stored" : "customer-cover-required",
      assignments: [
        { department: "Publishing Operations", role: "Project ownership and schedule control", status: "assigned" },
        { department: "Editorial Production", role: "Correction, structure, and production review", status: "queued" },
        { department: "Design Production", role: coverMetadata ? "Cover validation and placement" : "Await customer-supplied cover", status: coverMetadata ? "queued" : "blocked" },
        { department: "Publishing Readiness", role: "KDP and digital deliverable preparation", status: "queued" },
      ],
      milestones: [
        milestone("source-intake", "Source intake and validation", "completed", source.storedAt),
        milestone("project-setup", "Publication metadata and service confirmed", "completed", now),
        milestone("cover-intake", "Customer cover received", coverMetadata ? "completed" : "waiting", coverMetadata?.storedAt || null),
        milestone("editorial-production", "Editorial and production pass", "queued", null),
        milestone("customer-review", "First customer review", "queued", null),
        milestone("final-manufacturing", "Final files and delivery package", "queued", null),
      ],
      status: coverMetadata ? "assigned-to-production" : "awaiting-customer-cover",
      currentStage: coverMetadata ? "editorial-assignment" : "cover-intake",
      progress: coverMetadata ? 40 : 32,
      createdAt: previousSetup?.createdAt || now,
      updatedAt: now,
      operationId,
      build: BUILD,
      externalInferenceAPI: false,
    };

    const response = {
      status: setup.status,
      build: BUILD,
      operationId,
      setup,
      nextAction: coverMetadata
        ? "Begin the assigned editorial and production queue."
        : "Upload the customer-supplied cover to unlock editorial assignment.",
    };

    await persistSetupTransaction(state, setup, operationId, idempotencyKey, response);
    return json(response, 201, operationId);
  } catch (error) {
    await writeOperationSafe(state, projectId, operationId, "setup-save", "failed", {
      error: { code: error?.code || "manuscript_setup_failed" },
    });
    throw error;
  }
}

async function readSetup(state, projectId) {
  const setup = await state.storage.get(setupKey(projectId));
  if (setup) return json({ status: "ready", build: BUILD, setup, operationId: setup.operationId || null });

  const operation = await state.storage.get(latestOperationKey(projectId));
  if (operation && operation.status === "working") {
    return json({ status: "working", build: BUILD, operation }, 202, operation.operationId);
  }

  return json({
    status: "not-found",
    build: BUILD,
    operation: operation || null,
    error: {
      code: "manuscript_setup_not_found",
      message: "Project setup has not been completed.",
    },
  }, 404);
}

async function readSetupInput(request) {
  const contentType = String(request.headers.get("Content-Type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      authorName: form.get("authorName"),
      publicationTitle: form.get("publicationTitle"),
      service: form.get("service"),
      edition: form.get("edition"),
      trimSize: form.get("trimSize"),
      isbnStatus: form.get("isbnStatus"),
      notes: form.get("notes"),
      cover: form.get("cover"),
    };
  }

  throw fail(415, "setup_content_type_invalid", "Project setup must use application/json or multipart/form-data.");
}

async function storeCoverBytes(state, projectId, input) {
  const { bytes, operationId } = input;
  const contentType = normalizeMime(input.contentType);
  if (!["image/png", "image/jpeg"].includes(contentType)) throw fail(400, "cover_type_invalid", "Upload the customer cover as PNG or JPEG.");
  if (!bytes.length) throw fail(400, "cover_empty", "The customer cover file is empty.");
  if (bytes.length > MAX_COVER_BYTES) throw fail(413, "cover_too_large", "Customer cover files must be 8 MB or smaller.");
  if (!validImageSignature(bytes, contentType)) throw fail(400, "cover_signature_invalid", "The uploaded cover does not match its PNG or JPEG content type.");

  const sha256 = await digestHex(bytes);
  const current = await state.storage.get(coverMetadataKey(projectId));
  if (current?.operationId === operationId && current?.sha256 === sha256 && current?.size === bytes.length) return current;

  await removeCover(state, projectId);
  const chunks = Math.ceil(bytes.length / COVER_CHUNK_BYTES);
  for (let start = 0; start < chunks; start += COVER_WRITE_BATCH) {
    const entries = {};
    for (let index = start; index < Math.min(chunks, start + COVER_WRITE_BATCH); index += 1) {
      entries[`${coverPrefix(projectId)}${index}`] = bytes.slice(
        index * COVER_CHUNK_BYTES,
        Math.min(bytes.length, (index + 1) * COVER_CHUNK_BYTES),
      );
    }
    await state.storage.put(entries);
  }

  const metadata = {
    projectId,
    filename: safeFilename(input.filename || defaultCoverFilename(contentType)),
    contentType,
    size: bytes.length,
    chunks,
    sha256,
    operationId,
    storedAt: new Date().toISOString(),
    downloadURL: `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/setup/cover`,
  };
  await state.storage.put(coverMetadataKey(projectId), metadata);
  return metadata;
}

async function readCover(state, projectId) {
  const metadata = await state.storage.get(coverMetadataKey(projectId));
  if (!metadata) return json({ status: "not-found", build: BUILD, error: { code: "customer_cover_not_found", message: "Customer cover was not found." } }, 404);

  const keys = Array.from({ length: Number(metadata.chunks || 0) }, (_, index) => `${coverPrefix(projectId)}${index}`);
  const values = keys.length ? await state.storage.get(keys) : new Map();
  const output = new Uint8Array(metadata.size);
  let offset = 0;
  for (const key of keys) {
    const value = values.get(key);
    if (!value) throw fail(502, "cover_chunk_missing", "A stored cover chunk is missing.");
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return new Response(output, {
    status: 200,
    headers: {
      "Content-Type": metadata.contentType,
      "Content-Disposition": `inline; filename="${metadata.filename.replace(/["\r\n]/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Kairos-Manuscript-Setup": BUILD,
    },
  });
}

async function deleteCover(state, projectId) {
  await removeCover(state, projectId);
  return json({ status: "deleted", build: BUILD, projectId });
}

async function removeCover(state, projectId) {
  const metadata = await state.storage.get(coverMetadataKey(projectId));
  if (!metadata) return;
  const keys = Array.from({ length: Number(metadata.chunks || 0) }, (_, index) => `${coverPrefix(projectId)}${index}`);
  for (let start = 0; start < keys.length; start += 64) {
    await state.storage.delete(keys.slice(start, start + 64));
  }
  await state.storage.delete(coverMetadataKey(projectId));
}

async function persistSetupTransaction(state, setup, operationId, idempotencyKey, response) {
  const write = async (storage) => {
    const records = (await storage.get("production-registry")) || {};
    const current = records[setup.projectId] || {};
    records[setup.projectId] = registryRecord(current, setup);

    await storage.put({
      [setupKey(setup.projectId)]: setup,
      "production-registry": records,
      [latestOperationKey(setup.projectId)]: operationRecord(setup.projectId, operationId, "setup-save", "completed", { setupStatus: setup.status }),
      [setupReceiptKey(setup.projectId, idempotencyKey)]: {
        operationId,
        idempotencyKey,
        response,
        storedAt: setup.updatedAt,
      },
    });
  };

  if (typeof state.storage.transaction === "function") {
    await state.storage.transaction(write);
  } else {
    await write(state.storage);
  }
}

function registryRecord(current, setup) {
  return {
    ...current,
    projectId: setup.projectId,
    projectType: "manuscript-studio",
    title: setup.publicationTitle,
    status: setup.status,
    stage: setup.currentStage,
    progress: setup.progress,
    activeWorkspace: "manuscript-studio",
    summary: `${setup.authorName} · ${setup.service} · ${setup.coverStatus}`,
    nextAction: setup.cover ? "Begin editorial and production work." : "Upload the customer-supplied cover.",
    projectSetup: true,
    coverStored: Boolean(setup.cover),
    assignments: setup.assignments,
    milestones: setup.milestones,
    checkpoints: merge(current.checkpoints, {
      id: "project-setup",
      label: "Project setup and production assignment completed",
      status: "completed",
      recordedAt: setup.updatedAt,
    }),
    updatedAt: setup.updatedAt,
    revision: Number(current.revision || 0) + 1,
    ownerScope: "mmg-executive",
    externalInferenceAPI: false,
  };
}

async function writeOperation(state, projectId, operationId, phase, status, detail = {}) {
  await state.storage.put(latestOperationKey(projectId), operationRecord(projectId, operationId, phase, status, detail));
}

async function writeOperationSafe(state, projectId, operationId, phase, status, detail = {}) {
  try {
    await writeOperation(state, projectId, operationId, phase, status, detail);
  } catch {
    // Preserve the original operation failure.
  }
}

function operationRecord(projectId, operationId, phase, status, detail = {}) {
  const now = new Date().toISOString();
  return {
    projectId,
    operationId,
    phase,
    status,
    ...detail,
    updatedAt: now,
    completedAt: status === "completed" || status === "failed" ? now : null,
  };
}

function operationIdFrom(request) {
  return safeKey(request.headers.get("X-Kairos-Operation-Id") || crypto.randomUUID(), 120);
}

function idempotencyKeyFrom(request, fallback) {
  return safeKey(request.headers.get("X-Kairos-Idempotency-Key") || fallback, 120);
}

function safeKey(value, max) {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, max);
  return normalized || crypto.randomUUID();
}

function validImageSignature(bytes, contentType) {
  if (contentType === "image/png") {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function normalizeMime(value) {
  return String(value || "application/octet-stream").split(";", 1)[0].trim().toLowerCase();
}

function defaultCoverFilename(contentType) {
  return contentType === "image/jpeg" ? "customer-cover.jpg" : "customer-cover.png";
}

function milestone(id, label, status, completedAt) {
  return { id, label, status, completedAt };
}

function publicCover(value) {
  const { chunks, ...rest } = value;
  return rest;
}

function merge(values, item) {
  const list = Array.isArray(values) ? values.filter((value) => value?.id !== item.id) : [];
  return [...list.slice(-29), item];
}

function required(value, label, max) {
  const text = String(value || "").trim().slice(0, max);
  if (!text) throw fail(400, "required_field_missing", `${label} is required.`);
  return text;
}

function safeFilename(value) {
  return String(value || "cover.png").replace(/[\\/:*?"<>|\r\n]/g, "-").slice(0, 180) || "cover.png";
}

function setupKey(id) {
  return `manuscript:${id}:setup`;
}

function setupReceiptKey(id, key) {
  return `manuscript:${id}:setup:receipt:${key}`;
}

function latestOperationKey(id) {
  return `manuscript:${id}:setup:operation`;
}

function coverMetadataKey(id) {
  return `manuscript:${id}:cover:metadata`;
}

function coverPrefix(id) {
  return `manuscript:${id}:cover:chunk:`;
}

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function json(value, status = 200, operationId = null, replayed = false) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Kairos-Manuscript-Setup": BUILD,
  };
  if (operationId) headers["X-Kairos-Operation-Id"] = operationId;
  if (replayed) headers["X-Kairos-Idempotent-Replay"] = "true";
  return new Response(JSON.stringify(value), { status, headers });
}
