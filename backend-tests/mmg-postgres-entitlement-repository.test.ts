import { describe, expect, it } from "vitest";
import { MMGPostgresEntitlementOwnershipRepository } from "../server/knowledge-library/postgres-entitlement-repository.js";
import type {
  MMGSQLQueryResult,
  MMGTransactionalDatabase,
} from "../server/knowledge-library/persistence.js";
import type { MMGPickerState } from "../server/knowledge-library/picker.js";

const principal = { customerId: "customer-1", sessionId: "session-1" };

const confirmedState = (): MMGPickerState => ({
  customerAuthenticated: true,
  subscriptionActive: true,
  window: {
    id: "11111111-1111-4111-8111-111111111111",
    type: "first_package",
    status: "confirmed",
    totalUnits: 2,
    targetAssetCount: 2,
    version: 2,
    opensAt: "2026-07-20T00:00:00.000Z",
    closesAt: "2026-07-22T00:00:00.000Z",
  },
  assets: [],
  ownedAssetIds: [],
  selections: [
    {
      assetId: "asset-1",
      units: 1,
      state: "confirmed",
      selectedAt: "2026-07-20T00:01:00.000Z",
    },
    {
      assetId: "asset-2",
      units: 1,
      state: "confirmed",
      selectedAt: "2026-07-20T00:02:00.000Z",
    },
  ],
  processedRequestIds: ["request-confirm-001"],
  confirmedAt: "2026-07-20T00:03:00.000Z",
});

class ScriptedDatabase implements MMGTransactionalDatabase {
  readonly statements: string[] = [];
  committed = false;
  rolledBack = false;
  currentVersion = 1;
  ownershipInsertRowCount = 1;

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<MMGSQLQueryResult<Row>> {
    this.statements.push(text.replace(/\s+/g, " ").trim());

    const result = this.response(text, values);
    return result as MMGSQLQueryResult<Row>;
  }

  async transaction<T>(
    work: (transaction: ScriptedDatabase) => Promise<T>,
  ): Promise<T> {
    try {
      const result = await work(this);
      this.committed = true;
      return result;
    } catch (error) {
      this.rolledBack = true;
      throw error;
    }
  }

  private response(
    text: string,
    _values: readonly unknown[],
  ): MMGSQLQueryResult<Record<string, unknown>> {
    if (text.includes("SELECT w.id, w.cycle_id, e.customer_id")) {
      return {
        rows: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            cycle_id: "22222222-2222-4222-8222-222222222222",
            customer_id: "customer-1",
            status: "open",
            version: this.currentVersion,
          },
        ],
        rowCount: 1,
      };
    }

    if (text.includes("FROM mmg_knowledge_assets") && text.includes("FOR SHARE")) {
      return {
        rows: ["asset-1", "asset-2"].map((assetId) => ({
          asset_id: assetId,
          product_type: "digital_download",
          asset_status: "active",
          published: true,
          available: true,
          subscription_eligible: true,
          subscription_value: 1,
          portrait_cover_present: true,
          square_thumbnail_present: true,
          delivery_package_verified: true,
          delivery_package_reference: `package:${assetId}`,
          customer_destination: "my_library",
        })),
        rowCount: 2,
      };
    }

    if (text.includes("FROM mmg_ownership_grants") && text.includes("FOR SHARE")) {
      return { rows: [], rowCount: 0 };
    }

    if (text.includes("FROM mmg_entitlement_cycles") && text.includes("FOR UPDATE")) {
      return {
        rows: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            status: "active",
            total_packages: 1,
            confirmed_packages: 0,
            total_units: 2,
            consumed_units: 0,
          },
        ],
        rowCount: 1,
      };
    }

    if (text.includes("INSERT INTO mmg_ownership_grants")) {
      return { rows: [], rowCount: this.ownershipInsertRowCount };
    }

    if (
      text.includes("UPDATE mmg_entitlement_windows") ||
      text.includes("INSERT INTO mmg_delivery_grants") ||
      text.includes("UPDATE mmg_entitlement_cycles") ||
      text.includes("INSERT INTO mmg_entitlement_events")
    ) {
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: 1 };
  }
}

describe("MMG PostgreSQL entitlement repository", () => {
  it("returns a version conflict before writing stale state", async () => {
    const database = new ScriptedDatabase();
    database.currentVersion = 2;
    const repository = new MMGPostgresEntitlementOwnershipRepository(database);

    const result = await repository.save(principal, confirmedState(), 1);

    expect(result).toBe("version_conflict");
    expect(database.committed).toBe(true);
    expect(
      database.statements.some((statement) =>
        statement.includes("UPDATE mmg_entitlement_windows"),
      ),
    ).toBe(false);
  });

  it("persists confirmation, delivery, ownership, cycle accounting, and audit in one transaction", async () => {
    const database = new ScriptedDatabase();
    const repository = new MMGPostgresEntitlementOwnershipRepository(database);

    const result = await repository.save(principal, confirmedState(), 1);

    expect(result).toBe("saved");
    expect(database.committed).toBe(true);
    expect(database.rolledBack).toBe(false);
    expect(
      database.statements.filter((statement) =>
        statement.includes("INSERT INTO mmg_delivery_grants"),
      ),
    ).toHaveLength(2);
    expect(
      database.statements.filter((statement) =>
        statement.includes("INSERT INTO mmg_ownership_grants"),
      ),
    ).toHaveLength(2);
    expect(
      database.statements.some((statement) =>
        statement.includes("UPDATE mmg_entitlement_cycles"),
      ),
    ).toBe(true);
    expect(
      database.statements.some((statement) =>
        statement.includes("INSERT INTO mmg_entitlement_events"),
      ),
    ).toBe(true);
  });

  it("rolls back the entire confirmation when an ownership grant conflicts", async () => {
    const database = new ScriptedDatabase();
    database.ownershipInsertRowCount = 0;
    const repository = new MMGPostgresEntitlementOwnershipRepository(database);

    await expect(
      repository.save(principal, confirmedState(), 1),
    ).rejects.toThrow("MMG_PERSISTENCE_OWNERSHIP_GRANT_CONFLICT");

    expect(database.committed).toBe(false);
    expect(database.rolledBack).toBe(true);
    expect(
      database.statements.some((statement) =>
        statement.includes("UPDATE mmg_entitlement_cycles"),
      ),
    ).toBe(false);
  });
});
