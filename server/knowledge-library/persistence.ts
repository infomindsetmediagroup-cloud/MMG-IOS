import type { MMGEntitlementCounterSnapshot } from "./entitlements.js";
import type { MMGOwnershipSnapshot } from "./ownership.js";
import type {
  MMGPickerPrincipal,
  MMGPickerStateRepository,
} from "./picker-service.js";

export interface MMGSQLQueryResult<Row> {
  rows: Row[];
  rowCount: number;
}

export interface MMGSQLExecutor {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<MMGSQLQueryResult<Row>>;
}

export interface MMGSQLTransactionClient extends MMGSQLExecutor {
  release?(): void;
}

export interface MMGSQLPoolLike extends MMGSQLExecutor {
  connect(): Promise<MMGSQLTransactionClient>;
}

export interface MMGTransactionalDatabase extends MMGSQLExecutor {
  transaction<T>(
    work: (transaction: MMGSQLExecutor) => Promise<T>,
  ): Promise<T>;
}

export class MMGPostgresDatabase implements MMGTransactionalDatabase {
  readonly #pool: MMGSQLPoolLike;

  constructor(pool: MMGSQLPoolLike) {
    this.#pool = pool;
  }

  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<MMGSQLQueryResult<Row>> {
    return this.#pool.query<Row>(text, values);
  }

  async transaction<T>(
    work: (transaction: MMGSQLExecutor) => Promise<T>,
  ): Promise<T> {
    const client = await this.#pool.connect();
    await client.query("BEGIN");

    try {
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction error. Connection-level logging belongs
        // to the runtime adapter that owns the concrete SQL client.
      }
      throw error;
    } finally {
      client.release?.();
    }
  }
}

export interface MMGEntitlementOwnershipRepository
  extends MMGPickerStateRepository {
  getEntitlementCounter(
    principal: MMGPickerPrincipal,
  ): Promise<MMGEntitlementCounterSnapshot | null>;
  getOwnershipSnapshot(
    principal: MMGPickerPrincipal,
    asOf: Date,
  ): Promise<MMGOwnershipSnapshot>;
}

export interface MMGEntitlementDashboardSnapshot {
  schemaVersion: "1.0.0";
  counter: MMGEntitlementCounterSnapshot;
  ownership: {
    totalOwnedAssets: number;
  };
}
