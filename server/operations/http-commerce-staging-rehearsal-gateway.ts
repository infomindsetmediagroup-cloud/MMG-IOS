import type { MMGCommerceOperationsState } from "./commerce-operations-service.js";
import type {
  MMGCommerceRehearsalScenario,
  MMGCommerceRightsDigest,
  MMGCommerceStagingRehearsalGateway,
} from "./commerce-staging-rehearsal.js";
import type { MMGCommerceRolloutStage } from "./commerce-operations-control.js";

export interface MMGHTTPCommerceStagingRehearsalGatewayConfig {
  runtimeOrigin: string;
  internalToken: string;
  requestTimeoutMs: number;
  fetcher?: typeof fetch;
}

export class MMGHTTPCommerceStagingRehearsalGateway
  implements MMGCommerceStagingRehearsalGateway
{
  readonly #config: MMGHTTPCommerceStagingRehearsalGatewayConfig;

  constructor(config: MMGHTTPCommerceStagingRehearsalGatewayConfig) {
    this.#config = config;
  }

  async bootstrapSafeState(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
  }): Promise<void> {
    await this.#call("bootstrap_safe_state", input);
  }

  async injectScenario(input: {
    runId: string;
    releaseId: string;
    scenario: MMGCommerceRehearsalScenario;
    occurredAt: Date;
  }): Promise<void> {
    await this.#call("inject_scenario", input);
  }

  async clearScenario(input: {
    runId: string;
    releaseId: string;
    scenario: MMGCommerceRehearsalScenario;
    occurredAt: Date;
  }): Promise<void> {
    await this.#call("clear_scenario", input);
  }

  async evaluate(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    occurredAt: Date;
  }): Promise<MMGCommerceOperationsState> {
    return this.#state(await this.#call("evaluate", input));
  }

  async recoverScenario(input: {
    runId: string;
    releaseId: string;
    scenario: MMGCommerceRehearsalScenario;
    occurredAt: Date;
  }): Promise<MMGCommerceOperationsState> {
    return this.#state(await this.#call("recover_scenario", input));
  }

  async runConsistencyAudit(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    occurredAt: Date;
  }): Promise<{ passed: boolean; failedChecks: string[] }> {
    const body = await this.#call("run_consistency_audit", input);
    return {
      passed: body.passed === true,
      failedChecks: Array.isArray(body.failedChecks)
        ? body.failedChecks.map(String)
        : [],
    };
  }

  async grantStageApproval(input: {
    runId: string;
    releaseId: string;
    fromStage: MMGCommerceRolloutStage;
    toStage: MMGCommerceRolloutStage;
    occurredAt: Date;
  }): Promise<void> {
    await this.#call("grant_stage_approval", input);
  }

  async advanceObservation(input: {
    runId: string;
    releaseId: string;
    hours: number;
    occurredAt: Date;
  }): Promise<Date> {
    if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > 168) {
      throw new Error("MMG_REHEARSAL_OBSERVATION_ADVANCE_INVALID");
    }
    const body = await this.#call("advance_observation", input);
    const clock = new Date(String(body.clock ?? ""));
    if (!Number.isFinite(clock.getTime())) throw new Error("MMG_REHEARSAL_CLOCK_INVALID");
    return clock;
  }

  async advanceRollout(input: {
    runId: string;
    releaseId: string;
    requestId: string;
    targetStage: MMGCommerceRolloutStage;
    occurredAt: Date;
  }): Promise<MMGCommerceOperationsState> {
    return this.#state(await this.#call("advance_rollout", input));
  }

  async readRightsDigest(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
  }): Promise<MMGCommerceRightsDigest> {
    const body = await this.#call("read_rights_digest", input);
    const digest = body.rightsDigest as Partial<MMGCommerceRightsDigest> | undefined;
    if (!digest || !/^[a-f0-9]{64}$/.test(String(digest.digestSha256 ?? ""))) {
      throw new Error("MMG_REHEARSAL_RIGHTS_DIGEST_INVALID");
    }
    const counts = [
      digest.activeOwnershipCount,
      digest.activeDeliveryGrantCount,
      digest.deliveredWindowCount,
      digest.activeEntitlementCount,
    ].map(Number);
    if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error("MMG_REHEARSAL_RIGHTS_COUNT_INVALID");
    }
    return {
      activeOwnershipCount: counts[0]!,
      activeDeliveryGrantCount: counts[1]!,
      deliveredWindowCount: counts[2]!,
      activeEntitlementCount: counts[3]!,
      digestSha256: String(digest.digestSha256),
    };
  }

  async teardown(input: {
    runId: string;
    releaseId: string;
    occurredAt: Date;
  }): Promise<void> {
    await this.#call("teardown", input);
  }

  #state(body: Record<string, unknown>): MMGCommerceOperationsState {
    const state = body.state;
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new Error("MMG_REHEARSAL_STATE_INVALID");
    }
    return state as MMGCommerceOperationsState;
  }

  async #call<T extends object>(
    action: string,
    input: T & { occurredAt?: Date },
  ): Promise<Record<string, unknown>> {
    const fetcher = this.#config.fetcher ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
    const payload = {
      ...input,
      occurredAt:
        input.occurredAt instanceof Date
          ? input.occurredAt.toISOString()
          : input.occurredAt,
      action,
      environment: "staging",
      publicationAllowed: false,
      liveCustomerDataAllowed: false,
    };
    try {
      const response = await fetcher(
        new URL("/api/internal/commerce/rehearsal/adapter", this.#config.runtimeOrigin),
        {
          method: "POST",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.#config.internalToken}`,
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-MMG-Internal-Request": "commerce-staging-rehearsal",
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      if (!response.ok || body?.ok !== true) {
        const code = String(
          (body?.error as { code?: string } | undefined)?.code ??
            `MMG_REHEARSAL_ADAPTER_REJECTED_${response.status}`,
        );
        throw new Error(code);
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }
}
