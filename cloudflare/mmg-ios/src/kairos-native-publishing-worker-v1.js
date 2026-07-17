import runtime from "./kairos-standalone-command-worker-v5.js";
import {
  KAIROS_NATIVE_ENGINE_VERSION,
  analyzeBookIdea,
  researchBookIdea,
  buildPublishingArchitecture,
  composeChapter,
  editorialPass,
  buildPublicationRecord,
} from "./kairos-native-intelligence-engine-v1.js";
import { buildProductPackage } from "./kairos-product-page-package-v1.js";
import { buildCreationArtifact, creationArtifactContentType, creationArtifactNames } from "./kairos-creation-artifacts-v1.js";
import { KAIROS_NATIVE_KERNEL_VERSION, NATIVE_DEPARTMENTS, analyzeNativeObjective, buildNativeExecutionGraph } from "./kairos-native-kernel-v1.js";
import {
  KAIROS_PROVIDER_POLICY,
  inferenceRuntime,
  intelligenceConfigured,
  probeKairosIntelligence,
  runKairosIntelligence,
} from "./kairos-intelligence-v1.js";

const BUILD = "kairos-native-publishing-20260716-3";
const KAIROS_SELF_HOSTED_INFERENCE_VERSION = "kairos-private-runtime-v1";
const ARTIFACT_CACHE_SECONDS = 60 * 60;
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const COVER_CHUNK_BYTES = 64 * 1024;
const REQUIRED_CHAPTER_HEADINGS = ["Core Principle", "Why It Matters", "A Practical Framework", "How to Apply It", "Common Failure Patterns", "MMG Tool", "Action Step", "Chapter Summary"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/native-intelligence/status" && request.method === "GET") {
      const runtimeReady = Boolean(env.KAIROS_PROJECTS);
      const enhancedInference = inferenceRuntime(env);
      return json({
        status: runtimeReady ? "operational" : "needs-attention",
        build: BUILD,
        engine: KAIROS_NATIVE_ENGINE_VERSION,
        kernel: KAIROS_NATIVE_KERNEL_VERSION,
        provider: "kairos-native",
        providerPolicy: KAIROS_PROVIDER_POLICY,
        externalInferenceAPI: false,
        enhancedInference,
        selfHostedInference: enhancedInference.selfHosted ? "configured" : "not-configured",
        selfHostedInferenceEngine: KAIROS_SELF_HOSTED_INFERENCE_VERSION,
        persistentProjectRuntime: Boolean(env.KAIROS_PROJECTS),
        capabilities: nativeCapabilities(env),
        departments: NATIVE_DEPARTMENTS.map(department => ({ id: department.id, name: department.name, capabilities: department.capabilities })),
      }, runtimeReady ? 200 : 503);
    }

    if (["/api/native-intelligence/inference-health", "/api/inference/health"].includes(url.pathname) && request.method === "GET") {
      try {
        const health = await probeKairosIntelligence(env);
        return json(health, health.status === "ready" ? 200 : 503);
      } catch (error) {
        return json({ status: "needs-attention", engine: KAIROS_SELF_HOSTED_INFERENCE_VERSION, external_provider: false, error: { code: error?.code || "inference_health_failed", message: safeMessage(error) } }, 503);
      }
    }

    if (url.pathname === "/api/native-intelligence/route" && request.method === "POST") {
      const payload = await safeRequestJSON(request);
      const analysis = analyzeNativeObjective(payload?.objective);
      return json({ status: "completed", analysis, executionGraph: buildNativeExecutionGraph(analysis, String(payload?.workflow || "general")), externalInferenceAPI: false });
    }

    if (url.pathname === "/api/content/capabilities" && request.method === "GET") {
      const enhancedInference = inferenceRuntime(env);
      return json({
        status: "ready",
        version: "kairos-native-creation-pipeline-v1",
        launchMode: "native-generative-production",
        intelligenceRuntime: enhancedInference.mode,
        enhancedInference,
        supportedTypes: ["product_asset_copy", "book_package"],
        productionActions: {
          research: "operational",
          fullManuscript: "operational",
          tripleEditorialPass: "operational",
          kdpManufacturing: "operational",
          productPage: "operational",
          coverDerivedAssets: "operational",
          previewAndDownloads: "operational",
        },
        mediaGeneration: { image: "cover-derived-svg-assets", video: "not-enabled", audio: "not-enabled" },
        providerPolicy: KAIROS_PROVIDER_POLICY,
      });
    }

    if (url.pathname === "/api/content/generate" && request.method === "POST") {
      const payload = await safeRequestJSON(request);
      const type = String(payload?.type || "").trim();
      if (!["product_asset_copy", "book_package"].includes(type)) {
        return json({ status: "needs-input", error: { code: "native_creation_type_required", message: "Choose Product Page + Assets or Complete Book Production." } }, 400);
      }
      return createPublishingJob(new Request(new URL("/api/publishing/jobs", request.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: String(payload?.objective || ""),
          sourceAction: "creation-engine",
          creationType: type,
          context: payload?.context || null,
          cover: payload?.cover || null,
        }),
      }), env);
    }

    if (url.pathname === "/api/publishing/jobs" && request.method === "POST") return createPublishingJob(request, env);

    const jobMatch = url.pathname.match(/^\/api\/publishing\/jobs\/([a-f0-9-]+)$/i);
    if (jobMatch && request.method === "GET") return forwardToProject(request, env, jobMatch[1], "/status");

    const approvalMatch = url.pathname.match(/^\/api\/publishing\/jobs\/([a-f0-9-]+)\/cover-approval$/i);
    if (approvalMatch && request.method === "POST") return forwardToProject(request, env, approvalMatch[1], "/cover-approval");

    const artifactMatch = url.pathname.match(/^\/api\/publishing\/jobs\/([a-f0-9-]+)\/artifacts\/([a-z0-9.-]+)$/i);
    if (artifactMatch && request.method === "GET") return forwardToProject(request, env, artifactMatch[1], `/artifacts/${artifactMatch[2]}`);

    if (url.pathname === "/api/hub/run" && request.method === "POST") {
      const payload = await safeRequestJSON(request.clone());
      const action = String(payload?.action || "").trim().toLowerCase();
      const objective = String(payload?.objective || "").trim();
      if (action === "publishing-studio" || (action === "creative-studio" && isPublicationObjective(objective))) {
        return createPublishingJob(new Request(new URL("/api/publishing/jobs", request.url), {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify({ idea: objective, sourceAction: action }),
        }), env);
      }
    }

    const response = await runtime.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      const enhancedInference = inferenceRuntime(env);
      body.build = BUILD;
      body.kernel = "kairos-native-publishing-v1";
      body.launchMode = "native-generative-production";
      body.openaiAPIUsed = false;
      body.intelligenceRuntime = {
        ...enhancedInference,
        status: "operational",
        providerPolicy: KAIROS_PROVIDER_POLICY,
        externalInferenceAPI: false,
      };
      body.nativeIntelligence = {
        engine: KAIROS_NATIVE_ENGINE_VERSION,
        provider: "kairos-native",
        providerPolicy: KAIROS_PROVIDER_POLICY,
        externalInferenceAPI: false,
        enhancedInference,
        selfHostedInference: enhancedInference.selfHosted ? "configured" : "not-configured",
        selfHostedInferenceEngine: KAIROS_SELF_HOSTED_INFERENCE_VERSION,
        projectStorage: env.KAIROS_PROJECTS ? "durable-object" : "unavailable",
      };
      body.capabilities = {
        ...(body.capabilities || {}),
        ...nativeCapabilities(env),
        enhancedInference: enhancedInference.configured ? "operational" : "needs-configuration",
        selfHostedInferenceGateway: enhancedInference.selfHosted ? "configured" : "optional-private-upgrade",
        bookDevelopment: env.KAIROS_PROJECTS ? "operational" : "needs-configuration",
        productAssetCopy: env.KAIROS_PROJECTS ? "operational" : "needs-configuration",
        productionPublishing: env.KAIROS_PROJECTS ? "operational" : "needs-configuration",
        imageGeneration: "cover-derived-assets",
      };
      return json(body, response.status);
    }
    return retag(response);
  },
};

export class KairosProject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/control/inference/claim" && request.method === "POST") return this.claimInference(request);
      if (url.pathname === "/control/autonomy/claim" && request.method === "POST") return this.claimAutonomy(request);
      if (url.pathname === "/ledger/upsert" && request.method === "POST") return this.ledgerUpsert(request);
      if (url.pathname === "/ledger/batch-upsert" && request.method === "POST") return this.ledgerBatchUpsert(request);
      if (url.pathname === "/ledger/get" && request.method === "GET") return this.ledgerGet(url);
      if (url.pathname === "/ledger/list" && request.method === "GET") return this.ledgerList(url);
      if (url.pathname === "/ledger/delete" && request.method === "DELETE") return this.ledgerDelete(url);
      if (url.pathname === "/create" && request.method === "POST") return this.create(request);
      if (url.pathname === "/status" && request.method === "GET") return this.status();
      if (url.pathname === "/cover-approval" && request.method === "POST") return this.approveCover(request);
      const artifactMatch = url.pathname.match(/^\/artifacts\/([a-z0-9.-]+)$/i);
      if (artifactMatch && request.method === "GET") return this.artifact(artifactMatch[1]);
      return json({ error: { code: "native_project_route_not_found", message: "Native project route not found." } }, 404);
    } catch (error) {
      return failure(error);
    }
  }

  async ledgerUpsert(request) {
    const payload = await safeRequestJSON(request);
    const collection = ledgerToken(payload?.collection, "collection");
    const id = ledgerToken(payload?.id || payload?.value?.id, "record id");
    const value = payload?.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw engineError(400, "ledger_value_required", "Kairos requires an object value for durable persistence.");
    const key = `ledger:${collection}:${id}`;
    const indexKey = `ledger:index:${collection}`;
    const existingIndex = await this.state.storage.get(indexKey);
    const index = Array.isArray(existingIndex) ? existingIndex.filter(entry => entry?.id !== id) : [];
    const updatedAt = String(value.updatedAt || value.createdAt || new Date().toISOString());
    index.unshift({ id, updatedAt });
    await this.state.storage.put({
      [key]: { ...value, id },
      [indexKey]: index.slice(0, 1000),
    });
    return json({ status: "persisted", collection, id, value: { ...value, id } });
  }

  async ledgerBatchUpsert(request) {
    const payload = await safeRequestJSON(request);
    const records = Array.isArray(payload?.records) ? payload.records.slice(0, 25) : [];
    if (!records.length) throw engineError(400, "ledger_records_required", "Kairos requires one or more durable records.");
    const now = new Date().toISOString();
    const writes = {};
    const indexCache = new Map();
    const persisted = [];
    for (const record of records) {
      const collection = ledgerToken(record?.collection, "collection");
      const id = ledgerToken(record?.id || record?.value?.id, "record id");
      const value = record?.value;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw engineError(400, "ledger_value_required", "Every Kairos batch record requires an object value.");
      const indexKey = `ledger:index:${collection}`;
      let index = indexCache.get(indexKey);
      if (!index) {
        const existing = await this.state.storage.get(indexKey);
        index = Array.isArray(existing) ? existing : [];
      }
      index = index.filter(entry => entry?.id !== id);
      const updatedAt = String(value.updatedAt || value.createdAt || now);
      index.unshift({ id, updatedAt });
      indexCache.set(indexKey, index.slice(0, 1000));
      writes[`ledger:${collection}:${id}`] = { ...value, id };
      persisted.push({ collection, id });
    }
    for (const [indexKey, index] of indexCache) writes[indexKey] = index;
    await this.state.storage.put(writes);
    return json({ status: "persisted", atomic: true, records: persisted });
  }

  async ledgerGet(url) {
    const collection = ledgerToken(url.searchParams.get("collection"), "collection");
    const id = ledgerToken(url.searchParams.get("id"), "record id");
    const value = await this.state.storage.get(`ledger:${collection}:${id}`);
    if (!value) return json({ status: "not-found", collection, id }, 404);
    return json({ status: "ready", collection, id, value });
  }

  async ledgerList(url) {
    const collection = ledgerToken(url.searchParams.get("collection"), "collection");
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 250)));
    const index = await this.state.storage.get(`ledger:index:${collection}`);
    const entries = Array.isArray(index) ? index.slice(0, limit) : [];
    const values = [];
    for (const entry of entries) {
      const value = await this.state.storage.get(`ledger:${collection}:${entry.id}`);
      if (value) values.push(value);
    }
    return json({ status: "ready", collection, values });
  }

  async ledgerDelete(url) {
    const collection = ledgerToken(url.searchParams.get("collection"), "collection");
    const id = ledgerToken(url.searchParams.get("id"), "record id");
    const indexKey = `ledger:index:${collection}`;
    const existingIndex = await this.state.storage.get(indexKey);
    const index = Array.isArray(existingIndex) ? existingIndex.filter(entry => entry?.id !== id) : [];
    await this.state.storage.delete?.(`ledger:${collection}:${id}`);
    await this.state.storage.put(indexKey, index);
    return json({ status: "deleted", collection, id });
  }

  async claimInference(request) {
    const payload = await safeRequestJSON(request);
    const perMinute = Math.max(1, Math.min(60, Number(payload?.perMinute || 6)));
    const perDay = Math.max(10, Math.min(5000, Number(payload?.perDay || 200)));
    const purpose = String(payload?.purpose || "inference").replace(/[^a-z0-9._:-]/gi, "-").slice(0, 120);
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const key = `control:inference:${day}`;
    const existing = await this.state.storage.get(key);
    const timestamps = Array.isArray(existing?.timestamps) ? existing.timestamps.filter(value => now - Number(value) < 60_000) : [];
    const total = Number(existing?.total || 0);
    if (timestamps.length >= perMinute || total >= perDay) {
      const retryAfterMs = timestamps.length >= perMinute ? Math.max(1000, 60_000 - (now - Number(timestamps[0] || now))) : Math.max(1000, Date.parse(`${day}T23:59:59.999Z`) - now);
      return json({ status: "deferred", retryAfterMs, error: { code: "kairos_inference_rate_limited", message: "Kairos preserved its configured inference budget. Retry after the current budget window." } }, 429, { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) });
    }
    timestamps.push(now);
    const byPurpose = { ...(existing?.byPurpose || {}), [purpose]: Number(existing?.byPurpose?.[purpose] || 0) + 1 };
    await this.state.storage.put(key, { day, total: total + 1, timestamps, byPurpose, updatedAt: new Date(now).toISOString() });
    return json({ status: "claimed", day, total: total + 1, perMinute, perDay, purpose });
  }

  async claimAutonomy(request) {
    const payload = await safeRequestJSON(request);
    const scope = ledgerToken(payload?.scope || "operational-cycle", "autonomy scope");
    const minimumIntervalMs = Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(payload?.minimumIntervalMs || 15 * 60 * 1000)));
    const key = `control:autonomy:${scope}`;
    const existing = await this.state.storage.get(key);
    const now = Date.now();
    const lastClaimedAt = Date.parse(existing?.claimedAt || 0);
    if (Number.isFinite(lastClaimedAt) && now - lastClaimedAt < minimumIntervalMs) {
      const nextEligibleAt = new Date(lastClaimedAt + minimumIntervalMs).toISOString();
      return json({ status: "deferred", scope, lastClaimedAt: existing.claimedAt, nextEligibleAt }, 409);
    }
    const claim = { id: crypto.randomUUID(), scope, source: String(payload?.source || "scheduled").slice(0, 160), claimedAt: new Date(now).toISOString(), minimumIntervalMs };
    await this.state.storage.put(key, claim);
    return json({ status: "claimed", ...claim });
  }

  async alarm() {
    const job = await this.state.storage.get("job");
    if (!job || ["awaiting-cover-approval", "completed", "needs-attention"].includes(job.status)) return;
    try {
      await this.advance(job);
    } catch (error) {
      const retryCount = Number(job.retryCount || 0) + 1;
      const next = {
        ...job,
        retryCount,
        updatedAt: new Date().toISOString(),
        status: retryCount >= 3 ? "needs-attention" : "working",
        error: { code: error?.code || "native_stage_failed", message: safeMessage(error) },
      };
      await this.state.storage.put("job", next);
      if (retryCount < 3) await this.state.storage.setAlarm(Date.now() + retryCount * 2_000);
    }
  }

  async create(request) {
    const existing = await this.state.storage.get("job");
    if (existing) return json(publicJob(existing), 200);
    const payload = await safeRequestJSON(request);
    const analysis = analyzeBookIdea(payload?.idea);
    const cover = await this.storeCover(payload?.cover);
    const now = new Date().toISOString();
    const enhancedInference = inferenceRuntime(this.env);
    const job = {
      projectId: String(payload?.projectId || crypto.randomUUID()),
      status: "queued",
      stage: "research",
      stageLabel: "Research and source analysis",
      stageProgress: 0,
      overallProgress: 2,
      sourceAction: String(payload?.sourceAction || "publishing-studio"),
      creationType: ["product_asset_copy", "book_package"].includes(payload?.creationType) ? payload.creationType : "book_package",
      title: analysis.title,
      subtitle: "",
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      engine: KAIROS_NATIVE_ENGINE_VERSION,
      externalInferenceAPI: false,
      enhancedInference: enhancedInference.configured ? "enabled" : "deterministic-fallback",
      inferenceMode: enhancedInference.mode,
      inferenceProvider: enhancedInference.provider,
      selfHostedInference: enhancedInference.selfHosted ? "enabled" : "not-configured",
      inferenceEngine: enhancedInference.selfHosted ? KAIROS_SELF_HOSTED_INFERENCE_VERSION : enhancedInference.configured ? "kairos-cloudflare-account-inference-v1" : null,
      inferenceEvidence: [],
      inferenceFailures: [],
      manuscriptRequired: false,
      sourceAssetsRequired: false,
      coverProvided: Boolean(cover),
      cover: cover || null,
      approval: cover ? { approved: true, source: "user-supplied-cover", note: "The cover supplied with this project is the approved canonical front cover.", decidedAt: now, scope: "front-cover-and-full-wrap-production" } : null,
      chapterCursor: 0,
      editorialPass: 0,
      retryCount: 0,
      stages: stageLedger("research"),
    };
    await this.state.storage.put({ job, analysis });
    await this.state.storage.setAlarm(Date.now() + 100);
    return json(publicJob(job), 202);
  }

  async storeCover(input) {
    if (!input) return null;
    const type = String(input.type || "").toLowerCase();
    if (!['image/png', 'image/jpeg'].includes(type)) throw engineError(400, "cover_type_invalid", "Upload the approved cover as a PNG or JPEG image.");
    const encoded = String(input.dataBase64 || "").replace(/^data:image\/(?:png|jpeg);base64,/i, "").replace(/\s+/g, "");
    if (!encoded) throw engineError(400, "cover_data_missing", "The approved cover file did not include image data.");
    let bytes;
    try { bytes = decodeBase64(encoded); } catch { throw engineError(400, "cover_data_invalid", "The approved cover image could not be decoded."); }
    if (!bytes.length || bytes.length > MAX_COVER_BYTES) throw engineError(413, "cover_size_invalid", "The approved cover must be between 1 byte and 8 MB.");
    if (!validImageSignature(bytes, type)) throw engineError(400, "cover_signature_invalid", "The uploaded file does not match its PNG or JPEG image type.");
    const chunks = Math.ceil(bytes.length / COVER_CHUNK_BYTES);
    for (let index = 0; index < chunks; index += 1) await this.state.storage.put(`cover:chunk:${index}`, bytes.slice(index * COVER_CHUNK_BYTES, (index + 1) * COVER_CHUNK_BYTES));
    const metadata = {
      name: sanitizeUploadName(input.name, type),
      type,
      bytes: bytes.length,
      chunks,
      storedAt: new Date().toISOString(),
      filename: type === "image/jpeg" ? "approved-cover.jpg" : "approved-cover.png",
    };
    await this.state.storage.put("cover:metadata", metadata);
    return metadata;
  }

  async loadCover() {
    const metadata = await this.state.storage.get("cover:metadata");
    if (!metadata) return null;
    const chunks = [];
    let length = 0;
    for (let index = 0; index < metadata.chunks; index += 1) {
      const chunk = new Uint8Array(await this.state.storage.get(`cover:chunk:${index}`));
      chunks.push(chunk);
      length += chunk.length;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { ...metadata, bytes };
  }

  async status() {
    const job = await this.state.storage.get("job");
    if (!job) return json({ error: { code: "publishing_job_not_found", message: "The native publishing project was not found." } }, 404);
    const preview = await this.preview(job);
    return json({ ...publicJob(job), preview });
  }

  async approveCover(request) {
    const job = await this.state.storage.get("job");
    if (!job) return json({ error: { code: "publishing_job_not_found", message: "The native publishing project was not found." } }, 404);
    if (job.status !== "awaiting-cover-approval") throw engineError(409, "cover_approval_not_ready", "The cover proof is not ready for approval.");
    const payload = await safeRequestJSON(request);
    if (payload?.approved !== true) {
      const rejected = { ...job, status: "needs-attention", stage: "cover-revision", stageLabel: "Cover revision requested", updatedAt: new Date().toISOString(), approval: { approved: false, note: String(payload?.note || "Revision requested").slice(0, 1000), decidedAt: new Date().toISOString() } };
      await this.state.storage.put("job", rejected);
      return json(publicJob(rejected), 200);
    }
    const approval = { approved: true, note: String(payload?.note || "Cover proof approved").slice(0, 1000), decidedAt: new Date().toISOString(), scope: "front-cover-and-full-wrap-production" };
    const next = { ...job, approval, status: "working", stage: "packaging", stageLabel: "Assembling the approved production package", stageProgress: 0, overallProgress: 94, retryCount: 0, updatedAt: new Date().toISOString(), stages: updateStageLedger(job.stages, "packaging", "working") };
    await this.state.storage.put("job", next);
    await this.state.storage.setAlarm(Date.now() + 100);
    return json(publicJob(next), 202);
  }

  async artifact(name) {
    const job = await this.state.storage.get("job");
    if (!job) throw engineError(404, "publishing_job_not_found", "The native publishing project was not found.");
    const previewNames = job.cover?.type === "image/jpeg" ? ["cover-preview.jpg"] : ["cover-preview.png", "cover-preview.svg"];
    const allowedPreview = previewNames.includes(name) && ["awaiting-cover-approval", "working", "completed"].includes(job.status) && ["preview", "packaging", "delivery"].includes(job.stage);
    const allowedFinal = job.status === "completed" && creationArtifactNames(job.cover).includes(name);
    if (!allowedPreview && !allowedFinal) throw engineError(409, "artifact_not_ready", "This publication artifact has not reached its release gate.");
    const publication = await this.loadPublication(job);
    const product = await this.state.storage.get("product");
    const cover = await this.loadCover();
    const bytes = await buildCreationArtifact(name, publication, product || buildProductPackage(publication), cover);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": creationArtifactContentType(name),
        "Content-Disposition": `${name.startsWith("cover-preview.") ? "inline" : "attachment"}; filename="${downloadFilename(job.title, name)}"`,
        "Cache-Control": `private, max-age=${ARTIFACT_CACHE_SECONDS}`,
        "X-Kairos-Engine": KAIROS_NATIVE_ENGINE_VERSION,
        "X-Kairos-External-Inference": "false",
      },
    });
  }

  async advance(job) {
    if (job.stage === "research") {
      const analysis = await this.state.storage.get("analysis");
      let research = await this.state.storage.get("research");
      if (!research) {
        research = await researchBookIdea(analysis);
        await this.state.storage.put("research", research);
      }
      const inference = await this.runInference(job, {
        task: "research_synthesis",
        requestId: inferenceRequestId(job, "research"),
        maxTokens: 2_500,
        thinking: true,
        context: { book: inferenceBookContext(analysis), sources: research.sources, native_synthesis: research.synthesis },
      }, "Kairos model is synthesizing the direct-source research");
      if (inference.status === "pending") return;
      job = inference.job;
      if (inference.status === "completed") {
        research = { ...research, nativeSynthesis: research.synthesis, synthesis: inference.text, synthesizedBy: inference.evidence.engine };
        await this.state.storage.put("research", research);
      }
      await this.state.storage.put("research", research);
      return this.move(job, "architecture", "Building the editorial architecture", 14);
    }

    if (job.stage === "architecture") {
      const [analysis, research] = await Promise.all([this.state.storage.get("analysis"), this.state.storage.get("research")]);
      let architecture = await this.state.storage.get("architecture");
      if (!architecture) {
        architecture = buildPublishingArchitecture(analysis, research);
        await this.state.storage.put("architecture", architecture);
      }
      const inference = await this.runInference(job, {
        task: "architecture_review",
        requestId: inferenceRequestId(job, "architecture"),
        maxTokens: 1_800,
        thinking: true,
        context: { book: inferenceBookContext(analysis), research_synthesis: research.synthesis, architecture },
      }, "Kairos model is reviewing the editorial architecture");
      if (inference.status === "pending") return;
      job = inference.job;
      if (inference.status === "completed") {
        architecture = { ...architecture, intelligenceReview: inference.text, reviewedBy: inference.evidence.engine };
        await this.state.storage.put("architecture", architecture);
      }
      return this.move({ ...job, title: architecture.title, subtitle: architecture.subtitle }, "manuscript", "Writing the Gold Master manuscript", 22, { chapterCursor: 0 });
    }

    if (job.stage === "manuscript") {
      const [analysis, research, architecture] = await Promise.all([this.state.storage.get("analysis"), this.state.storage.get("research"), this.state.storage.get("architecture")]);
      const chapterIndex = Number(job.chapterCursor || 0);
      if (chapterIndex < architecture.chapterPlan.length) {
        const plan = architecture.chapterPlan[chapterIndex];
        const inference = await this.runInference(job, {
          task: "chapter",
          requestId: inferenceRequestId(job, `chapter:${chapterIndex + 1}`),
          maxTokens: 4_500,
          thinking: false,
          context: {
            book: inferenceBookContext(analysis),
            research: { synthesis: research.synthesis, sources: research.sources },
            architecture: { title: architecture.title, subtitle: architecture.subtitle, audience: architecture.audience, promise: architecture.promise, intelligenceReview: architecture.intelligenceReview || null },
            chapter_number: chapterIndex + 1,
            chapter_plan: plan,
          },
        }, `Kairos model is writing chapter ${chapterIndex + 1} of ${architecture.chapterPlan.length}`);
        if (inference.status === "pending") return;
        job = inference.job;
        let chapter;
        if (inference.status === "completed") {
          try {
            chapter = inferredChapter(plan, chapterIndex, inference.text, inference.evidence.engine);
          } catch (error) {
            job = await this.recordInferenceFailure(job, "chapter_output_rejected", safeMessage(error));
          }
        }
        if (!chapter) chapter = composeChapter(analysis, research, architecture, chapterIndex);
        await this.state.storage.put(`chapter:${chapterIndex}`, chapter);
        const completed = chapterIndex + 1;
        const progress = 22 + Math.round((completed / architecture.chapterPlan.length) * 38);
        const next = { ...job, status: "working", stageProgress: Math.round((completed / architecture.chapterPlan.length) * 100), overallProgress: progress, chapterCursor: completed, stageLabel: `Writing chapter ${completed} of ${architecture.chapterPlan.length}`, updatedAt: new Date().toISOString(), retryCount: 0 };
        await this.state.storage.put("job", next);
        await this.state.storage.setAlarm(Date.now() + 80);
        return;
      }
      return this.move(job, "editorial", "Editorial pass 1 of 3 — structure and completeness", 62, { editorialPass: 1, chapterCursor: 0 });
    }

    if (job.stage === "editorial") {
      const architecture = await this.state.storage.get("architecture");
      const pass = Number(job.editorialPass || 1);
      const chapterIndex = Number(job.chapterCursor || 0);
      if (chapterIndex < architecture.chapterPlan.length) {
        const chapter = await this.state.storage.get(`chapter:${chapterIndex}`);
        const inference = await this.runInference(job, {
          task: "editorial",
          requestId: inferenceRequestId(job, `edit:${pass}:${chapterIndex + 1}`),
          maxTokens: 5_000,
          thinking: false,
          context: { pass_number: pass, chapter_number: chapterIndex + 1, chapter_title: chapter.title, chapter_markdown: chapter.content },
        }, `Kairos model is editing chapter ${chapterIndex + 1} — pass ${pass} of 3`);
        if (inference.status === "pending") return;
        job = inference.job;
        let edited;
        if (inference.status === "completed") {
          try {
            edited = inferredEditorialPass(chapter, pass, inference.text, inference.evidence.engine);
          } catch (error) {
            job = await this.recordInferenceFailure(job, "editorial_output_rejected", safeMessage(error));
          }
        }
        if (!edited) edited = editorialPass(chapter, pass);
        await this.state.storage.put(`chapter:${chapterIndex}`, edited);
        const completed = chapterIndex + 1;
        const within = (completed / architecture.chapterPlan.length) * (8 / 3);
        const progress = 62 + Math.round((pass - 1) * (8 / 3) + within);
        const next = { ...job, status: "working", stageProgress: Math.round((completed / architecture.chapterPlan.length) * 100), overallProgress: progress, chapterCursor: completed, stageLabel: `Editorial pass ${pass} of 3 — chapter ${completed} of ${architecture.chapterPlan.length}`, updatedAt: new Date().toISOString(), retryCount: 0 };
        await this.state.storage.put("job", next);
        await this.state.storage.setAlarm(Date.now() + 60);
        return;
      }
      if (pass < 3) {
        const next = { ...job, editorialPass: pass + 1, chapterCursor: 0, stageProgress: 0, stageLabel: `Editorial pass ${pass + 1} of 3`, updatedAt: new Date().toISOString() };
        await this.state.storage.put("job", next);
        await this.state.storage.setAlarm(Date.now() + 80);
        return;
      }
      return this.move(job, "design", "Creating the cover system and production specifications", 72);
    }

    if (job.stage === "design") {
      if (job.coverProvided) {
        await this.state.storage.put("coverBrief", { content: "Use the user-supplied approved cover without changing its artwork, typography, title, subtitle, author, crop, or color.", generatedBy: "approved-source-asset", generatedAt: new Date().toISOString() });
        return this.move(job, "manufacturing", "Integrating the approved cover into digital and KDP masters", 80);
      }
      const [analysis, architecture] = await Promise.all([this.state.storage.get("analysis"), this.state.storage.get("architecture")]);
      const firstChapter = await this.state.storage.get("chapter:0");
      const inference = await this.runInference(job, {
        task: "cover_brief",
        requestId: inferenceRequestId(job, "cover"),
        maxTokens: 1_600,
        thinking: false,
        context: { book: inferenceBookContext(analysis), architecture: { title: architecture.title, subtitle: architecture.subtitle, audience: architecture.audience }, opening_excerpt: String(firstChapter?.content || "").slice(0, 4_000), renderer: "Kairos deterministic geometric cover renderer" },
      }, "Kairos model is developing the cover art direction");
      if (inference.status === "pending") return;
      job = inference.job;
      if (inference.status === "completed") await this.state.storage.put("coverBrief", { content: inference.text, generatedBy: inference.evidence.engine, generatedAt: new Date().toISOString() });
      return this.move(job, "manufacturing", "Manufacturing DOCX, digital, and KDP production masters", 80);
    }

    if (job.stage === "manufacturing") {
      const publication = await this.loadPublication(job, false);
      const { chapters, ...record } = publication;
      await this.state.storage.put("publication", record);
      return this.move({ ...job, wordCount: publication.wordCount, pageCount: publication.pageCount }, "product", "Building the Shopify product page and cover-derived assets", 85);
    }

    if (job.stage === "product") {
      const publication = await this.loadPublication(job);
      const product = buildProductPackage(publication);
      await this.state.storage.put("product", product);
      return this.move({ ...job, productSummary: { handle: product.handle, benefits: product.benefits.length, assets: creationArtifactNames(job.cover).filter(name => name.endsWith(".svg")).length } }, "qa", "Running publication QA and KDP preflight", 89);
    }

    if (job.stage === "qa") {
      const publication = await this.loadPublication(job);
      if (job.coverProvided) return this.move({ ...job, quality: publication.quality }, "preview", "Approved-cover preview and deliverable manifest ready", 93);
      const next = {
        ...job,
        status: "awaiting-cover-approval",
        stage: "preview",
        stageLabel: "Cover proof ready for executive approval",
        stageProgress: 100,
        overallProgress: 92,
        updatedAt: new Date().toISOString(),
        quality: publication.quality,
        stages: updateStageLedger(job.stages, "preview", "awaiting-approval"),
        error: null,
      };
      await this.state.storage.put("job", next);
      return;
    }

    if (job.stage === "preview") {
      return this.move(job, "packaging", "Assembling the complete production package", 96);
    }

    if (job.stage === "packaging") {
      const completedAt = new Date().toISOString();
      const next = {
        ...job,
        status: "completed",
        stage: "delivery",
        stageLabel: "Production package ready",
        stageProgress: 100,
        overallProgress: 100,
        completedAt,
        updatedAt: completedAt,
        artifacts: creationArtifactNames(job.cover),
        stages: updateStageLedger(job.stages, "delivery", "completed"),
        error: null,
      };
      await this.state.storage.put("job", next);
    }
  }

  async runInference(job, request, stageLabel) {
    if (!intelligenceConfigured(this.env)) return { status: "unavailable", job };
    try {
      const runtimeState = inferenceRuntime(this.env);
      const prompt = inferencePrompt(request);
      const generated = await runKairosIntelligence(this.env, {
        system: prompt.system,
        user: prompt.user,
        maxTokens: request.maxTokens || 4096,
        temperature: prompt.temperature,
        purpose: `publishing-${request.task}`,
      });
      const evidence = {
        task: request.task,
        requestId: request.requestId,
        model: generated.model,
        provider: generated.provider,
        runtime: generated.runtime,
        engine: runtimeState.selfHosted ? KAIROS_SELF_HOSTED_INFERENCE_VERSION : "kairos-cloudflare-account-inference-v1",
        outputTokens: generated.usage?.completion_tokens || null,
        latencyMs: null,
        completedAt: new Date().toISOString(),
        selfHosted: runtimeState.selfHosted,
        managedService: runtimeState.managedService,
        privacy: runtimeState.privacy,
      };
      const next = {
        ...job,
        status: "working",
        stageLabel,
        enhancedInference: "active",
        inferenceMode: runtimeState.mode,
        inferenceProvider: runtimeState.provider,
        selfHostedInference: runtimeState.selfHosted ? "active" : "not-configured",
        inferenceEngine: evidence.engine,
        inferenceJob: null,
        inferenceEvidence: [...(job.inferenceEvidence || []), evidence].slice(-80),
        updatedAt: new Date().toISOString(),
      };
      await this.state.storage.put("job", next);
      return { status: "completed", job: next, text: generated.text, evidence };
    } catch (error) {
      if (error?.code === "kairos_inference_rate_limited") {
        const next = { ...job, status: "working", stageLabel: "Waiting for the governed inference budget", updatedAt: new Date().toISOString() };
        await this.state.storage.put("job", next);
        await this.state.storage.setAlarm(Date.now() + Math.max(1000, Math.min(60_000, Number(error?.retryAfterMs || 60_000))));
        return { status: "pending", job: next };
      }
      const next = await this.recordInferenceFailure(job, error?.code || "enhanced_inference_failed", safeMessage(error));
      return { status: "failed", job: next };
    }
  }
  async recordInferenceFailure(job, code, message) {
    const failureRecord = { stage: job.stage, code, message: String(message).slice(0, 1000), at: new Date().toISOString() };
    const next = {
      ...job,
      inferenceJob: null,
      inferenceFailures: [...(job.inferenceFailures || []), failureRecord].slice(-40),
      updatedAt: new Date().toISOString(),
    };
    await this.state.storage.put("job", next);
    return next;
  }

  async move(job, stage, stageLabel, overallProgress, extra = {}) {
    const next = {
      ...job,
      ...extra,
      status: "working",
      stage,
      stageLabel,
      stageProgress: 0,
      overallProgress,
      updatedAt: new Date().toISOString(),
      retryCount: 0,
      error: null,
      stages: updateStageLedger(job.stages, stage, "working"),
    };
    await this.state.storage.put("job", next);
    await this.state.storage.setAlarm(Date.now() + 100);
  }

  async loadPublication(job, useStored = true) {
    const [analysis, research, architecture, stored, coverBrief] = await Promise.all([
      this.state.storage.get("analysis"),
      this.state.storage.get("research"),
      this.state.storage.get("architecture"),
      useStored ? this.state.storage.get("publication") : Promise.resolve(null),
      this.state.storage.get("coverBrief"),
    ]);
    const chapters = [];
    for (let index = 0; index < Number(architecture?.chapterPlan?.length || 0); index += 1) {
      const chapter = await this.state.storage.get(`chapter:${index}`);
      if (chapter) chapters.push(chapter);
    }
    const intelligence = {
      mode: job.inferenceMode || "deterministic-native",
      provider: job.inferenceProvider || "kairos-native",
      engine: job.inferenceEngine || null,
      completedTasks: Number(job.inferenceEvidence?.length || 0),
      fallbackTasks: Number(job.inferenceFailures?.length || 0),
      managedService: job.inferenceMode === "cloudflare-account-scoped",
      selfHosted: job.inferenceMode === "self-hosted-private",
    };
    if (stored) return { ...stored, chapters, coverBrief: coverBrief || stored.coverBrief || null, intelligence: stored.intelligence || intelligence, approval: job.approval || stored.approval || null };
    return { ...buildPublicationRecord({ projectId: job.projectId, analysis, research, architecture, chapters, approval: job.approval }), coverBrief: coverBrief || null, intelligence };
  }

  async preview(job) {
    if (!["awaiting-cover-approval", "completed"].includes(job.status) && !["preview", "packaging", "delivery"].includes(job.stage)) return null;
    const [first, product] = await Promise.all([this.state.storage.get("chapter:0"), this.state.storage.get("product")]);
    const coverExtension = job.cover?.type === "image/jpeg" ? "jpg" : "png";
    return {
      coverURL: `/api/publishing/jobs/${job.projectId}/artifacts/cover-preview.${coverExtension}`,
      manuscriptExcerpt: String(first?.content || "").replace(/^#+\s+/gm, "").slice(0, 1_800),
      title: job.title,
      subtitle: job.subtitle,
      author: "Michael King",
      wordCount: job.wordCount,
      pageCount: job.pageCount,
      approvalRequired: job.status === "awaiting-cover-approval" && !job.coverProvided,
      coverProvided: Boolean(job.coverProvided),
      product: product ? { handle: product.handle, valueProposition: product.valueProposition, shortDescription: product.shortDescription, benefits: product.benefits, insideTheBook: product.insideTheBook, seo: product.seo } : null,
    };
  }
}

async function createPublishingJob(request, env) {
  if (!env.KAIROS_PROJECTS) return json({ status: "needs-attention", error: { code: "native_project_storage_unavailable", message: "Kairos native project storage is not configured." } }, 503);
  const payload = await safeRequestJSON(request);
  const projectId = crypto.randomUUID();
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(projectId));
  return stub.fetch("https://kairos.internal/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, projectId }) });
}

async function forwardToProject(request, env, projectId, path) {
  if (!env.KAIROS_PROJECTS) return json({ error: { code: "native_project_storage_unavailable", message: "Kairos native project storage is not configured." } }, 503);
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(projectId));
  const init = { method: request.method, headers: request.headers };
  if (!["GET", "HEAD"].includes(request.method)) init.body = await request.text();
  return stub.fetch(`https://kairos.internal${path}`, init);
}

function nativeCapabilities(env) {
  const enhancedInference = inferenceRuntime(env);
  return {
    nativeObjectiveAnalysis: "operational",
    nativePublicResearchAdapters: "operational",
    enhancedAccountScopedInference: enhancedInference.configured ? "operational" : "needs-configuration",
    selfHostedOpenWeightInference: enhancedInference.selfHosted ? "configured" : "optional-private-upgrade",
    nativeManuscriptComposition: enhancedInference.configured ? "model-enhanced" : "operational-deterministic",
    nativeTripleEditorialPass: enhancedInference.configured ? "model-enhanced" : "operational-deterministic",
    nativeCoverGeneration: "operational",
    approvedCoverIntake: "operational",
    nativeProductPagePackaging: "operational",
    coverDerivedProductAssets: "operational",
    nativeEPUBManufacturing: "operational",
    nativeKDPManufacturing: "operational",
    nativePreviewApproval: "operational",
    nativePublicationPackaging: "operational",
  };
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
    creationType: job.creationType || "book_package",
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null,
    engine: job.engine,
    externalInferenceAPI: false,
    enhancedInference: job.enhancedInference || "deterministic-fallback",
    inferenceMode: job.inferenceMode || "deterministic-native",
    inferenceProvider: job.inferenceProvider || "kairos-native",
    selfHostedInference: job.selfHostedInference || "not-configured",
    inferenceEngine: job.inferenceEngine || null,
    inferenceSummary: {
      completedTasks: Number(job.inferenceEvidence?.length || 0),
      fallbackTasks: Number(job.inferenceFailures?.length || 0),
      activeTask: job.inferenceJob ? { task: job.inferenceJob.task, submittedAt: job.inferenceJob.submittedAt } : null,
    },
    manuscriptRequired: false,
    sourceAssetsRequired: false,
    coverProvided: Boolean(job.coverProvided),
    cover: job.cover ? { name: job.cover.name, type: job.cover.type, bytes: job.cover.bytes, filename: job.cover.filename } : null,
    wordCount: job.wordCount || null,
    pageCount: job.pageCount || null,
    quality: job.quality || null,
    approval: job.approval || null,
    productSummary: job.productSummary || null,
    artifacts: job.status === "completed" ? (job.artifacts || creationArtifactNames(job.cover)).map(name => ({ name, url: `/api/publishing/jobs/${job.projectId}/artifacts/${name}` })) : [],
    stages: job.stages || [],
    error: job.error || null,
    pollURL: `/api/publishing/jobs/${job.projectId}`,
  };
}

function stageLedger(active) {
  const definitions = [
    ["research", "Research"], ["architecture", "Architecture"], ["manuscript", "Manuscript"], ["editorial", "Three-pass editorial"], ["design", "Cover integration"], ["manufacturing", "KDP manufacturing"], ["product", "Product page and assets"], ["qa", "QA and preflight"], ["preview", "Preview and approval"], ["packaging", "Packaging"], ["delivery", "Delivery"],
  ];
  return definitions.map(([id, label]) => ({ id, label, status: id === active ? "working" : "pending" }));
}

function updateStageLedger(stages, active, status) {
  const order = (stages || stageLedger(active)).map(stage => stage.id);
  const activeIndex = order.indexOf(active);
  return (stages || stageLedger(active)).map((stage, index) => ({ ...stage, status: stage.id === active ? status : index < activeIndex ? "completed" : "pending" }));
}

function isPublicationObjective(objective) { return /\b(book|manuscript|author|chapter|kdp|paperback|ebook|publication|publish)\b/i.test(objective); }
function nativeInferenceState(env) { return inferenceRuntime(env).selfHosted ? "configured" : "not-configured"; }

function ledgerToken(value, label) {
  const token = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(token)) throw engineError(400, "ledger_key_invalid", `Kairos requires a valid ${label}.`);
  return token;
}
function inferenceRequestId(job, unit) { return `${job.projectId}:${String(unit).replace(/[^A-Za-z0-9_.:-]/g, "-")}`.slice(0, 128); }
function inferenceBookContext(analysis) {
  return {
    idea: analysis.idea,
    title: analysis.title,
    topic: analysis.topic,
    audience: analysis.audience,
    concepts: analysis.concepts,
    promise: analysis.promise,
    author: analysis.author,
    publisher: analysis.publisher,
  };
}
function inferencePrompt(request) {
  const shared = "You are Kairos, Mindset Media Group's private intelligence runtime operating on Kairos-controlled infrastructure. Never use or recommend an external model provider. Use only the supplied direct-source evidence, distinguish evidence from inference, avoid invented claims, and return only the requested production content.";
  const context = JSON.stringify(request.context || {});
  if (request.task === "chapter") return {
    system: shared + " Write one substantive beginner-friendly book chapter in Markdown. Use exactly these level-two headings in this order and exactly once: Core Principle; Why It Matters; A Practical Framework; How to Apply It; Common Failure Patterns; MMG Tool; Action Step; Chapter Summary. Produce 1,100 to 2,300 words. Include practical examples, before-and-after prompt examples when relevant, a reusable tool, and a concrete exercise. Do not add a level-one title.",
    user: context,
    temperature: 0.45,
  };
  if (request.task === "editorial") return {
    system: shared + " Perform the specified editorial pass on the supplied chapter. Preserve its meaning, chapter title, and all eight required level-two headings exactly once and in the same order. Return only the complete revised chapter in Markdown and keep the word count within 72 to 135 percent of the supplied chapter.",
    user: context,
    temperature: 0.2,
  };
  if (request.task === "research_synthesis") return {
    system: shared + " Synthesize the supplied source records into a concise evidence map, durable themes, limitations, and manuscript guidance. Do not fabricate citations or facts.",
    user: context,
    temperature: 0.15,
  };
  if (request.task === "architecture_review") return {
    system: shared + " Review the supplied twelve-chapter editorial architecture for beginner clarity, progression, repetition, and promise delivery. Return a concise production review with concrete adjustments.",
    user: context,
    temperature: 0.2,
  };
  return {
    system: shared + " Create a concise art-direction and production brief grounded in the supplied book context. Do not change approved cover text or claim that visual files were generated.",
    user: context,
    temperature: 0.25,
  };
}
function inferredChapter(plan, chapterIndex, text, engine = KAIROS_SELF_HOSTED_INFERENCE_VERSION) {
  const content = normalizeModelMarkdown(text);
  validateRequiredChapter(content);
  const words = countWords(content);
  if (words < 1_100 || words > 2_300) throw new Error(`Model chapter failed the 1,100–2,300 word acceptance band (${words} words).`);
  return { number: chapterIndex + 1, title: plan.title, lens: plan.lens, content, generatedBy: engine, generatedAt: new Date().toISOString() };
}
function inferredEditorialPass(chapter, pass, text, engine = KAIROS_SELF_HOSTED_INFERENCE_VERSION) {
  const content = normalizeModelMarkdown(text);
  validateRequiredChapter(content);
  const originalWords = countWords(chapter.content);
  const editedWords = countWords(content);
  if (editedWords < Math.max(950, Math.floor(originalWords * 0.72)) || editedWords > Math.ceil(originalWords * 1.35)) throw new Error(`Editorial pass changed chapter length outside the governed acceptance band (${originalWords} to ${editedWords} words).`);
  return { ...chapter, content, generatedBy: chapter.generatedBy, editorialEngine: engine, editorialPasses: Math.max(Number(chapter.editorialPasses || 0), pass), editedAt: new Date().toISOString() };
}
function normalizeModelMarkdown(text) {
  let value = String(text || "").replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
  value = value.replace(/^#\s+[^\n]+\n+/, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!value) throw new Error("The model returned an empty manuscript section.");
  return value;
}
function validateRequiredChapter(content) {
  let cursor = -1;
  for (const heading of REQUIRED_CHAPTER_HEADINGS) {
    const matches = [...content.matchAll(new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "gmi"))];
    if (matches.length !== 1 || matches[0].index <= cursor) throw new Error(`The model output failed the required chapter heading contract at “${heading}”.`);
    cursor = matches[0].index;
  }
}
function countWords(value) { return (String(value || "").match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length; }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function validImageSignature(bytes, type) {
  if (type === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}
function sanitizeUploadName(value, type) {
  const fallback = type === "image/jpeg" ? "approved-cover.jpg" : "approved-cover.png";
  const name = String(value || fallback).normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return name || fallback;
}
function downloadFilename(title, name) { const prefix = String(title || "publication").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "publication"; return `${prefix}-${name}`; }
function retag(response) { const headers = new Headers(response.headers); headers.set("X-MMG-Runtime", BUILD); headers.set("X-Kairos-Kernel", "kairos-native-publishing-v1"); headers.set("X-Kairos-External-Inference", "false"); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
function json(value, status = 200, additionalHeaders = {}) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD, "X-Kairos-Kernel": "kairos-native-publishing-v1", "X-Kairos-External-Inference": "false", "X-Content-Type-Options": "nosniff", ...additionalHeaders } }); }
function failure(error) { const status = Number.isInteger(error?.status) ? error.status : 500; return json({ status: "needs-attention", error: { code: error?.code || "native_engine_error", message: safeMessage(error) } }, status); }
async function safeRequestJSON(request) { try { const value = await request.json(); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } }
async function safeJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return {}; } }
function safeMessage(error) { return error instanceof Error ? error.message.slice(0, 1200) : "Kairos native intelligence encountered an unexpected error."; }
function engineError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
