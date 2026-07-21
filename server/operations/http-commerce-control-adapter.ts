import type { MMGSQLExecutor } from "../knowledge-library/persistence.js";
import type {
  MMGCommerceControlChange,
  MMGCommerceOperationsEnvironment,
  MMGCommerceRolloutStage,
} from "./commerce-operations-control.js";
import type { MMGCommerceControlAdapter } from "./commerce-operations-service.js";

export interface MMGCommerceRuntimeControlReceiptStore {
  record(input: {
    receiptId: string;
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string | null;
    controlCode: string;
    requestedMode: string;
    outcome: "applied" | "rejected" | "failed";
    providerReferenceHash: string | null;
    errorCode: string | null;
    requestedAt: Date;
    completedAt: Date;
  }): Promise<void>;
}

export class MMGPostgresCommerceRuntimeControlReceiptStore
  implements MMGCommerceRuntimeControlReceiptStore
{
  readonly #database: MMGSQLExecutor;

  constructor(database: MMGSQLExecutor) {
    this.#database = database;
  }

  async record(input: {
    receiptId: string;
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string | null;
    controlCode: string;
    requestedMode: string;
    outcome: "applied" | "rejected" | "failed";
    providerReferenceHash: string | null;
    errorCode: string | null;
    requestedAt: Date;
    completedAt: Date;
  }): Promise<void> {
    await this.#database.query(
      `INSERT INTO mmg_commerce_runtime_control_receipts (
         receipt_id, environment, release_id, control_code, requested_mode,
         outcome, provider_reference_hash, error_code, requested_at, completed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (receipt_id) DO NOTHING`,
      [
        input.receiptId,
        input.environment,
        input.releaseId,
        input.controlCode,
        input.requestedMode,
        input.outcome,
        input.providerReferenceHash,
        input.errorCode,
        input.requestedAt,
        input.completedAt,
      ],
    );
  }
}

export interface MMGHTTPCommerceControlAdapterConfig {
  runtimeOrigin: string;
  internalToken: string;
  requestTimeoutMs: number;
  receiptStore: MMGCommerceRuntimeControlReceiptStore;
  sha256(value: string): Promise<string>;
  createReceiptId(): string;
  now?: () => Date;
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
    await this.#execute({
      path: "/api/internal/runtime-controls/control",
      environment: input.environment,
      releaseId: null,
      controlCode: input.change.control,
      requestedMode: input.change.mode,
      requestedAt: input.occurredAt,
      payload: {
        environment: input.environment,
        control: input.change.control,
        mode: input.change.mode,
        reasonCode: input.change.reasonCode,
        automatic: input.change.automatic,
        occurredAt: input.occurredAt.toISOString(),
      },
    });
  }

  async applyRollout(input: {
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string;
    stage: MMGCommerceRolloutStage;
    cohortPercentage: number;
    occurredAt: Date;
  }): Promise<void> {
    if (
      !Number.isFinite(input.cohortPercentage) ||
      input.cohortPercentage < 0 ||
      input.cohortPercentage > 100
    ) {
      throw new Error("MMG_RUNTIME_CONTROL_COHORT_INVALID");
    }
    await this.#execute({
      path: "/api/internal/runtime-controls/rollout",
      environment: input.environment,
      releaseId: input.releaseId,
      controlCode: "rollout",
      requestedMode: `${input.stage}:${input.cohortPercentage}`,
      requestedAt: input.occurredAt,
      payload: {
        environment: input.environment,
        releaseId: input.releaseId,
        stage: input.stage,
        cohortPercentage: input.cohortPercentage,
        occurredAt: input.occurredAt.toISOString(),
      },
    });
  }

  async #execute(input: {
    path: string;
    environment: MMGCommerceOperationsEnvironment;
    releaseId: string | null;
    controlCode: string;
    requestedMode: string;
    requestedAt: Date;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const receiptId = this.#config.createReceiptId();
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(receiptId)) {
      throw new Error("MMG_RUNTIME_CONTROL_RECEIPT_ID_INVALID");
    }
    const fetcher = this.#config.fetcher ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
    try {
      const response = await fetcher(new URL(input.path, this.#config.runtimeOrigin), {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.#config.internalToken}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-MMG-Internal-Request": "commerce-operations-control-adapter",
          "X-MMG-Control-Receipt": receiptId,
        },
        body: JSON.stringify(input.payload),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; status?: string }
        | null;
      if (!response.ok || !body?.ok) {
        const code = response.ok
          ? "MMG_RUNTIME_CONTROL_RESPONSE_INVALID"
          : `MMG_RUNTIME_CONTROL_REJECTED_${response.status}`;
        await this.#config.receiptStore.record({
          receiptId,
          environment: input.environment,
          releaseId: input.releaseId,
          controlCode: input.controlCode,
          requestedMode: input.requestedMode,
          outcome: response.status >= 400 && response.status < 500 ? "rejected" : "failed",
          providerReferenceHash: null,
          errorCode: code,
          requestedAt: input.requestedAt,
          completedAt: this.#config.now?.() ?? new Date(),
        });
        throw new Error(code);
      }
      const providerReference = response.headers.get("x-request-id");
      await this.#config.receiptStore.record({
        receiptId,
        environment: input.environment,
        releaseId: input.releaseId,
        controlCode: input.controlCode,
        requestedMode: input.requestedMode,
        outcome: "applied",
        providerReferenceHash: providerReference
          ? await this.#config.sha256(providerReference)
          : null,
        errorCode: null,
        requestedAt: input.requestedAt,
        completedAt: this.#config.now?.() ?? new Date(),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":", 1)[0] : "MMG_RUNTIME_CONTROL_FAILED";
      if (!code.startsWith("MMG_RUNTIME_CONTROL_REJECTED_") && code !== "MMG_RUNTIME_CONTROL_RESPONSE_INVALID") {
        await this.#config.receiptStore.record({
          receiptId,
          environment: input.environment,
          releaseId: input.releaseId,
          controlCode: input.controlCode,
          requestedMode: input.requestedMode,
          outcome: "failed",
          providerReferenceHash: null,
          errorCode: code,
          requestedAt: input.requestedAt,
          completedAt: this.#config.now?.() ?? new Date(),
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
