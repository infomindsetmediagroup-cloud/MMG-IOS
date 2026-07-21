import { describe, expect, it, vi } from "vitest";
import { handleMMGRuntimeControlRequest } from "../server/operations/runtime-control-http.js";

const dependencies = () => ({
  authenticator: {
    authenticate: vi.fn().mockResolvedValue({
      actorId: "runtime-control-1",
      roles: ["mmg-runtime-control"],
    }),
  },
  boundary: {
    applyControl: vi.fn().mockResolvedValue(undefined),
    applyRollout: vi.fn().mockResolvedValue(undefined),
  },
  allowedOrigins: new Set(["https://runtime.example.com"]),
});

const request = (path: string, body: Record<string, unknown>) =>
  new Request(`https://runtime.example.com${path}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test",
      Origin: "https://runtime.example.com",
      "Content-Type": "application/json",
      "X-MMG-Internal-Request": "test-suite",
      "X-MMG-Control-Receipt": "control-receipt-12345678",
    },
    body: JSON.stringify(body),
  });

describe("MMG runtime control HTTP boundary", () => {
  it("applies a safe scheduler control", async () => {
    const deps = dependencies();
    const response = await handleMMGRuntimeControlRequest(
      request("/api/internal/runtime-controls/control", {
        environment: "staging",
        control: "delivery_scheduler",
        mode: "disabled",
        reasonCode: "staging_drill",
        automatic: true,
        occurredAt: "2026-07-21T00:00:00.000Z",
      }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(
      "control-receipt-12345678",
    );
    expect(deps.boundary.applyControl).toHaveBeenCalledWith(
      expect.objectContaining({ control: "delivery_scheduler", mode: "disabled" }),
    );
  });

  it("rejects webhook shutdown and publication enablement", async () => {
    const webhook = await handleMMGRuntimeControlRequest(
      request("/api/internal/runtime-controls/control", {
        environment: "production",
        control: "webhook_ingestion",
        mode: "disabled",
        reasonCode: "forbidden",
        automatic: false,
        occurredAt: "2026-07-21T00:00:00.000Z",
      }),
      dependencies(),
    );
    expect(webhook.status).toBe(409);

    const publication = await handleMMGRuntimeControlRequest(
      request("/api/internal/runtime-controls/control", {
        environment: "production",
        control: "product_publication",
        mode: "enabled",
        reasonCode: "forbidden",
        automatic: false,
        occurredAt: "2026-07-21T00:00:00.000Z",
      }),
      dependencies(),
    );
    expect(publication.status).toBe(409);
  });
});
