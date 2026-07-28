export const KAIROS_REVENUE_JOB_SEQUENCER_BUILD = "kairos-revenue-job-sequencer-20260727-1";

export function getKairosRevenueExecutionQueue(product = {}) {
  const jobs = Array.isArray(product.productionJobs) ? product.productionJobs : [];
  const completed = new Set(jobs.filter((job) => job.state === "completed").map((job) => job.jobId));
  const queue = jobs.map((job) => {
    const dependencies = normalizeDependencies(job);
    const unmetDependencies = dependencies.filter((dependency) => !completed.has(dependency));
    const authorized = job.authorization?.status === "authorized";
    const ready = job.state !== "completed" && authorized && unmetDependencies.length === 0;
    return Object.freeze({
      jobId: job.jobId,
      outputType: job.outputType,
      state: job.state,
      authorized,
      dependencies: Object.freeze(dependencies),
      unmetDependencies: Object.freeze(unmetDependencies),
      ready,
      blockedReason: ready ? null : job.state === "completed" ? "completed" : !authorized ? "authorization_required" : "dependencies_incomplete",
    });
  });
  const next = queue.find((item) => item.ready) || null;
  return Object.freeze({
    revenueProductId: product.revenueProductId || null,
    jobs: Object.freeze(queue),
    next,
    completedCount: completed.size,
    readyCount: queue.filter((item) => item.ready).length,
    blockedCount: queue.filter((item) => !item.ready && item.state !== "completed").length,
    build: KAIROS_REVENUE_JOB_SEQUENCER_BUILD,
  });
}

export function requireNextKairosRevenueJob(product = {}, requestedJobId = "") {
  const queue = getKairosRevenueExecutionQueue(product);
  const jobId = String(requestedJobId || queue.next?.jobId || "").trim();
  const entry = queue.jobs.find((item) => item.jobId === jobId);
  if (!entry) throw sequenceError("REVENUE_JOB_NOT_FOUND", "Revenue production job was not found.", 404);
  if (!entry.ready) throw sequenceError("REVENUE_JOB_NOT_READY", `Revenue job is blocked: ${entry.blockedReason}.`, 409);
  return Object.freeze({ queue, entry });
}

function normalizeDependencies(job = {}) {
  const values = job.dependencies || job.dependsOn || job.requiredJobIds || [];
  return (Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean).slice(0, 50);
}
function sequenceError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
