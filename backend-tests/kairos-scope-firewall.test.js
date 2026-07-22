import { describe, expect, it } from "vitest";
import { createOperationManifest } from "../cloudflare/kairos/workflow-registry.js";
import { authorizeOperation } from "../cloudflare/kairos/scope-firewall.js";
import { handleKairosApiRequest } from "../cloudflare/kairos/runtime.js";

const WRITES_ON = { KAIROS_SHOPIFY_WRITES_ENABLED: "true" };

function approvedManifest(workflowId, targetIds, extras = {}) {
  return createOperationManifest({
    workflowId,
    targetIds,
    approvalRef: "approval-2026-07-22-001",
    approvedAt: "2026-07-22T18:00:00.000Z",
    ...extras,
  });
}

describe("Kairos operation-scope firewall", () => {
  it("gives manuscript workflows zero Shopify authority", () => {
    const manifest = createOperationManifest({
      workflowId: "manuscript.write.v1",
      targetIds: ["manuscript-001"],
    });

    expect(() => authorizeOperation({
      manifest,
      operationName: "shopify.menu.update",
      args: { id: "gid://shopify/Menu/1", title: "Menu", items: [] },
      env: WRITES_ON,
      idempotencyKey: "idem-1",
    })).toThrowError(expect.objectContaining({ code: "OPERATION_OUT_OF_SCOPE" }));
  });

  it("rejects a forged cross-domain manifest even if a Shopify operation is inserted", () => {
    const original = createOperationManifest({
      workflowId: "manuscript.write.v1",
      targetIds: ["manuscript-001"],
    });
    const forged = {
      ...original,
      targetIds: ["gid://shopify/Menu/1"],
      allowedOperations: ["shopify.menu.update"],
      allowedFields: ["title", "items"],
    };

    expect(() => authorizeOperation({
      manifest: forged,
      operationName: "shopify.menu.update",
      args: { id: "gid://shopify/Menu/1", title: "Menu", items: [] },
      env: WRITES_ON,
      idempotencyKey: "idem-2",
    })).toThrowError(expect.objectContaining({ code: "CROSS_DOMAIN_OPERATION_DENIED" }));
  });

  it("rejects exact-target drift", () => {
    const manifest = approvedManifest("shopify.product.update.v1", ["gid://shopify/Product/1"]);

    expect(() => authorizeOperation({
      manifest,
      operationName: "shopify.product.update",
      args: { product: { id: "gid://shopify/Product/2", title: "Wrong target" } },
      env: WRITES_ON,
      idempotencyKey: "idem-3",
    })).toThrowError(expect.objectContaining({ code: "TARGET_OUT_OF_SCOPE" }));
  });

  it("rejects fields outside the workflow allowlist", () => {
    const manifest = approvedManifest(
      "shopify.product.update.v1",
      ["gid://shopify/Product/1"],
      { allowedFields: ["id", "title"] },
    );

    expect(() => authorizeOperation({
      manifest,
      operationName: "shopify.product.update",
      args: {
        product: {
          id: "gid://shopify/Product/1",
          title: "Approved",
          vendor: "Not approved in this manifest",
        },
      },
      env: WRITES_ON,
      idempotencyKey: "idem-4",
    })).toThrowError(expect.objectContaining({ code: "FIELD_OUT_OF_SCOPE" }));
  });

  it("rejects Shopify writes while the global write gate is frozen", () => {
    const manifest = approvedManifest("shopify.page.update.v1", ["gid://shopify/Page/1"]);

    expect(() => authorizeOperation({
      manifest,
      operationName: "shopify.page.update",
      args: { id: "gid://shopify/Page/1", page: { title: "Scoped page" } },
      env: { KAIROS_SHOPIFY_WRITES_ENABLED: "false" },
      idempotencyKey: "idem-5",
    })).toThrowError(expect.objectContaining({ code: "SHOPIFY_WRITES_DISABLED" }));
  });

  it("requires idempotency for every approved write", () => {
    const manifest = approvedManifest("shopify.menu.update.v1", ["gid://shopify/Menu/1"]);

    expect(() => authorizeOperation({
      manifest,
      operationName: "shopify.menu.update",
      args: { id: "gid://shopify/Menu/1", title: "Scoped", items: [] },
      env: WRITES_ON,
    })).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_KEY_REQUIRED" }));
  });

  it("allows only exact approved theme file paths", () => {
    const manifest = approvedManifest(
      "shopify.theme.unpublished-files.upsert.v1",
      ["gid://shopify/OnlineStoreTheme/1"],
      { allowedFilePaths: ["sections/main-product.liquid"] },
    );

    expect(() => authorizeOperation({
      manifest,
      operationName: "shopify.theme.unpublishedFiles.upsert",
      args: {
        themeId: "gid://shopify/OnlineStoreTheme/1",
        files: [{ filename: "sections/header.liquid", body: { type: "TEXT", value: "x" } }],
      },
      env: WRITES_ON,
      idempotencyKey: "idem-6",
    })).toThrowError(expect.objectContaining({ code: "THEME_FILE_OUT_OF_SCOPE" }));
  });

  it("permits the read-only installation verification workflow", () => {
    const manifest = createOperationManifest({
      workflowId: "shopify.verify.connection.v1",
      targetIds: ["07kd8e-qw.myshopify.com"],
    });

    expect(authorizeOperation({
      manifest,
      operationName: "shopify.verifyInstallation",
      args: {},
      env: {},
    })).toMatchObject({
      operationName: "shopify.verifyInstallation",
      access: "read",
      targetId: "07kd8e-qw.myshopify.com",
    });
  });
});

describe("Cloudflare-native runtime identity", () => {
  it("reports no Vercel and no OpenAI dependency", async () => {
    const request = new Request("https://kairos.example/api/health");
    const response = await handleKairosApiRequest(request, {}, {});
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      runtime: "cloudflare",
      vercel: false,
      openAi: false,
      deterministic: true,
    });
  });
});
