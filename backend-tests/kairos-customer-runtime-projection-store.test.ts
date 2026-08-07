import { describe, expect, it } from "vitest";
import {
  handleKairosCustomerRuntimeProjectionAPI,
  handleKairosCustomerRuntimeProjectionObjectRequest,
} from "../cloudflare/mmg-ios/src/kairos-customer-runtime-projection-store-v1.js";

function storage(records = []) {
  const map = new Map([["kairos-runtime-projects:records", records]]);
  return {
    get: async (key: string) => map.get(key),
    put: async (key: string, value: unknown) => map.set(key, value),
  };
}

const project = {
  projectId: "kproject_customer",
  customerId: "customer_1",
  title: "Book project",
  state: "awaiting_approval",
  progress: { percent: 40, stage: "planning" },
  approvals: [{ required: true, gate: "production_plan", status: "pending" }],
  deliverables: [],
  events: [
    {
      type: "project_created",
      state: "initialized",
      occurredAt: "2026-07-27T00:00:00Z",
    },
  ],
};

describe("Kairos customer runtime projection store", () => {
  it("requires authenticated customer context", async () => {
    const response = await handleKairosCustomerRuntimeProjectionAPI(
      new Request("https://example.com/api/kairos/customer/projects"),
      {},
    );
    expect(response?.status).toBe(401);
  });

  it("rejects a spoofed browser customer id even with a forged access email", async () => {
    const request = new Request(
      "https://example.com/api/kairos/customer/projects",
      {
        headers: {
          "cf-access-authenticated-user-email": "customer@example.com",
          "x-kairos-customer-id": "customer_1",
        },
      },
    );
    const response = await handleKairosCustomerRuntimeProjectionAPI(request, {});
    expect(response?.status).toBe(401);
  });

  it("routes authenticated server-scoped collection reads", async () => {
    let forwarded: any;
    const env = {
      KAIROS_CUSTOMER_ACCESS_TOKEN: "test-customer-service-token",
      KAIROS_PROJECTS: {
        idFromName: () => "id",
        get: () => ({
          fetch: async (request: Request) => {
            forwarded = await request.json();
            return new Response("{}");
          },
        }),
      },
    };
    const request = new Request(
      "https://example.com/api/kairos/customer/projects",
      {
        headers: {
          authorization: "Bearer test-customer-service-token",
          "x-kairos-customer-id": "customer_1",
        },
      },
    );
    await handleKairosCustomerRuntimeProjectionAPI(request, env);
    expect(forwarded).toEqual({
      operation: "customer-list",
      customerId: "customer_1",
    });
  });

  it("rejects an incorrect server access token", async () => {
    const request = new Request(
      "https://example.com/api/kairos/customer/projects",
      {
        headers: {
          authorization: "Bearer wrong-token",
          "x-kairos-customer-id": "customer_1",
        },
      },
    );
    const response = await handleKairosCustomerRuntimeProjectionAPI(request, {
      KAIROS_CUSTOMER_ACCESS_TOKEN: "expected-token",
    });
    expect(response?.status).toBe(401);
  });

  it("returns only projects belonging to the authenticated customer", async () => {
    const state = {
      storage: storage([
        project,
        {
          ...project,
          projectId: "kproject_other",
          customerId: "customer_2",
        },
      ]),
    };
    const response = await handleKairosCustomerRuntimeProjectionObjectRequest(
      state,
      new Request(
        "https://kairos.internal/registry/kairos-customer-runtime-projections",
        {
          method: "POST",
          body: JSON.stringify({
            operation: "customer-list",
            customerId: "customer_1",
          }),
        },
      ),
    );
    const payload = await response?.json();
    expect(payload.count).toBe(1);
    expect(payload.projects[0].projectId).toBe("kproject_customer");
  });

  it("prevents cross-customer item access without disclosing project data", async () => {
    const state = { storage: storage([project]) };
    const response = await handleKairosCustomerRuntimeProjectionObjectRequest(
      state,
      new Request(
        "https://kairos.internal/registry/kairos-customer-runtime-projections",
        {
          method: "POST",
          body: JSON.stringify({
            operation: "customer-read",
            customerId: "customer_2",
            projectId: "kproject_customer",
          }),
        },
      ),
    );
    expect(response?.status).toBe(403);
    const payload = await response?.json();
    expect(payload.project).toBeUndefined();
  });

  it("exposes no mutation, deployment, commerce, or publication authority", async () => {
    const state = { storage: storage([project]) };
    const response = await handleKairosCustomerRuntimeProjectionObjectRequest(
      state,
      new Request(
        "https://kairos.internal/registry/kairos-customer-runtime-projections",
        {
          method: "POST",
          body: JSON.stringify({
            operation: "customer-read",
            customerId: "customer_1",
            projectId: "kproject_customer",
          }),
        },
      ),
    );
    const payload = await response?.json();
    expect(payload.project.customerMutationAllowed).toBe(false);
    expect(payload.project.deploymentExecutionAllowed).toBe(false);
    expect(payload.project.commerceMutationAllowed).toBe(false);
    expect(payload.project.externalPublicationAllowed).toBe(false);
  });
});
