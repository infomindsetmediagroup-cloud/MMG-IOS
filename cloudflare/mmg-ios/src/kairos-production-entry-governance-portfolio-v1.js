import currentRuntime, {
  KairosProject as CurrentKairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-local-inference-v1.js";
import {
  handleKairosGovernancePortfolioAPI,
  handleKairosGovernancePortfolioObjectRequest,
  KAIROS_GOVERNANCE_PORTFOLIO_STORE_BUILD,
} from "./kairos-governance-portfolio-store-v1.js";
import { KAIROS_GOVERNANCE_PORTFOLIO_OVERSIGHT_BUILD } from "./kairos-governance-portfolio-oversight-v1.js";

export { KairosProjectAgent, KairosProjectFoundationWorkflow, KairosManuscriptGenerationWorkflow };

export class KairosProject extends CurrentKairosProject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const portfolio = await handleKairosGovernancePortfolioObjectRequest(this.state, request);
    if (portfolio) return stamp(portfolio);
    return stamp(await super.fetch(request));
  }
}

export default {
  async fetch(request, env, ctx) {
    const portfolio = await handleKairosGovernancePortfolioAPI(request.clone(), env);
    if (portfolio) return stamp(portfolio);
    return stamp(await currentRuntime.fetch(request, env, ctx));
  },

  async scheduled(controller, env, ctx) {
    if (typeof currentRuntime.scheduled === "function") {
      return currentRuntime.scheduled(controller, env, ctx);
    }
  },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Governance-Portfolio-Oversight", KAIROS_GOVERNANCE_PORTFOLIO_OVERSIGHT_BUILD);
  headers.set("X-Kairos-Governance-Portfolio-Store", KAIROS_GOVERNANCE_PORTFOLIO_STORE_BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
