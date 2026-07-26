// @ts-nocheck
import { describe, expect, it } from "vitest";
import { handleKairosObservabilityAPI, handleKairosObservabilityObjectRequest, recordKairosObservabilityEvent } from "../cloudflare/mmg-ios/src/kairos-observability-store-v1.js";

function storage() { const map = new Map(); return { async get(k){ return map.get(k); }, async put(k,v){ map.set(k,v); }, map }; }
function env(state) { const stub = { fetch: (request) => handleKairosObservabilityObjectRequest(state, request) }; return { KAIROS_API_ACCESS_TOKEN: "service-secret", KAIROS_PROJECTS: { idFromName: () => "registry", get: () => stub } }; }

function timelineRequest(path, token = "service-secret") { return new Request(`https://kairos.test${path}`, { headers: { authorization: `Bearer ${token}` } }); }

describe("Kairos observability store", () => {
  it("persists sanitized events and returns an ordered request timeline", async () => {
    const state = { storage: storage() };
    const runtime = env(state);
    await recordKairosObservabilityEvent(runtime, { eventId: "evt_2", requestId: "req_1", phase: "response_completed", outcome: "success", startedAt: "2026-07-25T10:00:02Z", metadata: { token: "secret", route: "/api/kairos" } });
    await recordKairosObservabilityEvent(runtime, { eventId: "evt_1", requestId: "req_1", phase: "request_received", outcome: "pending", startedAt: "2026-07-25T10:00:00Z", metadata: { objective: "private", client: "dashboard" } });
    const response = await handleKairosObservabilityAPI(timelineRequest("/api/kairos/operations/request/req_1"), runtime);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.events.map((event) => event.eventId)).toEqual(["evt_1", "evt_2"]);
    expect(body.events[0].metadata).toEqual({ client: "dashboard" });
    expect(body.events[1].metadata).toEqual({ route: "/api/kairos" });
  });

  it("indexes approval timelines separately", async () => {
    const state = { storage: storage() };
    const runtime = env(state);
    await recordKairosObservabilityEvent(runtime, { eventId: "evt_a", requestId: "req_2", approvalId: "kap_1", phase: "tool_proposed", outcome: "pending" });
    await recordKairosObservabilityEvent(runtime, { eventId: "evt_b", requestId: "req_2", approvalId: "kap_1", phase: "approval_consumed", outcome: "success" });
    const response = await handleKairosObservabilityAPI(timelineRequest("/api/kairos/operations/approval/kap_1"), runtime);
    const body = await response.json();
    expect(body.count).toBe(2);
    expect(body.events.every((event) => event.approvalId === "kap_1")).toBe(true);
  });

  it("requires authenticated operations access", async () => {
    const state = { storage: storage() };
    const response = await handleKairosObservabilityAPI(new Request("https://kairos.test/api/kairos/operations/request/req_1"), env(state));
    expect(response.status).toBe(401);
  });
});
