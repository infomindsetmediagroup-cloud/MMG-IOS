import type {
  MMGSQLExecutor,
  MMGTransactionalDatabase,
} from "../knowledge-library/persistence.js";
import type {
  MMGMyLibraryAccessKind,
  MMGMyLibraryOwnedAssetRecord,
  MMGMyLibraryOwnershipSource,
} from "./my-library.js";

export interface MMGMyLibraryFileRecord {
  id: string;
  assetId: string;
  accessKind: MMGMyLibraryAccessKind;
  displayName: string;
  downloadName: string;
  mediaType: string;
  storageProvider: string;
  storageObjectKey: string;
  fileSizeBytes: number | null;
}

export interface MMGMyLibraryAccessRequestRecord {
  requestId: string;
  customerId: string;
  assetId: string;
  accessKind: MMGMyLibraryAccessKind;
  createdAt: Date;
}

export type MMGMyLibraryAccessRequestStatus = "granted" | "denied" | "failed";

export interface MMGMyLibraryRepository {
  loadOwnedAssetRecords(
    customerId: string,
    asOf: Date,
  ): Promise<MMGMyLibraryOwnedAssetRecord[]>;
  claimAccessRequest(request: MMGMyLibraryAccessRequestRecord): Promise<boolean>;
  loadAccessibleFile(input: {
    customerId: string;
    assetId: string;
    accessKind: MMGMyLibraryAccessKind;
    asOf: Date;
  }): Promise<MMGMyLibraryFileRecord | null>;
  completeAccessRequest(input: {
    requestId: string;
    customerId: string;
    assetId: string;
    accessKind: MMGMyLibraryAccessKind;
    status: MMGMyLibraryAccessRequestStatus;
    fileId: string | null;
    expiresAt: Date | null;
    failureCode: string | null;
    eventPayload?: Record<string, unknown>;
  }): Promise<void>;
}

interface OwnedAssetRow extends Record<string, unknown> {
  asset_id: string;
  title: string;
  summary: string | null;
  topic: string;
  experience_level: string;
  digital_format: string;
  series: string | null;
  series_order: number | string | null;
  product_url: string;
  square_thumbnail_url: string;
  portrait_cover_url: string;
  source: string;
  granted_at: Date | string;
  subscription_window_status: string | null;
  subscription_delivered_at: Date | string | null;
  read_file_count: number | string;
  download_file_count: number | string;
}

interface FileRow extends Record<string, unknown> {
  id: string;
  asset_id: string;
  access_kind: string;
  display_name: string;
  download_name: string;
  media_type: string;
  storage_provider: string;
  storage_object_key: string;
  file_size_bytes: number | string | null;
}

const integer = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const nullableInteger = (value: unknown): number | null =>
  value === null || value === undefined ? null : integer(value);

const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const requiredISO = (value: unknown): string => iso(value) ?? new Date(0).toISOString();

const mapOwnedAsset = (row: OwnedAssetRow): MMGMyLibraryOwnedAssetRecord => ({
  assetId: row.asset_id,
  title: row.title,
  summary: row.summary,
  topic: row.topic,
  experienceLevel: row.experience_level,
  format: row.digital_format,
  series: row.series,
  seriesOrder: nullableInteger(row.series_order),
  productUrl: row.product_url,
  squareThumbnailUrl: row.square_thumbnail_url,
  portraitCoverUrl: row.portrait_cover_url,
  source: row.source as MMGMyLibraryOwnershipSource,
  grantedAt: requiredISO(row.granted_at),
  subscriptionWindowStatus: row.subscription_window_status,
  subscriptionDeliveredAt: iso(row.subscription_delivered_at),
  readFileCount: integer(row.read_file_count),
  downloadFileCount: integer(row.download_file_count),
});

const mapFile = (row: FileRow): MMGMyLibraryFileRecord => ({
  id: row.id,
  assetId: row.asset_id,
  accessKind: row.access_kind as MMGMyLibraryAccessKind,
  displayName: row.display_name,
  downloadName: row.download_name,
  mediaType: row.media_type,
  storageProvider: row.storage_provider,
  storageObjectKey: row.storage_object_key,
  fileSizeBytes: nullableInteger(row.file_size_bytes),
});

const OWNED_ASSETS_SQL = `
  SELECT
    asset.asset_id,
    asset.title,
    asset.summary,
    asset.topic,
    asset.experience_level,
    asset.digital_format,
    asset.series,
    asset.series_order,
    asset.product_url,
    asset.square_thumbnail_url,
    asset.portrait_cover_url,
    ownership.source,
    ownership.granted_at,
    latest_delivery.window_status AS subscription_window_status,
    latest_delivery.delivered_at AS subscription_delivered_at,
    COALESCE(file_counts.read_file_count, 0)::integer AS read_file_count,
    COALESCE(file_counts.download_file_count, 0)::integer AS download_file_count
  FROM mmg_ownership_grants ownership
  JOIN mmg_knowledge_assets asset ON asset.asset_id = ownership.asset_id
  LEFT JOIN LATERAL (
    SELECT window.status AS window_status, window.delivered_at
    FROM mmg_delivery_grants grant_record
    JOIN mmg_entitlement_windows window ON window.id = grant_record.window_id
    WHERE grant_record.customer_id = ownership.customer_id
      AND grant_record.asset_id = ownership.asset_id
      AND grant_record.status = 'active'
    ORDER BY grant_record.granted_at DESC, grant_record.id DESC
    LIMIT 1
  ) latest_delivery ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE delivery_file.access_kind = 'read') AS read_file_count,
      COUNT(*) FILTER (WHERE delivery_file.access_kind = 'download') AS download_file_count
    FROM mmg_asset_delivery_files delivery_file
    WHERE delivery_file.asset_id = ownership.asset_id
      AND delivery_file.status = 'active'
      AND delivery_file.is_primary = TRUE
  ) file_counts ON TRUE
  WHERE ownership.customer_id = $1
    AND ownership.status = 'active'
    AND ownership.granted_at <= $2
    AND (ownership.revoked_at IS NULL OR ownership.revoked_at > $2)
    AND asset.product_type = 'digital_download'
    AND asset.asset_status IN ('approved', 'active', 'retired')
  ORDER BY ownership.granted_at DESC, asset.title ASC
`;

const ACCESSIBLE_FILE_SQL = `
  SELECT
    delivery_file.id,
    delivery_file.asset_id,
    delivery_file.access_kind,
    delivery_file.display_name,
    delivery_file.download_name,
    delivery_file.media_type,
    delivery_file.storage_provider,
    delivery_file.storage_object_key,
    delivery_file.file_size_bytes
  FROM mmg_asset_delivery_files delivery_file
  WHERE delivery_file.asset_id = $2
    AND delivery_file.access_kind = $3
    AND delivery_file.status = 'active'
    AND delivery_file.is_primary = TRUE
    AND EXISTS (
      SELECT 1
      FROM mmg_ownership_grants ownership
      WHERE ownership.customer_id = $1
        AND ownership.asset_id = $2
        AND ownership.status = 'active'
        AND ownership.granted_at <= $4
        AND (ownership.revoked_at IS NULL OR ownership.revoked_at > $4)
    )
    AND (
      EXISTS (
        SELECT 1
        FROM mmg_ownership_grants ownership
        WHERE ownership.customer_id = $1
          AND ownership.asset_id = $2
          AND ownership.status = 'active'
          AND ownership.source IN ('one_time_purchase', 'bonus', 'administrative')
          AND ownership.granted_at <= $4
          AND (ownership.revoked_at IS NULL OR ownership.revoked_at > $4)
      )
      OR EXISTS (
        SELECT 1
        FROM mmg_ownership_grants ownership
        JOIN mmg_delivery_grants delivery_grant
          ON delivery_grant.customer_id = ownership.customer_id
         AND delivery_grant.asset_id = ownership.asset_id
         AND delivery_grant.status = 'active'
        JOIN mmg_entitlement_windows window ON window.id = delivery_grant.window_id
        WHERE ownership.customer_id = $1
          AND ownership.asset_id = $2
          AND ownership.status = 'active'
          AND ownership.source = 'subscription_delivery'
          AND ownership.granted_at <= $4
          AND (ownership.revoked_at IS NULL OR ownership.revoked_at > $4)
          AND window.status = 'delivered'
      )
    )
  ORDER BY delivery_file.sort_order ASC, delivery_file.created_at ASC
  LIMIT 1
`;

export class MMGPostgresMyLibraryRepository implements MMGMyLibraryRepository {
  readonly #database: MMGTransactionalDatabase;

  constructor(database: MMGTransactionalDatabase) {
    this.#database = database;
  }

  async loadOwnedAssetRecords(
    customerId: string,
    asOf: Date,
  ): Promise<MMGMyLibraryOwnedAssetRecord[]> {
    const result = await this.#database.query<OwnedAssetRow>(OWNED_ASSETS_SQL, [
      customerId,
      asOf,
    ]);
    return result.rows.map(mapOwnedAsset);
  }

  async claimAccessRequest(
    request: MMGMyLibraryAccessRequestRecord,
  ): Promise<boolean> {
    return this.#database.transaction(async (transaction) => {
      const result = await transaction.query(
        `
          INSERT INTO mmg_library_access_requests (
            request_id,
            customer_id,
            asset_id,
            access_kind,
            status,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, 'pending', $5, $5)
          ON CONFLICT (request_id) DO NOTHING
        `,
        [
          request.requestId,
          request.customerId,
          request.assetId,
          request.accessKind,
          request.createdAt,
        ],
      );

      if (result.rowCount === 0) return false;

      await transaction.query(
        `
          INSERT INTO mmg_library_access_events (
            request_id,
            customer_id,
            asset_id,
            access_kind,
            event_type
          )
          VALUES ($1, $2, $3, $4, 'access_requested')
        `,
        [
          request.requestId,
          request.customerId,
          request.assetId,
          request.accessKind,
        ],
      );
      return true;
    });
  }

  async loadAccessibleFile(input: {
    customerId: string;
    assetId: string;
    accessKind: MMGMyLibraryAccessKind;
    asOf: Date;
  }): Promise<MMGMyLibraryFileRecord | null> {
    const result = await this.#database.query<FileRow>(ACCESSIBLE_FILE_SQL, [
      input.customerId,
      input.assetId,
      input.accessKind,
      input.asOf,
    ]);
    return result.rows[0] ? mapFile(result.rows[0]) : null;
  }

  async completeAccessRequest(input: {
    requestId: string;
    customerId: string;
    assetId: string;
    accessKind: MMGMyLibraryAccessKind;
    status: MMGMyLibraryAccessRequestStatus;
    fileId: string | null;
    expiresAt: Date | null;
    failureCode: string | null;
    eventPayload?: Record<string, unknown>;
  }): Promise<void> {
    await this.#database.transaction(async (transaction: MMGSQLExecutor) => {
      await transaction.query(
        `
          UPDATE mmg_library_access_requests
          SET
            status = $2,
            file_id = $3,
            signed_url_expires_at = $4,
            failure_code = $5,
            updated_at = NOW()
          WHERE request_id = $1
            AND customer_id = $6
            AND asset_id = $7
            AND access_kind = $8
            AND status = 'pending'
        `,
        [
          input.requestId,
          input.status,
          input.fileId,
          input.expiresAt,
          input.failureCode,
          input.customerId,
          input.assetId,
          input.accessKind,
        ],
      );

      const eventType =
        input.status === "granted"
          ? "access_granted"
          : input.status === "denied"
            ? "access_denied"
            : "access_failed";

      await transaction.query(
        `
          INSERT INTO mmg_library_access_events (
            request_id,
            customer_id,
            asset_id,
            access_kind,
            event_type,
            event_payload
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          input.requestId,
          input.customerId,
          input.assetId,
          input.accessKind,
          eventType,
          JSON.stringify(input.eventPayload ?? {}),
        ],
      );
    });
  }
}
