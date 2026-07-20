import { describe, expect, it } from "vitest";
import {
  buildMMGMyLibrarySnapshot,
  type MMGMyLibraryOwnedAssetRecord,
} from "../server/customer-portal/my-library.js";

const record = (
  overrides: Partial<MMGMyLibraryOwnedAssetRecord> = {},
): MMGMyLibraryOwnedAssetRecord => ({
  assetId: "mmg-dd-ai-image-mastery-001",
  title: "AI Image Mastery™",
  summary: "A practical guide to AI image generation.",
  topic: "ai_image_generation",
  experienceLevel: "beginner",
  format: "guide",
  series: "AI Mastery Series",
  seriesOrder: 1,
  productUrl: "/products/ai-image-mastery",
  squareThumbnailUrl: "/files/aim-square.png",
  portraitCoverUrl: "/files/aim-cover.png",
  source: "subscription_delivery",
  grantedAt: "2026-07-20T20:00:00.000Z",
  subscriptionWindowStatus: "delivered",
  subscriptionDeliveredAt: "2026-07-20T20:05:00.000Z",
  readFileCount: 1,
  downloadFileCount: 1,
  ...overrides,
});

describe("MMG My Library domain model", () => {
  it("displays one item per canonical asset ID and aggregates grant sources", () => {
    const library = buildMMGMyLibrarySnapshot({
      records: [
        record(),
        record({
          source: "bonus",
          grantedAt: "2026-07-21T20:00:00.000Z",
          subscriptionWindowStatus: null,
          subscriptionDeliveredAt: null,
        }),
      ],
    });

    expect(library.totalAssets).toBe(1);
    expect(library.items[0]?.assetId).toBe("mmg-dd-ai-image-mastery-001");
    expect(library.items[0]?.ownership.sources).toEqual([
      "bonus",
      "subscription_delivery",
    ]);
    expect(library.items[0]?.ownership.firstGrantedAt).toBe(
      "2026-07-20T20:00:00.000Z",
    );
    expect(library.items[0]?.ownership.latestGrantedAt).toBe(
      "2026-07-21T20:00:00.000Z",
    );
  });

  it("keeps subscription-only ownership preparing until delivery completes", () => {
    const library = buildMMGMyLibrarySnapshot({
      records: [
        record({
          subscriptionWindowStatus: "delivery_ready",
          subscriptionDeliveredAt: null,
        }),
      ],
    });

    expect(library.items[0]?.delivery.state).toBe("preparing");
    expect(library.items[0]?.access).toEqual({
      readAvailable: false,
      downloadAvailable: false,
    });
  });

  it("enables available capabilities after subscription delivery", () => {
    const library = buildMMGMyLibrarySnapshot({ records: [record()] });

    expect(library.items[0]?.delivery).toEqual({
      state: "delivered",
      deliveredAt: "2026-07-20T20:05:00.000Z",
    });
    expect(library.items[0]?.access).toEqual({
      readAvailable: true,
      downloadAvailable: true,
    });
  });

  it("treats purchase, bonus, and administrative ownership as immediately ready", () => {
    for (const source of [
      "one_time_purchase",
      "bonus",
      "administrative",
    ] as const) {
      const library = buildMMGMyLibrarySnapshot({
        records: [
          record({
            source,
            subscriptionWindowStatus: null,
            subscriptionDeliveredAt: null,
            downloadFileCount: 1,
            readFileCount: 0,
          }),
        ],
      });

      expect(library.items[0]?.delivery.state).toBe("ready");
      expect(library.items[0]?.access).toEqual({
        readAvailable: false,
        downloadAvailable: true,
      });
    }
  });

  it("sorts newest ownership first and builds customer filters", () => {
    const library = buildMMGMyLibrarySnapshot({
      records: [
        record(),
        record({
          assetId: "mmg-dd-second-001",
          title: "Second Guide",
          topic: "creator_growth",
          format: "workbook",
          series: null,
          seriesOrder: null,
          grantedAt: "2026-07-22T10:00:00.000Z",
          source: "one_time_purchase",
          subscriptionWindowStatus: null,
          subscriptionDeliveredAt: null,
        }),
      ],
    });

    expect(library.items.map((item) => item.assetId)).toEqual([
      "mmg-dd-second-001",
      "mmg-dd-ai-image-mastery-001",
    ]);
    expect(library.filters.topics).toEqual([
      "ai_image_generation",
      "creator_growth",
    ]);
    expect(library.filters.formats).toEqual(["guide", "workbook"]);
    expect(library.filters.sources).toEqual([
      "one_time_purchase",
      "subscription_delivery",
    ]);
  });
});
