import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleKairosCustomerRuntimeProjectionAPI, handleKairosCustomerRuntimeProjectionObjectRequest } from "../cloudflare/mmg-ios/src/kairos-customer-runtime-projection-store-v1.js";

function storage(records = []) { const map = new Map([["kairos-runtime-projects:records", records]]); return { get: async (key: string) => map.get(key), put: async (key: string, value: unknown) => map.set(key, value) }; }

const project = { projectId: "kproject_customer", customerId: "customer_1", title: "Book project", state: "awaiting_approval", progress: { percent: 40, stage: "planning" }, approvals: [{ required: true, gate: "production_plan", status: "pending" }], deliverables: [], events: [{ type: "project_created", state: "initialized", occurredAt: "2026-07-27T00:00:00Z" }] };
const packageProject = {
  ...project,
  projectId: "kproject_package",
  state: "follow_up",
  progress: { percent: 100, stage: "delivery" },
  approvals: [{ required: true, gate: "production_plan", status: "approved" }],
  assets: [{ assetId: "asset_package", type: "customer_package", status: "ready", version: 1, sourceReference: "/api/production-registry/manuscripts/kproject-customer-12345678/deliverables/zip" }],
  deliverables: [{ deliverableId: "deliverable_package_kproject-customer-12345678", type: "digital_asset_package", status: "delivered", version: 1, assetIds: ["asset_package"], approved: true }],
  events: [{ type: "delivered", state: "follow_up", occurredAt: "2026-08-07T00:00:00Z", summary: "Final package delivered." }],
};
const shopifyCustomerId = "gid://shopify/Customer/123456789";

function authenticatedFetch() {
  return vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ graphql_api: "https://account.example.com/customer/api/2026-07/graphql" }), { status: 200, headers: { "Content-Type": "application/json" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { customer: { id: shopifyCustomerId } } }), { status: 200, headers: { "Content-Type": "application/json" } }));
}

function envWithForwarder(onForward: (value: any) => void = () => {}, forwardResponse: any = {}) {
  return {
    KAIROS_SHOPIFY_CUSTOMER_MAP: JSON.stringify({ [shopifyCustomerId]: "customer_1" }),
    KAIROS_PROJECTS: {
      idFromName: () => "id",
      get: () => ({
        fetch: async (request: Request) => {
          onForward(await request.json());
          return new Response(JSON.stringify(forwardResponse), { headers: { "Content-Type": "application/json" } });
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
      headers: { "cf-access-authenticated-user-email": "customer@example.com", "x-kairos-customer-id": "customer_1" },
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

  it("prevents cross-customer final package resolution", async () => {
    const state = { storage: storage([packageProject]) };
    const response = await handleKairosCustomerRuntimeProjectionObjectRequest(state, new Request("https://kairos.internal/registry/kairos-customer-runtime-projections", { method: "POST", body: JSON.stringify({ operation: "customer-package-resolve", customerId: "customer_2", projectId: packageProject.projectId }) }));
    expect(response?.status).toBe(404);
    const payload = await response?.json();
    expect(payload.manuscriptProjectId).toBeUndefined();
  });

  it("resolves an already-delivered package only for its owning customer", async () => {
    const state = { storage: storage([packageProject]) };
    const response = await handleKairosCustomerRuntimeProjectionObjectRequest(state, new Request("https://kairos.internal/registry/kairos-customer-runtime-projections", { method: "POST", body: JSON.stringify({ operation: "customer-package-resolve", customerId: "customer_1", projectId: packageProject.projectId }) }));
    const payload = await response?.json();
    expect(response?.status).toBe(200);
    expect(payload.manuscriptProjectId).toBe("kproject-customer-12345678");
  });

  it("does not resolve a package before delivery eligibility", async () => {
    const state = { storage: storage([{ ...packageProject, state: "packaging" }]) };
    const response = await handleKairosCustomerRuntimeProjectionObjectRequest(state, new Request("https://kairos.internal/registry/kairos-customer-runtime-projections", { method: "POST", body: JSON.stringify({ operation: "customer-package-resolve", customerId: "customer_1", projectId: packageProject.projectId }) }));
    expect(response?.status).toBe(409);
  });

  it("streams only the prebuilt package after authenticated ownership resolution", async () => {
    authenticatedFetch();
    const forwarded: any[] = [];
    const env = {
      ...envWithForwarder((value) => forwarded.push(value), { success: true, manuscriptProjectId: "kproject-customer-12345678" }),
      KAIROS_MANUSCRIPT_SOURCES: {
        idFromName: (value: string) => value,
        get: () => ({ fetch: async (request: Request) => {
          expect(request.method).toBe("GET");
          expect(new URL(request.url).pathname).toBe("/registry/manuscripts/kproject-customer-12345678/deliverables/zip");
          return new Response(new Uint8Array([80, 75, 3, 4]), { status: 200, headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=customer-package.zip" } });
        } }),
      },
    };
    const response = await handleKairosCustomerRuntimeProjectionAPI(new Request(`https://example.com/api/kairos/customer/projects/${packageProject.projectId}/deliverables/package`, { headers: { Authorization: "Bearer shcat_test_customer_token" } }), env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("application/zip");
    expect(forwarded[0]).toEqual({ operation: "customer-package-resolve", customerId: "customer_1", projectId: packageProject.projectId });
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

describe("authenticated customer portal contract", () => {
  const html = readFileSync(new URL("../web/kairos-dashboard/customer-portal.html", import.meta.url), "utf8");

  it("preserves the complete locked customer workspace information architecture", () => {
    for (const section of ["dashboard", "projects", "files", "approvals", "deliverables", "library", "subscriptions", "messages", "account"]) {
      expect(html).toContain(`id=\"${section}\"`);
    }
    expect(html).toContain("Proofs &amp; Approvals");
    expect(html).toContain("Mindset Media Group™");
  });

  it("uses authenticated same-origin APIs and never legacy browser customer identity", () => {
    expect(html).toContain("/api/customer/auth/session");
    expect(html).toContain("/api/kairos/customer/projects/");
    expect(html).toContain("/approve");
    expect(html).not.toContain("x-kairos-customer-id");
    expect(html).not.toContain("localStorage");
  });
});
