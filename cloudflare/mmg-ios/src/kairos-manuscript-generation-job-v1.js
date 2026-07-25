export const KAIROS_MANUSCRIPT_GENERATION_BUILD = "kairos-manuscript-generation-job-20260725-3-workflow";
export const KAIROS_MANUSCRIPT_WORKFLOW_VERSION = "manuscript-generation-v1";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const TARGET_WORDS = 25500;
const MAX_STEPS = 32;
const CHUNK_BYTES = 96 * 1024;
const JOB_INDEX_KEY = "manuscript-generation:index";

export async function handleManuscriptGeneration(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/generation-job$/i);
  if (!match) return null;
  if (!env?.KAIROS_PROJECTS) {
    return json({
      status: "failed",
      error: {
        code: "generation_storage_unavailable",
        message: "Kairos project storage is unavailable.",
      },
    }, 503);
  }
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
  return stub.fetch(new Request(`https://kairos.internal/registry/manuscripts/${match[1]}/generation-job`, request));
}

export async function handleManuscriptGenerationObjectRequest(state, env, request) {
  const url = new URL(request.url);
  const workflowMatch = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/workflow-generation\/(start|context|output|finalize|fail)$/i);
  if (workflowMatch) {
    const projectId = workflowMatch[1].toLowerCase();
    const operation = workflowMatch[2].toLowerCase();
    try {
      const body = request.method === "POST" ? await readJSON(request) : {};
      if (request.method !== "POST") {
        return json({
          status: "failed",
          error: {
            code: "generation_method_not_allowed",
            message: "This workflow-generation method is not allowed.",
          },
        }, 405);
      }
      if (operation === "start") return startWorkflowJob(state, env, projectId, body);
      if (operation === "context") return readWorkflowContext(state, projectId, body);
      if (operation === "output") return storeWorkflowOutput(state, projectId, body);
      if (operation === "finalize") return finalizeWorkflowJob(state, projectId);
      if (operation === "fail") return failWorkflowJob(state, projectId, body);
    } catch (error) {
      return json({
        status: "failed",
        build: KAIROS_MANUSCRIPT_GENERATION_BUILD,
        error: {
          code: error?.code || "generation_workflow_failed",
          message: error?.message || "Durable manuscript generation failed.",
        },
      }, Number(error?.status || 500));
    }
  }

  const match = url.pathname.match(/^\/registry\/manuscripts\/([a-z0-9-]{8,})\/generation-job$/i);
  if (!match) return null;
  const projectId = match[1];
  try {
    if (request.method === "GET") return readJob(state, projectId);
    if (request.method === "POST") return startJob(state, env, projectId);
    if (request.method === "DELETE") return cancelJob(state, projectId);
    return json({
      status: "failed",
      error: {
        code: "generation_method_not_allowed",
        message: "This generation-job method is not allowed.",
      },
    }, 405);
  } catch (error) {
    return json({
      status: "failed",
      build: KAIROS_MANUSCRIPT_GENERATION_BUILD,
      error: {
        code: error?.code || "generation_job_failed",
        message: error?.message || "Backend manuscript generation failed.",
      },
    }, Number(error?.status || 500));
  }
}

export async function beginManuscriptGenerationWorkflow(env, input = {}) {
  const projectId = normalizeProjectId(input.projectId);
  return registryRequest(env, projectId, "start", {
    workflowInstanceId: String(input.workflowInstanceId || "").trim(),
    requestedBy: String(input.requestedBy || "kairos-owner").trim().slice(0, 120),
    requestedAt: input.requestedAt || new Date().toISOString(),
  });
}

export async function executeManuscriptGenerationWorkflowUnit(env, input = {}) {
  const projectId = normalizeProjectId(input.projectId);
  const stepIndex = normalizeStep(input.step);
  const context = await registryRequest(env, projectId, "context", { step: stepIndex });
  if (context.done || context.alreadyStored) return context;

  const generated = await generateManuscriptExpansion(env, context);
  return registryRequest(env, projectId, "output", {
    step: stepIndex,
    text: generated.text,
    words: generated.words,
    sectionTitle: generated.sectionTitle,
    provider: generated.provider,
    model: generated.model,
  });
}

export async function finalizeManuscriptGenerationWorkflow(env, input = {}) {
  const projectId = normalizeProjectId(input.projectId);
  return registryRequest(env, projectId, "finalize", {
    workflowInstanceId: String(input.workflowInstanceId || "").trim(),
  });
}

export async function failManuscriptGenerationWorkflow(env, input = {}) {
  const projectId = normalizeProjectId(input.projectId);
  return registryRequest(env, projectId, "fail", {
    code: String(input.code || "generation_workflow_failed").slice(0, 120),
    message: String(input.message || "Durable manuscript generation failed.").slice(0, 2000),
    workflowInstanceId: String(input.workflowInstanceId || "").trim(),
  });
}

export async function generateManuscriptExpansion(env, context = {}) {
  const provider = providerConfig(env);
  assertProvider(provider);
  const section = context.section;
  if (!section?.content) throw fail(409, "generation_section_missing", "The durable workflow could not load the source section.");
  const stepIndex = normalizeStep(context.step);
  const cycle = Number(context.cycle || 1);
  const text = cleanOutput(await generate(provider, buildPrompt(section, cycle, stepIndex)));
  const words = countWords(text);
  if (words < 250) throw fail(502, "generation_step_incomplete", "The backend model returned an incomplete section.");
  return {
    step: stepIndex,
    text,
    words,
    sectionTitle: section.title,
    provider: provider.provider,
    model: provider.model,
  };
}

export async function resumeManuscriptGenerationAlarm(state, env) {
  const index = Array.from(new Set(await state.storage.get(JOB_INDEX_KEY) || []));
  const projectId = index[0];
  if (!projectId) return false;
  const job = await state.storage.get(jobKey(projectId));
  if (!job || !["queued", "running"].includes(job.status) || job.executionMode === KAIROS_MANUSCRIPT_WORKFLOW_VERSION) {
    await state.storage.put(JOB_INDEX_KEY, index.slice(1));
    if (index.length > 1) await state.storage.setAlarm(Date.now() + 1000);
    return true;
  }
  await runOneStep(state, env, projectId, job);
  const updated = await state.storage.get(jobKey(projectId));
  const remaining = updated?.status === "running" ? [projectId, ...index.slice(1)] : index.slice(1);
  await state.storage.put(JOB_INDEX_KEY, remaining);
  if (remaining.length) await state.storage.setAlarm(Date.now() + 1500);
  return true;
}

async function startJob(state, env, projectId) {
  const provider = providerConfig(env);
  assertProvider(provider);
  const metadata = await state.storage.get(`manuscript:${projectId}:metadata`);
  if (!metadata) throw fail(409, "generation_source_required", "Store the authoritative manuscript before starting production.");
  const existing = await state.storage.get(jobKey(projectId));
  if (existing && ["queued", "running", "completed"].includes(existing.status)) {
    return json({
      status: existing.status,
      build: KAIROS_MANUSCRIPT_GENERATION_BUILD,
      projectId,
      job: existing,
    }, existing.status === "completed" ? 200 : 202);
  }
  const sourceBytes = await getChunks(state, `manuscript:${projectId}:text:`, Number(metadata.textChunks || 0), Number(metadata.textBytes || 0));
  const source = new TextDecoder().decode(sourceBytes).trim();
  if (source.length < 500) throw fail(400, "generation_source_incomplete", "The authoritative manuscript is too short for backend generation.");
  const sections = splitSections(source);
  const now = new Date().toISOString();
  const job = {
    build: KAIROS_MANUSCRIPT_GENERATION_BUILD,
    projectId,
    status: "queued",
    executionMode: "legacy-alarm-v1",
    provider: provider.provider,
    model: provider.model,
    step: 0,
    maxSteps: MAX_STEPS,
    targetWords: TARGET_WORDS,
    sourceWords: countWords(source),
    generatedWords: 0,
    totalWords: countWords(source),
    sourceChecksum: metadata.checksum || null,
    sections,
    createdAt: now,
    updatedAt: now,
    error: null,
  };
  await state.storage.put(jobKey(projectId), job);
  const index = Array.from(new Set([...(await state.storage.get(JOB_INDEX_KEY) || []), projectId]));
  await state.storage.put(JOB_INDEX_KEY, index);
  await state.storage.setAlarm(Date.now() + 500);
  return json({ status: "queued", build: KAIROS_MANUSCRIPT_GENERATION_BUILD, projectId, job }, 202);
}

async function startWorkflowJob(state, env, projectId, input) {
  const provider = providerConfig(env);
  assertProvider(provider);
  const metadata = await state.storage.get(`manuscript:${projectId}:metadata`);
  if (!metadata) throw fail(409, "generation_source_required", "Store the authoritative manuscript before starting production.");
  const existing = await state.storage.get(jobKey(projectId));
  if (existing && existing.status === "completed") {
    return json({ status: "completed", build: KAIROS_MANUSCRIPT_GENERATION_BUILD, projectId, job: existing }, 200);
  }
  if (existing && ["queued", "running"].includes(existing.status)) {
    if (existing.executionMode === KAIROS_MANUSCRIPT_WORKFLOW_VERSION) {
      return json({ status: existing.status, build: KAIROS_MANUSCRIPT_GENERATION_BUILD, projectId, job: existing, reused: true }, 202);
    }
    throw fail(409, "generation_job_conflict", "A legacy manuscript generation job is already active for this project.");
  }

  const sourceBytes = await getChunks(state, `manuscript:${projectId}:text:`, Number(metadata.textChunks || 0), Number(metadata.textBytes || 0));
  const source = new TextDecoder().decode(sourceBytes).trim();
  if (source.length < 500) throw fail(400, "generation_source_incomplete", "The authoritative manuscript is too short for backend generation.");
  for (let index = 0; index < MAX_STEPS; index += 1) await state.storage.delete(outputKey(projectId, index));

  const now = new Date().toISOString();
  const job = {
    build: KAIROS_MANUSCRIPT_GENERATION_BUILD,
    workflowVersion: KAIROS_MANUSCRIPT_WORKFLOW_VERSION,
    workflowInstanceId: String(input.workflowInstanceId || "").trim() || null,
    projectId,
    status: "running",
    executionMode: KAIROS_MANUSCRIPT_WORKFLOW_VERSION,
    provider: provider.provider,
    model: provider.model,
    step: 0,
    maxSteps: MAX_STEPS,
    targetWords: TARGET_WORDS,
    sourceWords: countWords(source),
    generatedWords: 0,
    totalWords: countWords(source),
    sourceChecksum: metadata.checksum || null,
    sections: splitSections(source),
    requestedBy: String(input.requestedBy || "kairos-owner").slice(0, 120),
    requestedAt: input.requestedAt || now,
    createdAt: now,
    updatedAt: now,
    phase: "Durable workflow initialized",
    error: null,
  };
  await state.storage.put(jobKey(projectId), job);
  return json({ status: "running", build: KAIROS_MANUSCRIPT_GENERATION_BUILD, projectId, job }, 202);
}

async function readWorkflowContext(state, projectId, input) {
  const requestedStep = normalizeStep(input.step);
  const job = await state.storage.get(jobKey(projectId));
  if (!job) throw fail(404, "generation_job_not_found", "No durable manuscript generation job exists for this project.");
  if (job.executionMode !== KAIROS_MANUSCRIPT_WORKFLOW_VERSION) {
    throw fail(409, "generation_execution_mode_mismatch", "This project is not running the durable manuscript workflow.");
  }
  if (job.status === "completed") return json({ status: "completed", projectId, done: true, job });
  if (["failed", "cancelled"].includes(job.status)) {
    throw fail(409, "generation_job_terminal", `The durable manuscript workflow is ${job.status}.`);
  }

  const metadata = await state.storage.get(`manuscript:${projectId}:metadata`);
  if (!metadata) throw fail(409, "generation_source_missing", "The authoritative manuscript metadata disappeared.");
  if (job.sourceChecksum && metadata.checksum && String(job.sourceChecksum) !== String(metadata.checksum)) {
    throw fail(409, "generation_source_changed", "The authoritative manuscript changed after the workflow began.");
  }
  if (job.totalWords >= job.targetWords || job.step >= job.maxSteps) {
    return json({ status: "ready_to_finalize", projectId, done: true, job });
  }
  if (requestedStep < Number(job.step || 0)) {
    return json({ status: "already_stored", projectId, done: false, alreadyStored: true, step: requestedStep, job });
  }
  if (requestedStep > Number(job.step || 0)) {
    throw fail(409, "generation_step_out_of_order", "The durable manuscript workflow attempted to skip an expansion unit.");
  }

  const section = job.sections[requestedStep % job.sections.length];
  const cycle = Math.floor(requestedStep / job.sections.length) + 1;
  return json({
    status: "ready",
    projectId,
    done: false,
    alreadyStored: false,
    step: requestedStep,
    cycle,
    section,
    job: publicJob(job),
  });
}

async function storeWorkflowOutput(state, projectId, input) {
  const stepIndex = normalizeStep(input.step);
  const job = await state.storage.get(jobKey(projectId));
  if (!job) throw fail(404, "generation_job_not_found", "No durable manuscript generation job exists for this project.");
  if (job.executionMode !== KAIROS_MANUSCRIPT_WORKFLOW_VERSION) {
    throw fail(409, "generation_execution_mode_mismatch", "This project is not running the durable manuscript workflow.");
  }
  if (Number(job.step || 0) > stepIndex) {
    return json({ status: "already_stored", projectId, done: false, alreadyStored: true, step: stepIndex, job });
  }
  if (Number(job.step || 0) !== stepIndex) {
    throw fail(409, "generation_step_out_of_order", "The durable manuscript output arrived out of order.");
  }

  const text = cleanOutput(input.text);
  const words = countWords(text);
  if (words < 250) throw fail(502, "generation_step_incomplete", "The backend model returned an incomplete section.");
  const section = job.sections[stepIndex % job.sections.length];
  await state.storage.put(outputKey(projectId, stepIndex), `# Backend Expansion ${stepIndex + 1}: ${section.title}\n\n${text}`);
  const next = {
    ...job,
    status: "running",
    step: stepIndex + 1,
    generatedWords: Number(job.generatedWords || 0) + words,
    totalWords: Number(job.totalWords || 0) + words,
    attempts: 0,
    phase: `Expansion unit ${stepIndex + 1} stored and verified`,
    updatedAt: new Date().toISOString(),
    error: null,
  };
  await state.storage.put(jobKey(projectId), next);
  return json({
    status: "stored",
    projectId,
    done: next.totalWords >= next.targetWords || next.step >= next.maxSteps,
    alreadyStored: false,
    step: stepIndex,
    job: next,
  });
}

async function finalizeWorkflowJob(state, projectId) {
  const job = await state.storage.get(jobKey(projectId));
  if (!job) throw fail(404, "generation_job_not_found", "No durable manuscript generation job exists for this project.");
  if (job.status === "completed") return json({ status: "completed", projectId, job });
  if (job.executionMode !== KAIROS_MANUSCRIPT_WORKFLOW_VERSION) {
    throw fail(409, "generation_execution_mode_mismatch", "This project is not running the durable manuscript workflow.");
  }
  if (job.totalWords < job.targetWords && job.step < job.maxSteps) {
    throw fail(409, "generation_not_ready_to_finalize", "The durable manuscript workflow has not reached its completion threshold.");
  }
  const metadata = await state.storage.get(`manuscript:${projectId}:metadata`);
  if (!metadata) throw fail(409, "generation_source_missing", "The authoritative manuscript metadata disappeared.");
  const completed = await completeJob(state, projectId, job, metadata);
  return json({ status: "completed", projectId, job: completed });
}

async function failWorkflowJob(state, projectId, input) {
  const job = await state.storage.get(jobKey(projectId));
  if (!job) throw fail(404, "generation_job_not_found", "No durable manuscript generation job exists for this project.");
  const failed = await failJob(
    state,
    projectId,
    job,
    String(input.code || "generation_workflow_failed").slice(0, 120),
    String(input.message || "Durable manuscript generation failed.").slice(0, 2000),
  );
  return json({ status: "failed", projectId, job: failed });
}

async function runOneStep(state, env, projectId, job) {
  const provider = providerConfig(env);
  if (provider.provider === "deterministic") {
    return failJob(state, projectId, job, "generation_provider_missing", "The configured backend model provider is unavailable.");
  }
  const metadata = await state.storage.get(`manuscript:${projectId}:metadata`);
  if (!metadata) return failJob(state, projectId, job, "generation_source_missing", "The authoritative manuscript metadata disappeared.");
  if (job.sourceChecksum && metadata.checksum && String(job.sourceChecksum) !== String(metadata.checksum)) {
    return failJob(state, projectId, job, "generation_source_changed", "The authoritative manuscript changed after the job began.");
  }
  if (job.totalWords >= job.targetWords || job.step >= job.maxSteps) return completeJob(state, projectId, job, metadata);
  const section = job.sections[job.step % job.sections.length];
  const cycle = Math.floor(job.step / job.sections.length) + 1;
  const running = {
    ...job,
    status: "running",
    phase: `Writing section ${job.step + 1} of up to ${job.maxSteps}`,
    updatedAt: new Date().toISOString(),
    error: null,
  };
  await state.storage.put(jobKey(projectId), running);
  try {
    const text = cleanOutput(await generate(provider, buildPrompt(section, cycle, job.step)));
    const words = countWords(text);
    if (words < 250) throw new Error("The backend model returned an incomplete section.");
    await state.storage.put(outputKey(projectId, job.step), `# Backend Expansion ${job.step + 1}: ${section.title}\n\n${text}`);
    await state.storage.put(jobKey(projectId), {
      ...running,
      step: job.step + 1,
      generatedWords: job.generatedWords + words,
      totalWords: job.totalWords + words,
      attempts: 0,
      phase: "Section stored and verified",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const attempts = Number(job.attempts || 0) + 1;
    if (attempts < 3) {
      await state.storage.put(jobKey(projectId), {
        ...running,
        attempts,
        error: { code: "generation_step_retry", message: String(error?.message || error) },
        updatedAt: new Date().toISOString(),
      });
    } else {
      await failJob(state, projectId, running, "generation_step_failed", String(error?.message || error));
    }
  }
}

async function completeJob(state, projectId, job, metadata) {
  const sourceBytes = await getChunks(state, `manuscript:${projectId}:text:`, Number(metadata.textChunks || 0), Number(metadata.textBytes || 0));
  const source = new TextDecoder().decode(sourceBytes).trim();
  const generated = [];
  for (let index = 0; index < job.step; index += 1) {
    const value = await state.storage.get(outputKey(projectId, index));
    if (value) generated.push(String(value));
  }
  const manuscript = `${source}\n\n# Expanded Digital Asset Edition\n\n${generated.join("\n\n")}`.trim();
  const bytes = new TextEncoder().encode(manuscript);
  const backup = await state.storage.get(`manuscript:${projectId}:original-text:metadata`);
  if (!backup) {
    const chunks = await putChunks(state, `manuscript:${projectId}:original-text:`, sourceBytes);
    await state.storage.put(`manuscript:${projectId}:original-text:metadata`, {
      chunks,
      byteSize: sourceBytes.length,
      wordCount: countWords(source),
      sha256: await digestHex(sourceBytes),
      backedUpAt: new Date().toISOString(),
    });
  }
  await removeChunks(state, `manuscript:${projectId}:text:`, Number(metadata.textChunks || 0));
  const textChunks = await putChunks(state, `manuscript:${projectId}:text:`, bytes);
  const now = new Date().toISOString();
  const externalPaidAPIUsed = ["openai", "openai-compatible"].includes(job.provider);
  const inference = {
    build: KAIROS_MANUSCRIPT_GENERATION_BUILD,
    workflowVersion: job.workflowVersion || null,
    workflowInstanceId: job.workflowInstanceId || null,
    provider: `backend-${job.provider}`,
    model: job.model,
    sourceChecksum: metadata.checksum || null,
    outputSha256: await digestHex(bytes),
    wordCount: countWords(manuscript),
    characterCount: manuscript.length,
    generatedAt: now,
    noCost: !externalPaidAPIUsed,
    externalPaidAPIUsed,
    cloudflareNeuronsUsed:0,
  };
  await state.storage.put(`manuscript:${projectId}:metadata`, {
    ...metadata,
    textChunks,
    textBytes: bytes.length,
    wordCount: inference.wordCount,
    updatedAt: now,
    localInference: inference,
  });
  await state.storage.put(`manuscript:${projectId}:local-inference`, inference);
  const completed = {
    ...job,
    status: "completed",
    phase: "Backend manuscript complete",
    totalWords: inference.wordCount,
    completedAt: now,
    updatedAt: now,
    inference,
    error: null,
  };
  await state.storage.put(jobKey(projectId), completed);
  return completed;
}

async function readJob(state, projectId) {
  const job = await state.storage.get(jobKey(projectId));
  return job
    ? json({ status: job.status, build: KAIROS_MANUSCRIPT_GENERATION_BUILD, projectId, job })
    : json({
        status: "not-found",
        error: {
          code: "generation_job_not_found",
          message: "No backend manuscript generation job exists for this project.",
        },
      }, 404);
}

async function cancelJob(state, projectId) {
  const job = await state.storage.get(jobKey(projectId));
  if (!job) return readJob(state, projectId);
  const updated = { ...job, status: "cancelled", updatedAt: new Date().toISOString() };
  await state.storage.put(jobKey(projectId), updated);
  return json({ status: "cancelled", projectId, job: updated });
}

async function failJob(state, projectId, job, code, message) {
  const failed = {
    ...job,
    status: "failed",
    phase: "Generation stopped",
    error: { code, message },
    updatedAt: new Date().toISOString(),
  };
  await state.storage.put(jobKey(projectId), failed);
  return failed;
}

function providerConfig(env) {
  const provider = String(env?.KAIROS_MODEL_PROVIDER || "deterministic").toLowerCase();
  return {
    provider,
    endpoint: String(env?.KAIROS_MODEL_ENDPOINT || "").replace(/\/$/, ""),
    model: String(env?.KAIROS_MODEL_NAME || env?.KAIROS_OPENAI_MODEL || "gpt-5-mini"),
    token: String(env?.KAIROS_MODEL_AUTH_TOKEN || env?.OPENAI_API_KEY || ""),
  };
}

function assertProvider(provider) {
  if (provider.provider === "deterministic") {
    throw fail(503, "generation_provider_required", "Backend manuscript generation requires the configured OpenAI or Ollama-compatible provider. Kairos will not fall back to the iPhone runtime.");
  }
  if (!provider.endpoint) throw fail(503, "generation_endpoint_required", "KAIROS_MODEL_ENDPOINT is not configured.");
  if (provider.provider === "openai" && !provider.token) {
    throw fail(503, "generation_api_key_required", "OPENAI_API_KEY is not configured in the Kairos Worker.");
  }
}

async function generate(config, prompt) {
  if (!config.endpoint) throw new Error("KAIROS_MODEL_ENDPOINT is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    if(config.provider==="ollama") {
      const response = await fetch(`${config.endpoint}/api/generate`, {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({ model: config.model, stream: false, prompt, options: { temperature: 0.35 } }),
        signal: controller.signal,
      });
      const body = await requireJSON(response);
      return body.response || "";
    }
    if(config.provider==="openai") {
      const response = await fetch(`${config.endpoint}/v1/responses`, {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({
          model: config.model,
          instructions: "You are Kairos, the source-grounded editorial engine for Mindset Media Group. Return only polished customer-facing manuscript content. Never invent facts, citations, statistics, guarantees, private URLs, people, products, or events.",
          input: prompt,
          max_output_tokens: 5000,
        }),
        signal: controller.signal,
      });
      const body = await requireJSON(response);
      return extractOpenAIText(body);
    }
    if(config.provider==="openai-compatible") {
      const response = await fetch(`${config.endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({
          model: config.model,
          temperature: 0.35,
          messages: [
            {
              role: "system",
              content: "You are Kairos, the source-grounded editorial engine for Mindset Media Group. Return only polished customer-facing manuscript content. Never invent facts, citations, statistics, guarantees, private URLs, people, products, or events.",
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
      const body = await requireJSON(response);
      return body?.choices?.[0]?.message?.content || "";
    }
    throw new Error(`Unsupported backend model provider: ${config.provider}`);
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpenAIText(body) {
  if (typeof body?.output_text === "string") return body.output_text;
  const parts = [];
  for (const item of body?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content?.text) parts.push(content.text);
    }
  }
  return parts.join("\n\n");
}

function headers(config) {
  const value = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Kairos-Client": KAIROS_MANUSCRIPT_GENERATION_BUILD,
  };
  if (config.token) value.Authorization = `Bearer ${config.token}`;
  return value;
}

async function requireJSON(response) {
  const text = await response.text();
  if (!response.ok) {
    let detail = "";
    try {
      detail = JSON.parse(text)?.error?.message || "";
    } catch {}
    throw new Error(`Backend model returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Backend model returned unreadable output.");
  }
}

function splitSections(text) {
  const blocks = String(text)
    .replace(/\r\n?/g, "\n")
    .split(/(?=^(?:#{1,3}\s+|Chapter\s+\d+|Introduction\b|Conclusion\b))/gim)
    .map((value) => value.trim())
    .filter(Boolean);
  return (blocks.length ? blocks : String(text).split(/\n{2,}/).filter(Boolean))
    .slice(0, 24)
    .map((content, index) => ({
      title: (content.split("\n").find(Boolean) || `Section ${index + 1}`).replace(/^#{1,3}\s+/, "").slice(0, 120),
      content: content.slice(0, 7000),
    }));
}

function buildPrompt(section, cycle, step) {
  const focus = [
    "core principle, practical workflow, and decision rules",
    "worked example, diagnostic method, and common failure patterns",
    "implementation workbook, checklist, and measurable completion standard",
    "advanced application, quality control, and repeatable operating procedure",
  ][(cycle - 1) % 4];
  return `SOURCE SECTION TITLE: ${section.title}\nEXPANSION PASS: ${cycle}\nFOCUS: ${focus}\n\nSOURCE MATERIAL:\n${section.content}\n\nWrite 850 to 1150 words of new, non-repetitive customer-facing instructional content grounded strictly in the source. Use clear Markdown subheadings. Preserve terminology and practical intent. Do not add unsupported facts. This is expansion unit ${step + 1}; return only finished content.`;
}

function cleanOutput(value) {
  return String(value || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function publicJob(job) {
  return {
    projectId: job.projectId,
    status: job.status,
    executionMode: job.executionMode,
    workflowVersion: job.workflowVersion,
    workflowInstanceId: job.workflowInstanceId,
    provider: job.provider,
    model: job.model,
    step: job.step,
    maxSteps: job.maxSteps,
    targetWords: job.targetWords,
    sourceWords: job.sourceWords,
    generatedWords: job.generatedWords,
    totalWords: job.totalWords,
    sourceChecksum: job.sourceChecksum,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    phase: job.phase,
    error: job.error,
  };
}

async function registryRequest(env, projectId, operation, body) {
  if (!env?.KAIROS_PROJECTS) throw fail(503, "generation_storage_unavailable", "Kairos project storage is unavailable.");
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
  const response = await stub.fetch(new Request(
    `https://kairos.internal/registry/manuscripts/${projectId}/workflow-generation/${operation}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    },
  ));
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    throw fail(502, "generation_registry_unreadable", "The manuscript registry returned unreadable workflow state.");
  }
  if (!response.ok) {
    throw fail(response.status, payload?.error?.code || "generation_registry_failed", payload?.error?.message || "The manuscript registry rejected the workflow operation.");
  }
  return payload;
}

async function readJSON(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw fail(400, "generation_json_invalid", "The workflow-generation request body must be valid JSON.");
  }
}

function normalizeProjectId(value) {
  const projectId = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{7,127}$/.test(projectId)) {
    throw fail(400, "generation_project_invalid", "A valid manuscript projectId is required.");
  }
  return projectId;
}

function normalizeStep(value) {
  const step = Number(value);
  if (!Number.isInteger(step) || step < 0 || step >= MAX_STEPS) {
    throw fail(400, "generation_step_invalid", "The manuscript workflow step is invalid.");
  }
  return step;
}

function jobKey(id) {
  return `manuscript:${id}:generation-job`;
}

function outputKey(id, step) {
  return `manuscript:${id}:generation-output:${step}`;
}

async function putChunks(state, prefix, bytes) {
  const count = Math.ceil(bytes.length / CHUNK_BYTES);
  for (let index = 0; index < count; index += 1) {
    await state.storage.put(`${prefix}${index}`, bytes.slice(index * CHUNK_BYTES, Math.min(bytes.length, (index + 1) * CHUNK_BYTES)));
  }
  return count;
}

async function getChunks(state, prefix, count, expectedLength) {
  const output = new Uint8Array(expectedLength);
  let offset = 0;
  for (let index = 0; index < Number(count || 0); index += 1) {
    const value = await state.storage.get(`${prefix}${index}`);
    if (!value) throw fail(502, "generation_chunk_missing", "A manuscript text chunk is missing.");
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    output.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== expectedLength) throw fail(502, "generation_length_mismatch", "The manuscript text failed integrity verification.");
  return output;
}

async function removeChunks(state, prefix, count) {
  for (let index = 0; index < Number(count || 0); index += 1) await state.storage.delete(`${prefix}${index}`);
}

function countWords(value) {
  return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length;
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Manuscript-Generation": KAIROS_MANUSCRIPT_GENERATION_BUILD,
      "X-Kairos-Manuscript-Workflow": KAIROS_MANUSCRIPT_WORKFLOW_VERSION,
    },
  });
}
