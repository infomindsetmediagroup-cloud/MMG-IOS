import test from "node:test";
import assert from "node:assert/strict";

import {
  handleAutonomyApiRequest,
  KAIROS_BUSINESS_COLLECTION_PATH,
} from "../../src/autonomy/kairos-autonomy-api-v4.js";
import { collectBusinessState } from "../../src/autonomy/kairos-business-collector-v1.js";

const TOKEN = "0123456789abcdef".repeat(4);
const NOW = new Date("2026-08-02T19:00:00.000Z");
const STORED_AT = "2026-08-02T19:00:01.000Z";
const CANONICAL_IDENTIFIER = /^[a-z0-9][a-z0-9._:-]*$/u;

function passedWebsiteResult() {
  return {
    workflowId: "website.health.v1",
    status: "passed",
    checkedAt: "2026-08-02T18:59:30.000Z",
    incidentsDetected: 0,
    healthCheck: {
      statusCode: 200,
      latencyMs: 142,
      bodyBytesInspected: 4096,
      bodyTruncated: false,
    },
  };
}

function environment() {
  return {
    KAIROS_AUTONOMY_API_TOKEN: TOKEN,
    KAIROS_ENVIRONMENT: "production",
    KAIROS_KILL_SWITCH: "enabled",
    KAIROS_AUTONOMY_SCHEDULED_ENABLED: "enabled",
    KAIROS_AUTONOMY_ACTIVATION_GATE: "business-operations-v1",
    KAIROS_WEBSITE_HEALTH_ALLOWED_ORIGINS: "https://themindsetmediagroup.com",
  };
}

test("the real collector emits a snapshot identity accepted by API v4 persistence", async () => {
  let persistedSnapshotId = null;
  const response = await handleAutonomyApiRequest(
    new Request(`https://kairos.example${KAIROS_BUSINESS_COLLECTION_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenantId: "mmg" }),
    }),
    environment(),
    {},
    {
      businessCollector(input, collectorEnvironment) {
        return collectBusinessState(input, collectorEnvironment, {
          now: NOW,
          websiteHealthExecutor: async () => passedWebsiteResult(),
        });
      },
      businessStateLedgerClient: {
        async storeBusinessSnapshot(businessState) {
          persistedSnapshotId = businessState.snapshot.snapshotId;
          return {
            ok: true,
            disposition: "stored",
            duplicate: false,
            statusCode: 201,
            record: {
              tenantId: businessState.tenantId,
              snapshotId: businessState.snapshot.snapshotId,
              generatedAt: businessState.generatedAt,
              storedAt: STORED_AT,
            },
          };
        },
      },
    },
  );

  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(response.status, 200, text);
  assert.equal(body.ok, true);
  assert.equal(body.persistence.disposition, "stored");
  assert.equal(body.persistence.snapshotId, persistedSnapshotId);
  assert.match(persistedSnapshotId, /^bss_\d{8}t\d{6}z_[0-9a-f]{8}$/u);
  assert.match(persistedSnapshotId, CANONICAL_IDENTIFIER);
  assert.equal(/[A-Z]/u.test(persistedSnapshotId), false);
});
