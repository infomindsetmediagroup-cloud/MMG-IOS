export type MMGMyLibraryOwnershipSource =
  | "one_time_purchase"
  | "subscription_delivery"
  | "bonus"
  | "administrative";

export type MMGMyLibraryAccessKind = "read" | "download";
export type MMGMyLibraryDeliveryState = "preparing" | "ready" | "delivered";

export interface MMGMyLibraryOwnedAssetRecord {
  assetId: string;
  title: string;
  summary: string | null;
  topic: string;
  experienceLevel: string;
  format: string;
  series: string | null;
  seriesOrder: number | null;
  productUrl: string;
  squareThumbnailUrl: string;
  portraitCoverUrl: string;
  source: MMGMyLibraryOwnershipSource;
  grantedAt: string;
  subscriptionWindowStatus: string | null;
  subscriptionDeliveredAt: string | null;
  readFileCount: number;
  downloadFileCount: number;
}

export interface MMGMyLibraryItem {
  assetId: string;
  title: string;
  summary: string | null;
  topic: string;
  experienceLevel: string;
  format: string;
  series: string | null;
  seriesOrder: number | null;
  productUrl: string;
  squareThumbnailUrl: string;
  portraitCoverUrl: string;
  ownership: {
    sources: MMGMyLibraryOwnershipSource[];
    firstGrantedAt: string;
    latestGrantedAt: string;
  };
  delivery: {
    state: MMGMyLibraryDeliveryState;
    deliveredAt: string | null;
  };
  access: {
    readAvailable: boolean;
    downloadAvailable: boolean;
  };
}

export interface MMGMyLibrarySnapshot {
  schemaVersion: "1.0.0";
  totalAssets: number;
  filters: {
    topics: string[];
    formats: string[];
    sources: MMGMyLibraryOwnershipSource[];
  };
  items: MMGMyLibraryItem[];
}

const timestamp = (value: string | null): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const uniqueSorted = <Value extends string>(values: Value[]): Value[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const deliveryStateFor = (
  records: MMGMyLibraryOwnedAssetRecord[],
): { state: MMGMyLibraryDeliveryState; deliveredAt: string | null } => {
  const hasImmediateOwnership = records.some((record) =>
    ["one_time_purchase", "bonus", "administrative"].includes(record.source),
  );

  if (hasImmediateOwnership) {
    return { state: "ready", deliveredAt: null };
  }

  const deliveredAt = records
    .map((record) => record.subscriptionDeliveredAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => timestamp(right) - timestamp(left))[0] ?? null;

  const hasDeliveredWindow = records.some(
    (record) => record.subscriptionWindowStatus === "delivered",
  );

  if (hasDeliveredWindow) {
    return { state: "delivered", deliveredAt };
  }

  return { state: "preparing", deliveredAt: null };
};

export const buildMMGMyLibrarySnapshot = (input: {
  records: MMGMyLibraryOwnedAssetRecord[];
}): MMGMyLibrarySnapshot => {
  const grouped = new Map<string, MMGMyLibraryOwnedAssetRecord[]>();

  for (const record of input.records) {
    const assetId = record.assetId.trim();
    if (!assetId) continue;
    const current = grouped.get(assetId) ?? [];
    current.push(record);
    grouped.set(assetId, current);
  }

  const items = [...grouped.entries()]
    .map(([assetId, records]): MMGMyLibraryItem => {
      const sorted = [...records].sort(
        (left, right) => timestamp(left.grantedAt) - timestamp(right.grantedAt),
      );
      const canonical = sorted.at(-1) ?? sorted[0];
      if (!canonical) {
        throw new Error(`Owned asset ${assetId} has no canonical record.`);
      }

      const delivery = deliveryStateFor(records);
      const deliveryReady = delivery.state !== "preparing";

      return {
        assetId,
        title: canonical.title,
        summary: canonical.summary,
        topic: canonical.topic,
        experienceLevel: canonical.experienceLevel,
        format: canonical.format,
        series: canonical.series,
        seriesOrder: canonical.seriesOrder,
        productUrl: canonical.productUrl,
        squareThumbnailUrl: canonical.squareThumbnailUrl,
        portraitCoverUrl: canonical.portraitCoverUrl,
        ownership: {
          sources: uniqueSorted(records.map((record) => record.source)),
          firstGrantedAt: sorted[0]?.grantedAt ?? canonical.grantedAt,
          latestGrantedAt: sorted.at(-1)?.grantedAt ?? canonical.grantedAt,
        },
        delivery,
        access: {
          readAvailable:
            deliveryReady && records.some((record) => record.readFileCount > 0),
          downloadAvailable:
            deliveryReady && records.some((record) => record.downloadFileCount > 0),
        },
      };
    })
    .sort((left, right) => {
      const dateDifference =
        timestamp(right.ownership.latestGrantedAt) -
        timestamp(left.ownership.latestGrantedAt);
      return dateDifference || left.title.localeCompare(right.title);
    });

  return {
    schemaVersion: "1.0.0",
    totalAssets: items.length,
    filters: {
      topics: uniqueSorted(items.map((item) => item.topic).filter(Boolean)),
      formats: uniqueSorted(items.map((item) => item.format).filter(Boolean)),
      sources: uniqueSorted(items.flatMap((item) => item.ownership.sources)),
    },
    items,
  };
};
