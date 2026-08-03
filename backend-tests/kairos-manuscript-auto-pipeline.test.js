import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  derivePublicationMetadata,
  resolveApprovedEditorialInput,
} from "../cloudflare/mmg-ios/src/kairos-manuscript-auto-pipeline-v1.js";

const AI_IMAGE_MANUSCRIPT = `# AI Image Mastery
A Practical Guide to Creating Better AI Images
By Michael King

AI Image Mastery helps creators build intentional AI-generated visuals through prompt architecture, visual direction, lighting, composition, style systems, and repeatable production workflows.

The guide explains how to plan imagery for branding, social content, publishing, marketing, product visuals, book covers, and campaign assets. It replaces random prompting with structured decisions about subject, environment, camera, perspective, mood, texture, and finish.

Creators learn to evaluate weak outputs, refine one variable at a time, preserve effective prompt patterns, and develop more consistent visual systems for future projects.`;

describe("Kairos automatic manuscript production metadata", () => {
  it("extracts the AI Image Mastery publication record without a catalog form", () => {
    const metadata = derivePublicationMetadata({
      source: { title: "AI Image Mastery" },
      manuscript: AI_IMAGE_MANUSCRIPT,
    });

    expect(metadata.title).toBe("AI Image Mastery");
    expect(metadata.subtitle).toBe("A Practical Guide to Creating Better AI Images");
    expect(metadata.author).toBe("Michael King");
    expect(metadata.publisher).toBe("Mindset Media Group");
    expect(metadata.publisherURL).toBe("https://themindsetmediagroup.com");
    expect(metadata.description).toContain("AI Image Mastery helps creators");
    expect(metadata.keywords).toHaveLength(7);
    expect(new Set(metadata.keywords).size).toBe(7);
    expect(metadata.categories).toEqual([
      "Computers / Artificial Intelligence / General",
      "Art / Digital",
      "Business & Economics / Marketing / General",
    ]);
    expect(metadata.handle).toBe("ai-image-mastery");
    expect(metadata.productType).toBe("Digital Download");
    expect(metadata.price).toBe("9.95");
    expect(metadata.currency).toBe("USD");
    expect(metadata.isbn).toBeNull();
    expect(metadata.asin).toBeNull();
    expect(metadata.rights.owner).toBe("Mindset Media Group");
    expect(metadata.rights.territories).toEqual(["Worldwide"]);
    expect(metadata.templateSuffix).toBe("mmg-ai-image-mastery");
    expect(metadata.extraction.manualCatalogEntryRequired).toBe(false);
  });

  it("uses the durable project setup as the authoritative title and author", () => {
    const metadata = derivePublicationMetadata({
      source: { title: "Initial Upload Name" },
      setup: {
        publicationTitle: "Approved Publication Title",
        authorName: "Approved Author",
      },
      manuscript: `# Draft Working Title\nBy Draft Author\n\nThis manuscript contains enough source text to derive a publication summary and a generic digital-product metadata record for the production pipeline.`,
    });

    expect(metadata.title).toBe("Approved Publication Title");
    expect(metadata.author).toBe("Approved Author");
    expect(metadata.handle).toBe("approved-publication-title");
  });

  it("routes non-AI publications to the canonical MMG book-product template", () => {
    const metadata = derivePublicationMetadata({
      source: { title: "Creator Business Foundations" },
      manuscript: `# Creator Business Foundations\nA Practical Operating Guide\nBy Michael King\n\nBuild a clear business foundation through audience research, offer design, pricing, customer experience, marketing, and repeatable operating systems.`,
    });

    expect(metadata.templateSuffix).toBe("mmg-book-product");
    expect(metadata.categories).toContain("Business & Economics / Entrepreneurship");
    expect(metadata.extraction.manualCatalogEntryRequired).toBe(false);
  });
});

describe("Kairos approved editorial manufacturing input", () => {
  it("loads and verifies the exact finalized customer-approved version", async () => {
    const projectId = "manuscript-approved-editorial-12345678";
    const versionId = "ver-approved-editorial-12345678";
    const manuscript = `${"Approved editorial manuscript content for deterministic manufacturing. ".repeat(12)}Final paragraph.`;
    const checksum = createHash("sha256").update(manuscript).digest("hex");
    const requests = [];
    const project = {
      async fetch(input) {
        const url = new URL(String(input));
        requests.push(url.pathname);
        if (url.pathname.endsWith("/editorial")) {
          return Response.json({
            status: "ready",
            editorial: {
              status: "ready-for-manufacturing",
              finalVersionId: versionId,
              updatedAt: "2026-08-03T15:12:00.000Z",
              review: {
                reviewId: "review-approved-12345678",
                decision: "approved",
                decidedAt: "2026-08-03T15:10:00.000Z",
              },
              versions: [{
                versionId,
                label: "Editorial Version 2",
                passType: "structural",
                wordCount: 85,
                characterCount: manuscript.length,
                checksum,
              }],
            },
          });
        }
        if (url.pathname.endsWith(`/editorial/versions/${versionId}`)) {
          return Response.json({ status: "ready", manuscript });
        }
        return Response.json({ error: { code: "not_found", message: "not found" } }, { status: 404 });
      },
    };

    const approved = await resolveApprovedEditorialInput(project, projectId);

    expect(approved.manuscript).toBe(manuscript);
    expect(approved.publicRecord).toMatchObject({
      versionId,
      checksum,
      reviewId: "review-approved-12345678",
      approvedAt: "2026-08-03T15:10:00.000Z",
    });
    expect(requests).toEqual([
      `/registry/manuscripts/${projectId}/editorial`,
      `/registry/manuscripts/${projectId}/editorial/versions/${versionId}`,
    ]);
  });

  it("blocks manufacturing before the editorial approval and finalization gate", async () => {
    const project = {
      fetch: async () => Response.json({
        status: "ready",
        editorial: {
          status: "awaiting-customer-review",
          finalVersionId: null,
          versions: [],
        },
      }),
    };

    await expect(resolveApprovedEditorialInput(project, "manuscript-awaiting-review-12345678"))
      .rejects.toMatchObject({ status: 409, code: "approved_editorial_required" });
  });
});
