export const KAIROS_REVENUE_LIVE_CONTROLLER_BUILD = "kairos-revenue-live-controller-20260728-1";

export function createRevenueLiveController(options = {}) {
  const fetcher = options.fetcher || globalThis.fetch?.bind(globalThis);
  if (!fetcher) throw new Error("A revenue runtime fetcher is required.");

  async function load(runId) {
    const response = await fetcher(`/api/kairos/revenue/first-runs/${encodeURIComponent(runId)}/status`, {
      method: "GET",
      headers: operatorHeaders(options),
      cache: "no-store",
    });
    return parse(response);
  }

  async function executeNext(runId, input = {}) {
    if (!input.confirmation) throw new Error("The exact stage confirmation is required.");
    const response = await fetcher(`/api/kairos/revenue/first-runs/${encodeURIComponent(runId)}/execute-next`, {
      method: "POST",
      headers: { ...operatorHeaders(options), "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: input.confirmation, rationale: input.rationale || "Execute the next governed revenue stage.", operatorIdentityHash: input.operatorIdentityHash || options.operatorIdentityHash || "" }),
    });
    return parse(response);
  }

  return Object.freeze({ load, executeNext, build: KAIROS_REVENUE_LIVE_CONTROLLER_BUILD });
}

export function projectRevenueLiveView(payload = {}) {
  const run = payload.run || payload.updatedRun || {};
  const product = payload.product || payload.updatedProduct || {};
  const stages = Array.isArray(run.stages) ? run.stages : [];
  const completed = new Set(Array.isArray(run.completedStageIds) ? run.completedStageIds : []);
  const current = stages.find((stage) => !completed.has(stage.id)) || null;
  const jobs = Array.isArray(product.productionJobs) ? product.productionJobs : [];
  const assets = Array.isArray(product.assets) ? product.assets : [];

  return Object.freeze({
    runId: run.runId || null,
    revenueProductId: run.revenueProductId || product.revenueProductId || null,
    state: run.state || "unknown",
    currentStage: current?.id || run.currentStage || null,
    exactConfirmation: current?.confirmation || payload.requiredConfirmation || null,
    completedStages: completed.size,
    totalStages: stages.length,
    progressPercent: stages.length ? Math.round((completed.size / stages.length) * 100) : 0,
    jobs: Object.freeze({ total: jobs.length, authorized: jobs.filter((job) => job.authorization?.status === "authorized").length, completed: jobs.filter((job) => job.state === "completed").length }),
    assets: Object.freeze({ total: assets.length, ready: assets.filter((asset) => asset.status === "ready" && asset.storageRef && asset.checksum).length }),
    blockers: Object.freeze(Array.isArray(payload.blockers) ? payload.blockers : []),
    stageReceipts: Object.freeze((Array.isArray(run.stageReceipts) ? run.stageReceipts : []).slice(-20)),
    canExecute: Boolean(current && (current.confirmation || payload.requiredConfirmation) && !payload.blockers?.length),
    automaticPublicationAllowed: false,
    build: KAIROS_REVENUE_LIVE_CONTROLLER_BUILD,
  });
}

function operatorHeaders(options) {
  return {
    Authorization: options.authorization || "",
    "CF-Access-Authenticated-User-Email": options.operatorEmail || "",
    "X-Kairos-Operator-Identity": options.operatorIdentityHash || "",
  };
}

async function parse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || "Revenue runtime request failed."), { status: response.status, code: body?.error?.code || "REVENUE_RUNTIME_FAILED" });
  return body;
}
