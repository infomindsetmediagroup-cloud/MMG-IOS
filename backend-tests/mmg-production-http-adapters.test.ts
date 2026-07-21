import { describe, expect, it, vi } from "vitest";
import { MMGHTTPCommerceRouteProbe } from "../server/operations/http-commerce-route-probe.js";
import { MMGHTTPCommerceControlAdapter } from "../server/operations/http-commerce-control-adapter.js";
import { MMGWebhookCommerceAlertAdapter } from "../server/operations/webhook-commerce-alert-adapter.js";

const incident = {
  incidentId: "incident:staging:database_connectivity_ratio",
  environment: "staging" as const,
  signalCode: "database_connectivity_ratio",
  severity: "SEV1" as const,
  state: "detected" as const,
  title: "Commerce database connectivity",
  summary: "Connectivity breached policy.",
  firstSeenAt: "2026-07-21T00:00:00.000Z",
  lastSeenAt: "2026-07-21T00:00:00.000Z",
  version: 1,
};

const signal = {
  code: "database_connectivity_ratio" as const,
  status: "critical" as const,
  severity: "SEV1" as const,
  value: 0.8,
  unit: "ratio" as const,
  sampleSize: 10,
  observedAt: "2026-07-21T00:00:00.000Z",
  title: "Commerce database connectivity",
  reasonCode: "CRITICAL_THRESHOLD_BREACHED" as const,
};

describe("MMG production HTTP adapters", () => {
  it("treats private authorization responses as deployed routes", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const probe = new MMGHTTPCommerceRouteProbe({
      runtimeOrigin: "https://runtime.example.com",
      internalToken: "x".repeat(48),
      requestTimeoutMs: 1000,
      targets: [{ path: "/api/private" }, { path: "/api/missing" }],
      fetcher,
    });
    await expect(probe.availability({ environment: "staging" })).resolves.toEqual({
      successes: 1,
      total: 2,
    });
  });

  it("applies reversible controls and forbids publication enablement", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const adapter = new MMGHTTPCommerceControlAdapter({
      runtimeOrigin: "https://runtime.example.com",
      internalToken: "x".repeat(48),
      requestTimeoutMs: 1000,
      fetcher,
    });
    await adapter.applyControl({
      environment: "staging",
      change: {
        control: "delivery_scheduler",
        mode: "disabled",
        reasonCode: "test",
        automatic: true,
      },
      occurredAt: new Date("2026-07-21T00:00:00.000Z"),
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/api/internal/runtime-controls/control" }),
      expect.objectContaining({ method: "POST" }),
    );
    await expect(
      adapter.applyControl({
        environment: "production",
        change: {
          control: "product_publication",
          mode: "enabled",
          reasonCode: "forbidden",
          automatic: false,
        },
        occurredAt: new Date(),
      }),
    ).rejects.toThrow("MMG_PUBLICATION_ENABLE_REQUIRES_DEPLOYMENT_CONTROL");
  });

  it("delivers sanitized required alerts and persists only hashes", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue(
      new Response("ok", { status: 200, headers: { "X-Request-Id": "provider-123" } }),
    );
    const adapter = new MMGWebhookCommerceAlertAdapter({
      destinations: {
        on_call_pager: "https://alerts.example.com/pager",
        operations_email: "https://alerts.example.com/email",
        operations_chat: "https://alerts.example.com/chat",
        executive_briefing: "https://alerts.example.com/executive",
      },
      hasher: { sha256: vi.fn().mockResolvedValue("a".repeat(64)) },
      store: { record },
      requestTimeoutMs: 1000,
      fetcher,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
    });
    await adapter.notify({
      environment: "staging",
      incident,
      signal,
      automaticContainmentApplied: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationHash: "a".repeat(64),
        providerReferenceHash: "a".repeat(64),
        status: "delivered",
      }),
    );
    const firstInit = fetcher.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(firstInit.body));
    expect(payload.customerDataIncluded).toBe(false);
    expect(payload).not.toHaveProperty("customerId");
  });

  it("does not silently suppress missing SEV1 alert destinations", async () => {
    const adapter = new MMGWebhookCommerceAlertAdapter({
      destinations: {},
      hasher: { sha256: vi.fn() },
      store: { record: vi.fn() },
      requestTimeoutMs: 1000,
      fetcher: vi.fn(),
    });
    await expect(
      adapter.notify({
        environment: "staging",
        incident,
        signal,
        automaticContainmentApplied: false,
      }),
    ).rejects.toThrow("MMG_REQUIRED_ALERT_DELIVERY_FAILED");
  });
});
