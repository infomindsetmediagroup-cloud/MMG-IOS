import { describe, expect, it } from "vitest";
import { createKairosGovernancePortfolio, evaluateKairosGovernancePortfolio } from "../cloudflare/mmg-ios/src/kairos-governance-portfolio-oversight-v1.js";
import { handleKairosGovernancePortfolioAPI, handleKairosGovernancePortfolioObjectRequest } from "../cloudflare/mmg-ios/src/kairos-governance-portfolio-store-v1.js";

function state() {
  const values = new Map<string, unknown>();
  return { storage: { get: async (key: string) => values.get(key), put: async (key: string, value: unknown) => values.set(key, value) } } as any;
}

describe("Kairos governance portfolio oversight", () => {
  it("creates immutable bounded records without execution authority", () => {
    const record = createKairosGovernancePortfolio({ summary: { evidenceCoveragePercent: 84 } });
    expect(record.portfolioId.startsWith("kportfolio_")).toBe(true);
    expect(Object.isFrozen(record)).toBe(true);
    expect(record.deploymentExecutionAllowed).toBe(false);
    expect(record.rollbackExecutionAllowed).toBe(false);
    expect(record.automaticRemediationAllowed).toBe(false);
  });

  it("escalates critical risk, overdue obligations, and ineffective controls", () => {
    const record = createKairosGovernancePortfolio({ state: "review" });
    const critical = evaluateKairosGovernancePortfolio(record, { riskConcentrations: [{ level: "critical", status: "open" }] });
    expect(critical.state).toBe("at_risk");
    expect(critical.decision).toBe("escalate");
    const overdue = evaluateKairosGovernancePortfolio(record, { summary: { overdueObligations: 1 } });
    expect(overdue.decision).toBe("escalate");
    const ineffective = evaluateKairosGovernancePortfolio(record, { controlHealth: [{ effectiveness: "ineffective" }] });
    expect(ineffective.decision).toBe("escalate");
  });

  it("attests and closes only through explicit executive decisions", () => {
    const record = createKairosGovernancePortfolio({ state: "review" });
    const attested = evaluateKairosGovernancePortfolio(record, { executiveDecision: { attested: true, decidedAt: new Date().toISOString(), identityHash: "kid_test" } });
    expect(attested.state).toBe("attested");
    expect(attested.decision).toBe("attest");
    const closed = evaluateKairosGovernancePortfolio(attested, { executiveDecision: { closed: true, decidedAt: new Date().toISOString(), identityHash: "kid_test" } });
    expect(closed.state).toBe("closed");
    expect(closed.decision).toBe("close");
    expect(closed.executiveDecision.executionAuthorityGranted).toBe(false);
  });

  it("persists, lists, evaluates, and exports bounded records", async () => {
    const durable = state();
    const created = await handleKairosGovernancePortfolioObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-governance-portfolios", { method: "POST", body: JSON.stringify({ operation: "create", input: { portfolioId: "kportfolio_test", reportingWindow: { cadence: "monthly" } } }) }));
    expect(created?.status).toBe(201);
    const listed = await handleKairosGovernancePortfolioObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-governance-portfolios", { method: "POST", body: JSON.stringify({ operation: "list" }) }));
    expect((await listed!.json()).count).toBe(1);
    const evaluated = await handleKairosGovernancePortfolioObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-governance-portfolios", { method: "POST", body: JSON.stringify({ operation: "evaluate", portfolioId: "kportfolio_test", input: { summary: { overdueObligations: 1 } } }) }));
    expect((await evaluated!.json()).portfolio.state).toBe("at_risk");
    const exported = await handleKairosGovernancePortfolioObjectRequest(durable, new Request("https://kairos.internal/registry/kairos-governance-portfolios", { method: "POST", body: JSON.stringify({ operation: "export" }) }));
    const payload = await exported!.json();
    expect(payload.deploymentExecutionIncluded).toBe(false);
    expect(payload.automaticRemediationIncluded).toBe(false);
  });

  it("requires authentication on public APIs", async () => {
    const response = await handleKairosGovernancePortfolioAPI(new Request("https://example.com/api/kairos/operations/portfolios"), {} as any);
    expect(response?.status).toBe(401);
  });
});
