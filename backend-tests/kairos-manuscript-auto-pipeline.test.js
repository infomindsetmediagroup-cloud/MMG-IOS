import { describe, expect, it } from "vitest";
import { derivePublicationMetadata } from "../cloudflare/mmg-ios/src/kairos-manuscript-auto-pipeline-v1.js";

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
