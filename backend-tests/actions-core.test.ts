import { describe, expect, it } from "vitest";
import {
  buildCompletedAction,
  buildHomepageAuditQuery,
  parseApprovedActionRequest,
  parseHomepageAuditEvidence,
  requireShopifyConfiguration,
  shopifyGraphQLEndpoint,
} from "../api/actions-core.js";

describe("Shopify action execution core", () => {
  it("requires an explicit approval envelope", () => {
    expect(() => parseApprovedActionRequest({
      actionType: "shopify.homepage.audit",
      objective: "Audit the homepage",
    })).toThrow(/Approve this action/);

    expect(parseApprovedActionRequest({
      actionType: "shopify.homepage.audit",
      objective: "Audit the homepage",
      approval: {
        approved: true,
        actor: "MMG Executive",
        approvedAt: "2026-07-11T18:00:00.000Z",
      },
    }).approval.approved).toBe(true);
  });

  it("accepts only a myshopify admin domain", () => {
    const configuration = requireShopifyConfiguration({
      SHOPIFY_STORE_DOMAIN: "mindset-media-group.myshopify.com",
      SHOPIFY_ADMIN_ACCESS_TOKEN: "secret-token",
    });
    expect(shopifyGraphQLEndpoint(configuration)).toBe(
      "https://mindset-media-group.myshopify.com/admin/api/2026-07/graphql.json",
    );
    expect(() => requireShopifyConfiguration({
      SHOPIFY_STORE_DOMAIN: "example.com",
      SHOPIFY_ADMIN_ACCESS_TOKEN: "secret-token",
    })).toThrow(/domain is invalid/);
  });

  it("queries only live homepage evidence", () => {
    const request = buildHomepageAuditQuery();
    expect(request.query).toContain("roles: [MAIN]");
    expect(request.query).toContain("templates/index.json");
    expect(request.query).not.toContain("mutation");
  });

  it("parses evidence and builds a completed action", () => {
    const evidence = parseHomepageAuditEvidence({
      data: {
        themes: {
          nodes: [{
            id: "gid://shopify/OnlineStoreTheme/1",
            name: "MMG Live",
            role: "MAIN",
            updatedAt: "2026-07-11T18:00:00Z",
            processing: false,
            processingFailed: false,
            files: { nodes: [{ filename: "templates/index.json" }] },
          }],
        },
      },
    });
    const result = buildCompletedAction(
      evidence,
      new Date("2026-07-11T18:00:00Z"),
      new Date("2026-07-11T18:00:01Z"),
    );
    expect(result.status).toBe("completed");
    expect(result.evidence.role).toBe("MAIN");
    expect(result.evidence.homepageFiles).toEqual(["templates/index.json"]);
  });
});
