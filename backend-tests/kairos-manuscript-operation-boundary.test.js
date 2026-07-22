import { describe, expect, it } from "vitest";
import { inspectManuscriptOperation } from "../cloudflare/mmg-ios/src/kairos-manuscript-operation-boundary-v1.js";

function request(path, method = "GET", body) {
  return new Request(`https://kairos.test${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Kairos manuscript-only operation boundary", () => {
  it("allows read-only requests", async () => {
    const result = await inspectManuscriptOperation(request("/api/capabilities"));
    expect(result.allowed).toBe(true);
    expect(result.scope).toBe("read-only");
  });

  it("allows manuscript intake and durable manuscript project writes", async () => {
    expect((await inspectManuscriptOperation(request("/api/manuscript/intake/advance", "POST", {}))).allowed).toBe(true);
    expect((await inspectManuscriptOperation(request("/api/production-registry/manuscripts/manuscript-studio-12345678/setup", "POST", {}))).allowed).toBe(true);
    expect((await inspectManuscriptOperation(request("/api/production-registry/projects/manuscript-studio-12345678", "PATCH", {}))).allowed).toBe(true);
  });

  it("allows only an exact manuscript workspace registration", async () => {
    const manuscript = await inspectManuscriptOperation(request(
      "/api/production-registry/projects",
      "POST",
      {
        projectId: "manuscript-studio-12345678",
        projectType: "manuscript-studio",
        activeWorkspace: "manuscript-studio",
        title: "New Manuscript Project",
      },
    ));
    expect(manuscript.allowed).toBe(true);
    expect(manuscript.scope).toBe("manuscript-workspace-registration");

    for (const body of [
      { projectId: "product-12345678", projectType: "complete-product", activeWorkspace: "complete-product" },
      { projectId: "manuscript-studio-12345678", projectType: "complete-product", activeWorkspace: "manuscript-studio" },
      { projectId: "manuscript-studio-12345678", projectType: "manuscript-studio", activeWorkspace: "website" },
      { projectId: "arbitrary-12345678", projectType: "manuscript-studio", activeWorkspace: "manuscript-studio" },
    ]) {
      const denied = await inspectManuscriptOperation(request("/api/production-registry/projects", "POST", body));
      expect(denied.allowed).toBe(false);
      expect(denied.code).toBe("NON_MANUSCRIPT_REGISTRY_WRITE_DENIED");
    }
  });

  it("allows only book-package content generation", async () => {
    const book = await inspectManuscriptOperation(request("/api/content/generate", "POST", { type: "book_package" }));
    const product = await inspectManuscriptOperation(request("/api/content/generate", "POST", { type: "product_asset_copy" }));
    expect(book.allowed).toBe(true);
    expect(product.allowed).toBe(false);
    expect(product.code).toBe("NON_MANUSCRIPT_CONTENT_DENIED");
  });

  it("allows only the publishing objective through the hub", async () => {
    const publishing = await inspectManuscriptOperation(request("/api/hub/run", "POST", { action: "publishing-studio" }));
    const website = await inspectManuscriptOperation(request("/api/hub/run", "POST", { action: "website-builder" }));
    expect(publishing.allowed).toBe(true);
    expect(website.allowed).toBe(false);
    expect(website.code).toBe("NON_MANUSCRIPT_HUB_ACTION_DENIED");
  });

  it("denies Shopify, navigation, homepage, theme, and product publication mutations", async () => {
    for (const path of [
      "/api/shopify/page-shell/publish",
      "/api/navigation/native-main-menu/publish",
      "/api/theme/menu-hotfix/publish",
      "/api/website-builder/publish",
      "/api/product-publication/publish",
    ]) {
      const result = await inspectManuscriptOperation(request(path, "POST", {}));
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("WEBSITE_MUTATION_DENIED");
    }
  });

  it("denies unrelated mutations by default", async () => {
    const result = await inspectManuscriptOperation(request("/api/analytics/recalculate", "POST", {}));
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("OPERATION_OUT_OF_SCOPE");
  });
});
