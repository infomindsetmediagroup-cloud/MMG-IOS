import { afterEach, describe, expect, it, vi } from "vitest";
import { handleKairosCustomerRuntimeProjectionAPI, handleKairosCustomerRuntimeProjectionObjectRequest } from "../cloudflare/mmg-ios/src/kairos-customer-runtime-projection-store-v1.js";

function storage(records = []) { const map = new Map([["kairos-runtime-projects:records", records]]); return { get: async (key: string) => map.get(key), put: async (key: string, value: unknown) => map.set(key, value) }; }

const project = { projectId: "kproject_customer", customerId: "customer_1", title: "Book project", state: "awaiting_approval", progress: { percent: 40, stage: "planning" }, approvals: [{ required: true, gate: "production_plan", status: "pending" }], deliverables: [], events: [{ type: "project_created", state: "initialized", occurredAt: "2026-07-27T00:00:00Z" }] };
const shopifyCustomerId = "gid://shopify/Customer/123456789";

function authenticatedFetch() {
  return vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ graphql_api: "https://account.example.com/customer/api/2026-07/graphql" }), { status: 200, headers: { "Content-Type": "application/json" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { customer: { id: shopifyCustomerId } } }), { status: 200, headers: { "Content-Type": "application/json" } }));
}

function envWithForwarder(onForward: (value: any) => void = () => {}) {
  return {
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

afterEach(() => vi.restoreAllMocks());

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

  it("routes reads using the server-mapped Shopify customer identity", async () => {
    authenticatedFetch();
    let forwarded: any;
    await handleKairosCustomerRuntimeProjectionAPI(new Request("https://example.com/api/kairos/customer/projects", {
      headers: { Authorization: "Bearer shcat_test_customer_token" },
    }), envWithForwarder((value) => { forwarded = value; }));
    expect(forwarded).toEqual({ operation: "customer-list", customerId: "customer_1" });
  });

  it("rejects invalid or expired Shopify tokens", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ graphql_api: "https://account.example.com/customer/api/2026-07/graphql" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: "Unauthenticated" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await handleKairosCustomerRuntimeProjectionAPI(new Request("https://example.com/api/kairos/customer/projects", {
      headers: { Authorization: "Bearer expired" },
    }), envWithForwarder());
    expect(response?.status).toBe(401);
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
