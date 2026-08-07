import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateKairosCustomerRequest,
  customerCorsPreflight,
  handleKairosCustomerAuthAPI,
  handleKairosCustomerAuthObjectRequest,
  withCustomerPortalCors,
} from "../cloudflare/mmg-ios/src/kairos-customer-auth-session-v1.js";

const shopifyCustomerId = "gid://shopify/Customer/123456789";

function storage(initial: Record<string, unknown> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => map.get(key)),
    put: vi.fn(async (key: string, value: unknown) => map.set(key, value)),
    delete: vi.fn(async (key: string) => map.delete(key)),
  };
}

function sessionEnv(session: Record<string, unknown> | null) {
  return {
    MMG_STOREFRONT_ORIGIN: "https://themindsetmediagroup.com",
    KAIROS_PROJECTS: {
      idFromName: () => "id",
      get: () => ({
        fetch: async () => new Response(JSON.stringify({ success: true, record: session }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      }),
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Kairos secure customer auth session", () => {
  it("fails closed when a Shopify Customer Account client is not configured", async () => {
    const response = await handleKairosCustomerAuthAPI(
      new Request("https://kairos.example.com/api/kairos/customer/auth/start"),
      {},
    );
    expect(response?.status).toBe(503);
    const payload = await response?.json();
    expect(payload.error.code).toBe("CUSTOMER_AUTH_CLIENT_NOT_CONFIGURED");
  });

  it("allows CORS only from the canonical MMG storefront", async () => {
    const env = { MMG_STOREFRONT_ORIGIN: "https://themindsetmediagroup.com" };
    const allowed = customerCorsPreflight(new Request("https://kairos.example.com/api/kairos/customer/projects", {
      method: "OPTIONS",
      headers: { Origin: "https://themindsetmediagroup.com" },
    }), env);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://themindsetmediagroup.com");

    const denied = customerCorsPreflight(new Request("https://kairos.example.com/api/kairos/customer/projects", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    }), env);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("never reflects an untrusted origin", () => {
    const response = withCustomerPortalCors(new Response("{}"), new Request("https://kairos.example.com/api/kairos/customer/projects", {
      headers: { Origin: "https://evil.example" },
    }), { MMG_STOREFRONT_ORIGIN: "https://themindsetmediagroup.com" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("stores and retrieves only unexpired opaque auth records", async () => {
    const state = { storage: storage() };
    const token = "a".repeat(43);
    const put = await handleKairosCustomerAuthObjectRequest(state, new Request("https://kairos.internal/registry/kairos-customer-auth-sessions", {
      method: "POST",
      body: JSON.stringify({ operation: "put", key: `session:${token}`, record: { type: "customer-session", expiresAt: Date.now() + 60_000 } }),
    }));
    expect(put?.status).toBe(200);

    const get = await handleKairosCustomerAuthObjectRequest(state, new Request("https://kairos.internal/registry/kairos-customer-auth-sessions", {
      method: "POST",
      body: JSON.stringify({ operation: "get", key: `session:${token}` }),
    }));
    const payload = await get?.json();
    expect(payload.record.type).toBe("customer-session");
  });

  it("rejects expired auth records without returning their contents", async () => {
    const token = "b".repeat(43);
    const key = `kairos-customer-auth:session:${token}`;
    const state = { storage: storage({ [key]: { type: "customer-session", secret: "do-not-return", expiresAt: Date.now() - 1 } }) };
    const response = await handleKairosCustomerAuthObjectRequest(state, new Request("https://kairos.internal/registry/kairos-customer-auth-sessions", {
      method: "POST",
      body: JSON.stringify({ operation: "get", key: `session:${token}` }),
    }));
    const payload = await response?.json();
    expect(payload.record).toBeNull();
    expect(JSON.stringify(payload)).not.toContain("do-not-return");
  });

  it("resolves an opaque portal session to the server-verified Shopify customer", async () => {
    const accessToken = "shcat_server_only_access_token";
    const sessionToken = "c".repeat(43);
    const env = sessionEnv({
      type: "customer-session",
      shopifyCustomerId,
      kairosCustomerId: "customer_1",
      accessToken,
      refreshToken: "refresh",
      accessTokenExpiresAt: Date.now() + 30 * 60_000,
      expiresAt: Date.now() + 60 * 60_000,
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ graphql_api: "https://account.example.com/customer/api/2026-07/graphql" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { customer: { id: shopifyCustomerId } } }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const identity = await authenticateKairosCustomerRequest(new Request("https://kairos.example.com/api/kairos/customer/projects", {
      headers: { Authorization: `KairosSession ${sessionToken}` },
    }), env);
    expect(identity?.shopifyCustomerId).toBe(shopifyCustomerId);
    expect(identity?.mode).toBe("kairos-session");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not accept an opaque session identifier as a Shopify bearer token", async () => {
    const sessionToken = "d".repeat(43);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const identity = await authenticateKairosCustomerRequest(new Request("https://kairos.example.com/api/kairos/customer/projects", {
      headers: { Authorization: `Bearer ${sessionToken}` },
    }), sessionEnv(null));
    expect(identity).toBeNull();
  });
});
