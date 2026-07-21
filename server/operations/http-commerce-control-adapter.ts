import type {
  MMGCommerceControlChange,
  MMGCommerceOperationsEnvironment,
  MMGCommerceRolloutStage,
} from "./commerce-operations-control.js";
import type { MMGCommerceControlAdapter } from "./commerce-operations-service.js";

export interface MMGHTTPCommerceControlAdapterConfig {
  runtimeOrigin: string;
  internalToken: string;
  requestTimeoutMs: number;
  fetcher?: typeof fetch;
}

export class MMGHTTPCommerceControlAdapter implements MMGCommerceControlAdapter {
  readonly #config: MMGHTTPCommerceControlAdapterConfig;

  constructor(config: MMGHTTPCommerceControlAdapterConfig) {
    this.#config = config;
  }

  async applyControl(input: {
    environment: MMGCommerceOperationsEnvironment;
    change: MMGCommerceControlChange;
    occurredAt: Date;
  }): Promise<void> {
    if (input.change.control === "webhook_ingestion" && input.change.mode === "disabled") {
      throw new Error("MMG_WEBHOOK_INGESTION_DISABLE_FORBIDDEN");
    }
    if (input.change.control === "product_publication" && input.change.mode === "enabled") {
      throw new Error("MMG_PUBLICATION_ENABLE_REQUIRES_DEPLOYMENT_CONTROL");
    }
    await this.#post("/api/internal/runtime-controls/control", {
      environment: input.environment,
      control: input.change.control,
      mode: input.change.mode,
      reasonCode: input.change.reasonCode,
      automatic: input.change.automatic,
      occurredAt: input.occurredAt.toISOString(),
    });
  }

  async applyRollout(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string;
    stage: MMGCommerceRolloutStage;
    cohortPercentage: number;
    occurredAt: Date;
  }): Promise<void> {
    if (!Number.isFinite(input.cohortPercentage) || input.cohortPercentage < 0 || input.cohortPercentage > 100) {
      throw new Error("MMG_RUNTIME_CONTROL_COHORT_INVALID");
    }
    await this.#post("/api/internal/runtime-controls/rollout", {
      environment: input.environment,
      releaseId: input.releaseId,
      stage: input.stage,
      cohortPercentage: input.cohortPercentage,
      occurredAt: input.occurredAt.toISOString(),
    });
  }

  async #post(path: string, payload: Record<string, unknown>): Promise<void> {
    const fetcher = this.#config.fetcher ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
    try {
      const response = await fetcher(new URL(path, this.#config.runtimeOrigin), {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.#config.internalToken}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-MMG-Internal-Request": "commerce-operations-control-adapter",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`MMG_RUNTIME_CONTROL_REJECTED:${response.status}`);
      }
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; status?: string }
        | null;
      if (!body?.ok) throw new Error("MMG_RUNTIME_CONTROL_RESPONSE_INVALID");
    } finally {
      clearTimeout(timeout);
    }
  }
}
