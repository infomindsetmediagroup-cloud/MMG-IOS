export type MMGOwnershipGrantSource =
  | "one_time_purchase"
  | "subscription_delivery"
  | "bonus"
  | "administrative";

export type MMGOwnershipGrantStatus = "pending" | "active" | "revoked";

export interface MMGOwnershipGrantRecord {
  id: string;
  customerId: string;
  assetId: string;
  source: MMGOwnershipGrantSource;
  sourceReference: string;
  status: MMGOwnershipGrantStatus;
  grantedAt: string;
  revokedAt: string | null;
}

export interface MMGOwnedAssetRecord {
  assetId: string;
  firstGrantedAt: string;
  latestGrantedAt: string;
  sources: MMGOwnershipGrantSource[];
  activeGrantIds: string[];
}

export interface MMGOwnershipSnapshot {
  schemaVersion: "1.0.0";
  customerId: string;
  totalOwnedAssets: number;
  ownedAssetIds: string[];
  assets: MMGOwnedAssetRecord[];
}

const timestamp = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const isMMGOwnershipGrantActive = (
  grant: MMGOwnershipGrantRecord,
  asOf: Date,
): boolean => {
  if (grant.status !== "active") return false;
  if (!grant.assetId.trim()) return false;
  if (timestamp(grant.grantedAt) > asOf.getTime()) return false;
  if (grant.revokedAt && timestamp(grant.revokedAt) <= asOf.getTime()) {
    return false;
  }
  return true;
};

export const buildMMGOwnershipSnapshot = (input: {
  customerId: string;
  grants: MMGOwnershipGrantRecord[];
  asOf: Date;
}): MMGOwnershipSnapshot => {
  const byAssetId = new Map<string, MMGOwnershipGrantRecord[]>();

  for (const grant of input.grants) {
    if (grant.customerId !== input.customerId) continue;
    if (!isMMGOwnershipGrantActive(grant, input.asOf)) continue;

    const assetId = grant.assetId.trim();
    const current = byAssetId.get(assetId) ?? [];
    current.push(grant);
    byAssetId.set(assetId, current);
  }

  const assets = [...byAssetId.entries()]
    .map(([assetId, grants]): MMGOwnedAssetRecord => {
      const sorted = [...grants].sort(
        (left, right) => timestamp(left.grantedAt) - timestamp(right.grantedAt),
      );
      return {
        assetId,
        firstGrantedAt: sorted[0]?.grantedAt ?? "",
        latestGrantedAt: sorted.at(-1)?.grantedAt ?? "",
        sources: [...new Set(sorted.map((grant) => grant.source))].sort(),
        activeGrantIds: sorted.map((grant) => grant.id),
      };
    })
    .sort((left, right) => left.assetId.localeCompare(right.assetId));

  return {
    schemaVersion: "1.0.0",
    customerId: input.customerId,
    totalOwnedAssets: assets.length,
    ownedAssetIds: assets.map((asset) => asset.assetId),
    assets,
  };
};

export const resolveMMGOwnedAssetIds = (input: {
  customerId: string;
  grants: MMGOwnershipGrantRecord[];
  asOf: Date;
}): ReadonlySet<string> =>
  new Set(buildMMGOwnershipSnapshot(input).ownedAssetIds);
