import type { MMGSQLExecutor } from "../knowledge-library/persistence.js";

interface RehearsalRow extends Record<string, unknown> {
  completed_at: Date | string;
  evidence: unknown;
}

const object = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === "string") {
    try {
      return object(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

export interface MMGCommerceRehearsalEvidenceAdapter {
  hasFreshPassedEvidence(input: {
    releaseId: string;
    maximumAgeSeconds: number;
    asOf: Date;
  }): Promise<boolean>;
}

export class MMGPostgresCommerceRehearsalEvidenceAdapter
  implements MMGCommerceRehearsalEvidenceAdapter
{
  readonly #database: MMGSQLExecutor;

  constructor(database: MMGSQLExecutor) {
    this.#database = database;
  }

  async hasFreshPassedEvidence(input: {
    releaseId: string;
    maximumAgeSeconds: number;
    asOf: Date;
  }): Promise<boolean> {
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/i.test(input.releaseId)) {
      throw new Error("MMG_REHEARSAL_RELEASE_ID_INVALID");
    }
    if (
      !Number.isInteger(input.maximumAgeSeconds) ||
      input.maximumAgeSeconds < 60 ||
      input.maximumAgeSeconds > 604800
    ) {
      throw new Error("MMG_REHEARSAL_EVIDENCE_AGE_INVALID");
    }
    const cutoff = new Date(
      input.asOf.getTime() - input.maximumAgeSeconds * 1000,
    );
    const result = await this.#database.query<RehearsalRow>(
      `SELECT completed_at, evidence
       FROM mmg_commerce_rehearsal_runs
       WHERE release_id = $1
         AND environment = 'staging'
         AND status = 'passed'
         AND completed_at >= $2
         AND completed_at <= $3
         AND publication_attempted = FALSE
         AND live_customer_data_used = FALSE
         AND delivered_ownership_revocation_allowed = FALSE
       ORDER BY completed_at DESC
       LIMIT 1`,
      [input.releaseId, cutoff, input.asOf],
    );
    const row = result.rows[0];
    if (!row) return false;
    const evidence = object(row.evidence);
    if (!evidence) return false;
    if (
      evidence.releaseId !== input.releaseId ||
      evidence.environment !== "staging" ||
      evidence.status !== "passed" ||
      evidence.publicationAttempted !== false ||
      evidence.liveCustomerDataUsed !== false ||
      evidence.deliveredOwnershipRevocationAllowed !== false
    ) {
      return false;
    }
    const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
    const required = new Set([
      "SEV1_INCIDENT_OPENED",
      "SEV1_CONTAINMENT_APPLIED",
      "SEV2_INCIDENT_OPENED",
      "WEBHOOK_EVIDENCE_PRESERVED",
      "CONSISTENCY_AUDIT_PASSED",
      "ROLLOUT_INTERNAL_ENTERED",
      "ROLLOUT_PILOT_ENTERED",
      "ROLLOUT_LIMITED_ENTERED",
      "ROLLOUT_EXPANDED_ENTERED",
      "ROLLOUT_FULL_ENTERED",
      "CUSTOMER_RIGHTS_PRESERVED",
    ]);
    for (const entry of checks) {
      const check = object(entry);
      if (check?.status === "passed" && typeof check.code === "string") {
        required.delete(check.code);
      }
    }
    return required.size === 0;
  }
}
