import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleKairosCustomerRuntimeProjectionAPI, handleKairosCustomerRuntimeProjectionObjectRequest } from "../cloudflare/mmg-ios/src/kairos-customer-runtime-projection-store-v1.js";

function storage(records = []) { const map = new Map([["kairos-runtime-projects:records", records]]); return { get: async (key: string) => map.get(key), put: async (key: string, value: unknown) => map.set(key, value) }; }

const project = { projectId: "kproject_customer", customerId: "customer_1", title: "Book project", state: "awaiting_approval", progress: { percent: 40, stage: "planning" }, approvals: [{ required: true, gate: "production_plan", status: "pending" }], deliverables: [], events: [{ type: "project_created", state: "initialized", occurredAt: "2026-07-27T00:00:00Z" }] };
const shopifyCustomerId = "gid://shopify/Customer/123456789";
const shopifyClientId = "kairos-customer-account-client";
const shopifyClientSecret = "test-only-shopify-client-secret";
const shopifyShopDomain = "07kd8e-qw.myshopify.com";

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createSessionToken(customerId = shopifyCustomerId, overrides: Record<string, unknown> = {}, secret = shopifyClientSecret) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    dest: shopifyShopDomain,
    aud: shopifyClientId,
    sub: customerId,
    iat: now,
    nbf: now - 1,
    exp: now + 300,
    jti: "vitest-session",
    ...overrides,
  });
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function authenticatedRequest(path = "/api/kairos/customer/projects", token = createSessionToken()) {
  return new Request(`https://example.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function envWithForwarder(onForward: (value: any) => void = () => {}) {
  return {
    SHOPIFY_CLIENT_ID: shopifyClientId,
    SHOPIFY_CLIENT_SECRET: shopifyClientSecret,
    SHOPIFY_STORE_DOMAIN: shopifyShopDomain,
    KAIROS_SHOPIFY_CUSTOMER_MAP: JSON.stringify({ [shopifyCustomerId]: "customer_1" }),
    KAIROS_PROJECTS: {
      idFromName: () => "id",
      get: () => ({
        fetch: async (request: Request) => {
          onForward(await request.json());
          return new Response("{}", { headers: { "Content-Type": "application/json" } });
        },
      }),
    },
  };
}

describe("Kairos customer runtime projection store", () => {
  it("requires authenticated Shopify customer context", async () => {
    const response = await handleKairosCustomerRuntimeProjectionAPI(new Request("https://example.com/api/kairos/customer/projects"), {});
    expect(response?.status).toBe(401);
  });

  it("ignores forged browser customer headers", async () => {
    const response = await handleKairosCustomerRuntimeProjectionAPI(new Request("https://example.com/api/kairos/customer/projects", {
      headers: {
        "cf-access-authenticated-user-email": "customer@example.com",
        "x-kairos-customer-id": "customer_1",
      },
    }), envWithForwarder());
    expect(response?.status).toBe(401);
  });

  it("routes reads using the server-verified Shopify customer session identity", async () => {
    let forwarded: any;
    const response = await handleKairosCustomerRuntimeProjectionAPI(
      authenticatedRequest(),
      envWithForwarder((value) => { forwarded = value; }),
    );
    expect(response?.status).toBe(200);
    expect(forwarded).toEqual({ operation: "customer-list", customerId: "customer_1" });
  });

  it("rejects invalid Shopify session signatures", async () => {
    const response = await handleKairosCustomerRuntimeProjectionAPI(
      authenticatedRequest("/api/kairos/customer/projects", createSessionToken(shopifyCustomerId, {}, "wrong-secret")),
      envWithForwarder(),
    );
    expect(response?.status).toBe(401);
  });

  it("returns 503 when Shopify session verification is not configured", async () => {
    const response = await handleKairosCustomerRuntimeProjectionAPI(
      authenticatedRequest(),
      { KAIROS_PROJECTS: envWithForwarder().KAIROS_PROJECTS },
    );
    expect(response?.status).toBe(503);
    const payload = await response?.json();
    expect(payload.error.code).toBe("CUSTOMER_AUTH_UNAVAILABLE");
  });

  it("serves Customer Account extension CORS preflight before authentication", async () => {
    const response = await handleKairosCustomerRuntimeProjectionAPI(new Request("https://example.com/api/kairos/customer/projects", {
      method: "OPTIONS",
      headers: {
        Origin: "null",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    }), {});
    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-origin")).toBe("*");
    expect(response?.headers.get("access-control-allow-headers")).toContain("Authorization");
  });

  it("returns only projects belonging to the authenticated customer", async () => {
    const state = { storage: storage([project, { ...project, projectId: "kproject_other", customerId: "customer_2" }]) };
    const response = await handleKairosCustomerRuntimeProjectionObjectRequest(state, new Request("https://kairos.internal/registry/kairos-customer-runtime-projections", { method: "POST", body: JSON.stringify({ operation: "customer-list", customerId: "customer_1" }) }));
    const payload = await response?.json();
    expect(payload.count).toBe(1);
    expect(payload.projects[0].projectId).toBe("kproject_customer");
  });

  it("prevents cross-customer item access without disclosing project data", async () => {
    const state = { storage: storage([project]) };
    const response = await handleKairosCustomerRuntimeProjectionObjectRequest(state, new Request("https://kairos.internal/registry/kairos-customer-runtime-projections", { method: "POST", body: JSON.stringify({ operation: "customer-read", customerId: "customer_2", projectId: "kproject_customer" }) }));
    expect(response?.status).toBe(404);
    const payload = await response?.json();
    expect(payload.project).toBeUndefined();
  });

  it("prevents cross-customer mutations without disclosing project data", async () => {
    const state = { storage: storage([project]) };
    const response = await handleKairosCustomerRuntimeProjectionObjectRequest(state, new Request("https://kairos.internal/registry/kairos-customer-runtime-projections", { method: "POST", body: JSON.stringify({ operation: "customer-approve", customerId: "customer_2", projectId: "kproject_customer", input: { gate: "production_plan", decision: "approved" } }) }));
    expect(response?.status).toBe(404);
  });

  it("exposes no mutation, deployment, commerce, or publication authority", async () => {
    const state = { storage: storage([project]) };
    const response = await handleKairosCustomerRuntimeProjectionObjectRequest(state, new Request("https://kairos.internal/registry/kairos-customer-runtime-projections", { method: "POST", body: JSON.stringify({ operation: "customer-read", customerId: "customer_1", projectId: "kproject_customer" }) }));
    const payload = await response?.json();
    expect(payload.project.customerMutationAllowed).toBe(false);
    expect(payload.project.deploymentExecutionAllowed).toBe(false);
    expect(payload.project.commerceMutationAllowed).toBe(false);
    expect(payload.project.externalPublicationAllowed).toBe(false);
  });
});
