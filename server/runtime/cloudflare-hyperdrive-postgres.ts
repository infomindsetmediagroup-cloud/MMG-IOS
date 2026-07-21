import { Client, type ClientConfig, type QueryResultRow } from "pg";
import type {
  MMGSQLExecutor,
  MMGSQLQueryResult,
  MMGTransactionalDatabase,
} from "../knowledge-library/persistence.js";

export interface MMGCloudflareHyperdriveBinding {
  connectionString: string;
}

export interface MMGCloudflareHyperdriveDatabaseOptions {
  applicationName?: string;
  statementTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

const positiveInteger = (
  value: number | undefined,
  fallback: number,
  code: string,
): number => {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 250 || resolved > 60_000) {
    throw new Error(code);
  }
  return resolved;
};

const validConnectionString = (value: string): string => {
  const normalized = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("MMG_HYPERDRIVE_CONNECTION_STRING_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("MMG_HYPERDRIVE_POSTGRES_REQUIRED");
  }
  return normalized;
};

const normalizeResult = <Row extends Record<string, unknown>>(
  rows: QueryResultRow[],
  rowCount: number | null,
): MMGSQLQueryResult<Row> => ({
  rows: rows as Row[],
  rowCount: rowCount ?? rows.length,
});

class MMGCloudflareHyperdriveTransactionExecutor implements MMGSQLExecutor {
  readonly #client: Client;

  constructor(client: Client) {
    this.#client = client;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<MMGSQLQueryResult<Row>> {
    const result = await this.#client.query(text, [...values]);
    return normalizeResult<Row>(result.rows, result.rowCount);
  }
}

export class MMGCloudflareHyperdriveDatabase
  implements MMGTransactionalDatabase
{
  readonly #connectionString: string;
  readonly #applicationName: string;
  readonly #statementTimeoutMs: number;
  readonly #connectionTimeoutMs: number;

  constructor(
    binding: MMGCloudflareHyperdriveBinding,
    options: MMGCloudflareHyperdriveDatabaseOptions = {},
  ) {
    this.#connectionString = validConnectionString(binding.connectionString);
    this.#applicationName = String(
      options.applicationName ?? "mmg-commerce-staging",
    )
      .trim()
      .slice(0, 63);
    if (!this.#applicationName) {
      throw new Error("MMG_HYPERDRIVE_APPLICATION_NAME_REQUIRED");
    }
    this.#statementTimeoutMs = positiveInteger(
      options.statementTimeoutMs,
      15_000,
      "MMG_HYPERDRIVE_STATEMENT_TIMEOUT_INVALID",
    );
    this.#connectionTimeoutMs = positiveInteger(
      options.connectionTimeoutMs,
      8_000,
      "MMG_HYPERDRIVE_CONNECTION_TIMEOUT_INVALID",
    );
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<MMGSQLQueryResult<Row>> {
    const client = this.#client();
    await client.connect();
    try {
      const result = await client.query(text, [...values]);
      return normalizeResult<Row>(result.rows, result.rowCount);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async transaction<T>(
    work: (transaction: MMGSQLExecutor) => Promise<T>,
  ): Promise<T> {
    const client = this.#client();
    await client.connect();
    try {
      await client.query("BEGIN");
      const result = await work(
        new MMGCloudflareHyperdriveTransactionExecutor(client),
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  #client(): Client {
    const config: ClientConfig = {
      connectionString: this.#connectionString,
      application_name: this.#applicationName,
      statement_timeout: this.#statementTimeoutMs,
      connectionTimeoutMillis: this.#connectionTimeoutMs,
    };
    return new Client(config);
  }
}
