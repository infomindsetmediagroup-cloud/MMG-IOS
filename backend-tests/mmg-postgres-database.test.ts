import { describe, expect, it } from "vitest";
import {
  MMGPostgresDatabase,
  type MMGSQLPoolLike,
  type MMGSQLQueryResult,
  type MMGSQLTransactionClient,
} from "../server/knowledge-library/persistence.js";

class RecordingClient implements MMGSQLTransactionClient {
  readonly statements: string[] = [];
  released = false;

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
  ): Promise<MMGSQLQueryResult<Row>> {
    this.statements.push(text);
    return { rows: [], rowCount: 0 };
  }

  release(): void {
    this.released = true;
  }
}

class RecordingPool implements MMGSQLPoolLike {
  readonly client = new RecordingClient();
  readonly directStatements: string[] = [];

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
  ): Promise<MMGSQLQueryResult<Row>> {
    this.directStatements.push(text);
    return { rows: [], rowCount: 0 };
  }

  async connect(): Promise<MMGSQLTransactionClient> {
    return this.client;
  }
}

describe("MMG PostgreSQL transaction adapter", () => {
  it("commits successful work and releases the connection", async () => {
    const pool = new RecordingPool();
    const database = new MMGPostgresDatabase(pool);

    const result = await database.transaction(async (transaction) => {
      await transaction.query("SELECT 1");
      return "complete";
    });

    expect(result).toBe("complete");
    expect(pool.client.statements).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
    expect(pool.client.released).toBe(true);
  });

  it("rolls back failed work, preserves the original error, and releases", async () => {
    const pool = new RecordingPool();
    const database = new MMGPostgresDatabase(pool);
    const failure = new Error("transaction failed");

    await expect(
      database.transaction(async (transaction) => {
        await transaction.query("UPDATE test");
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(pool.client.statements).toEqual([
      "BEGIN",
      "UPDATE test",
      "ROLLBACK",
    ]);
    expect(pool.client.released).toBe(true);
  });

  it("passes direct reads through the configured pool", async () => {
    const pool = new RecordingPool();
    const database = new MMGPostgresDatabase(pool);

    await database.query("SELECT * FROM mmg_ownership_grants");

    expect(pool.directStatements).toEqual([
      "SELECT * FROM mmg_ownership_grants",
    ]);
  });
});
