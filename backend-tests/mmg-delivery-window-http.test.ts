import { describe, expect, it } from "vitest";
import { handleMMGDeliveryWindowControllerRequest } from "../server/knowledge-library/delivery-window-http.js";
import {
  MMGDeterministicEligibleCurator,
  type MMGDeliveryDispatcher,
  type MMGDeliveryWindowConfirmationService,
  type MMGDeliveryWindowControllerRepository,
  type MMGDeliveryWindowRunSummary,
  type MMGDeliveryWindowSubscription,
} from "../server/knowledge-library/delivery-window-service.js";
import type {
  MMGDeliveryWindowRuntimeState,
  MMGDeliveryWindowScheduleEntry,
} from "../server/knowledge-library/delivery-windows.js";

class Repository implements MMGDeliveryWindowControllerRepository {
  delivered: Array<{ windowId: string; deliveryReference: string }> = [];
  reopened: Array<{ windowId: string; reviewWindowHours: number }> = [];

  async beginRun(): Promise<"started" | "duplicate"> {
    return "started";
  }
  async finishRun(): Promise<void> {}
  async listSubscriptionsForReconciliation(): Promise<
    MMGDeliveryWindowSubscription[]
  > {
    return [];
  }
  async ensureCycleAndWindows(
    _subscription: MMGDeliveryWindowSubscription,
    _schedule: MMGDeliveryWindowScheduleEntry[],
  ): Promise<{ cycleId: string; created: boolean; windowsCreated: number }> {
    return { cycleId: "cycle", created: false, windowsCreated: 0 };
  }
  async listActionableWindows(): Promise<MMGDeliveryWindowRuntimeState[]> {
    return [];
  }
  async listCurationCandidates() {
    return [];
  }
  async openWindow(): Promise<
    "opened" | "version_conflict" | "already_processed"
  > {
    return "opened";
  }
  async moveWindowToRecovery(): Promise<
    "updated" | "version_conflict" | "already_processed"
  > {
    return "updated";
  }
  async markDeliveryReady(): Promise<
    "updated" | "version_conflict" | "already_processed"
  > {
    return "updated";
  }
  async markDelivered(input: {
    windowId: string;
    deliveryReference: string;
    occurredAt: Date;
  }): Promise<"updated" | "not_found" | "already_delivered"> {
    this.delivered.push(input);
    return "updated";
  }
  async reopenRecoveryWindow(input: {
    windowId: string;
    reviewWindowHours: number;
    occurredAt: Date;
  }): Promise<"opened" | "not_found" | "invalid_state"> {
    this.reopened.push(input);
    return "opened";
  }
  async recordWindowFailure(): Promise<void> {}
}

class Confirmer implements MMGDeliveryWindowConfirmationService {
  async confirm(): Promise<
    "confirmed" | "idempotent" | "version_conflict" | "rejected"
  > {
    return "confirmed";
  }
}

class Dispatcher implements MMGDeliveryDispatcher {
  async queue(): Promise<{ dispatchId: string }> {
    return { dispatchId: "dispatch" };
  }
}

const now = new Date("2026-07-20T12:00:00.000Z");
const dependencies = (repository: Repository, authorized = true) => ({
  controller: {
    repository,
    curator: new MMGDeterministicEligibleCurator(),
    confirmer: new Confirmer(),
    dispatcher: new Dispatcher(),
    now: () => now,
  },
  authorize: async () => authorized,
});

const request = (body: unknown, method = "POST") =>
  new Request(
    "https://mmg.example/api/internal/knowledge-library/delivery-windows/run",
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    },
  );

describe("MMG delivery-window internal HTTP handler", () => {
  it("rejects unsupported methods", async () => {
    const response = await handleMMGDeliveryWindowControllerRequest(
      request({}, "GET"),
      dependencies(new Repository()),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("requires internal server authorization", async () => {
    const response = await handleMMGDeliveryWindowControllerRequest(
      request({ action: "tick", runId: "run-secure-001" }),
      dependencies(new Repository(), false),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DELIVERY_WINDOW_CONTROLLER_UNAUTHORIZED");
  });

  it("runs an idempotent controller tick", async () => {
    const response = await handleMMGDeliveryWindowControllerRequest(
      request({ action: "tick", runId: "run-http-tick-001" }),
      dependencies(new Repository()),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      summary: MMGDeliveryWindowRunSummary;
    };
    expect(body.ok).toBe(true);
    expect(body.summary.runId).toBe("run-http-tick-001");
    expect(body.summary.schemaVersion).toBe("1.0.0");
  });

  it("records delivery acknowledgement without browser identity fields", async () => {
    const repository = new Repository();
    const response = await handleMMGDeliveryWindowControllerRequest(
      request({
        action: "mark_delivered",
        windowId: "window-1",
        deliveryReference: "delivery-1",
      }),
      dependencies(repository),
    );

    expect(response.status).toBe(200);
    expect(repository.delivered).toEqual([
      {
        windowId: "window-1",
        deliveryReference: "delivery-1",
        occurredAt: now,
      },
    ]);
  });

  it("reopens a recovery window for twenty-four through forty-eight hours", async () => {
    const repository = new Repository();
    const response = await handleMMGDeliveryWindowControllerRequest(
      request({
        action: "reopen_recovery",
        windowId: "window-2",
        reviewWindowHours: 48,
      }),
      dependencies(repository),
    );

    expect(response.status).toBe(200);
    expect(repository.reopened).toEqual([
      {
        windowId: "window-2",
        reviewWindowHours: 48,
        occurredAt: now,
      },
    ]);
  });

  it("rejects client-supplied customer and subscription fields through strict action parsing", async () => {
    const response = await handleMMGDeliveryWindowControllerRequest(
      request({
        action: "unknown",
        customerId: "customer-1",
        subscriptionId: "subscription-1",
      }),
      dependencies(new Repository()),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MMG_DELIVERY_WINDOW_HTTP_ACTION_INVALID");
  });

  it("returns private no-store security headers", async () => {
    const response = await handleMMGDeliveryWindowControllerRequest(
      request({ action: "tick", runId: "run-header-001" }),
      dependencies(new Repository()),
    );

    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});
