import {
  buildMMGMyLibrarySnapshot,
  type MMGMyLibraryAccessKind,
  type MMGMyLibrarySnapshot,
} from "./my-library.js";
import type {
  MMGMyLibraryFileRecord,
  MMGMyLibraryRepository,
} from "./my-library-repository.js";

export interface MMGMyLibraryPrincipal {
  customerId: string;
  sessionId: string;
}

export interface MMGMyLibraryStorageGateway {
  createSignedAccess(input: {
    storageProvider: string;
    storageObjectKey: string;
    disposition: "inline" | "attachment";
    mediaType: string;
    downloadName: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: Date }>;
}

export interface MMGMyLibrarySuccess {
  status: 200;
  body: {
    ok: true;
    library: MMGMyLibrarySnapshot;
  };
}

export interface MMGMyLibraryAccessSuccess {
  status: 200;
  body: {
    ok: true;
    access: {
      kind: MMGMyLibraryAccessKind;
      url: string;
      expiresAt: string;
      fileName: string;
      mediaType: string;
    };
  };
}

export interface MMGMyLibraryFailure {
  status: 400 | 404 | 409 | 502;
  body: {
    ok: false;
    error: {
      code: string;
      message: string;
      retryable: boolean;
    };
  };
}

export type MMGMyLibraryAccessResponse =
  | MMGMyLibraryAccessSuccess
  | MMGMyLibraryFailure;

const safeIdentifier = (value: string, minimum = 1, maximum = 255): boolean => {
  const trimmed = value.trim();
  return (
    trimmed.length >= minimum &&
    trimmed.length <= maximum &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(trimmed)
  );
};

const validAccessKind = (value: string): value is MMGMyLibraryAccessKind =>
  value === "read" || value === "download";

const boundedTtl = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 300;
  return Math.min(600, Math.max(60, Math.trunc(value ?? 300)));
};

const publicFailure = (
  status: MMGMyLibraryFailure["status"],
  code: string,
  message: string,
  retryable: boolean,
): MMGMyLibraryFailure => ({
  status,
  body: { ok: false, error: { code, message, retryable } },
});

const validateSignedAccess = (input: {
  url: string;
  expiresAt: Date;
  now: Date;
  ttlSeconds: number;
}): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return false;
  }

  const maximumExpiry = input.now.getTime() + (input.ttlSeconds + 30) * 1000;
  return (
    parsed.protocol === "https:" &&
    input.expiresAt.getTime() > input.now.getTime() &&
    input.expiresAt.getTime() <= maximumExpiry
  );
};

export const getMMGMyLibrary = async (input: {
  repository: MMGMyLibraryRepository;
  principal: MMGMyLibraryPrincipal;
  asOf: Date;
}): Promise<MMGMyLibrarySuccess> => {
  const records = await input.repository.loadOwnedAssetRecords(
    input.principal.customerId,
    input.asOf,
  );

  return {
    status: 200,
    body: {
      ok: true,
      library: buildMMGMyLibrarySnapshot({ records }),
    },
  };
};

const completeSafely = async (
  repository: MMGMyLibraryRepository,
  input: Parameters<MMGMyLibraryRepository["completeAccessRequest"]>[0],
): Promise<void> => {
  try {
    await repository.completeAccessRequest(input);
  } catch {
    // Preserve the customer-facing access result. Runtime logging and repair jobs own
    // audit-write recovery when the primary storage operation has already completed.
  }
};

export const createMMGMyLibraryAccess = async (input: {
  repository: MMGMyLibraryRepository;
  storageGateway: MMGMyLibraryStorageGateway;
  principal: MMGMyLibraryPrincipal;
  request: {
    requestId: string;
    assetId: string;
    kind: string;
  };
  now: Date;
  accessTtlSeconds?: number;
}): Promise<MMGMyLibraryAccessResponse> => {
  const requestId = input.request.requestId.trim();
  const assetId = input.request.assetId.trim();
  const accessKind = input.request.kind.trim();

  if (
    !safeIdentifier(requestId, 8, 128) ||
    !safeIdentifier(assetId, 3, 255) ||
    !validAccessKind(accessKind)
  ) {
    return publicFailure(
      400,
      "MY_LIBRARY_INVALID_ACCESS_REQUEST",
      "The requested library action is incomplete.",
      false,
    );
  }

  const claimed = await input.repository.claimAccessRequest({
    requestId,
    customerId: input.principal.customerId,
    assetId,
    accessKind,
    createdAt: input.now,
  });

  if (!claimed) {
    return publicFailure(
      409,
      "MY_LIBRARY_ACCESS_REQUEST_REPLAYED",
      "This access request has already been processed. Try the action again.",
      true,
    );
  }

  let file: MMGMyLibraryFileRecord | null = null;

  try {
    file = await input.repository.loadAccessibleFile({
      customerId: input.principal.customerId,
      assetId,
      accessKind,
      asOf: input.now,
    });

    if (!file) {
      await completeSafely(input.repository, {
        requestId,
        customerId: input.principal.customerId,
        assetId,
        accessKind,
        status: "denied",
        fileId: null,
        expiresAt: null,
        failureCode: "ACCESS_NOT_AVAILABLE",
      });

      return publicFailure(
        404,
        "MY_LIBRARY_ACCESS_NOT_AVAILABLE",
        "This file is not ready for secure access yet.",
        true,
      );
    }

    const ttlSeconds = boundedTtl(input.accessTtlSeconds);
    const signed = await input.storageGateway.createSignedAccess({
      storageProvider: file.storageProvider,
      storageObjectKey: file.storageObjectKey,
      disposition: accessKind === "read" ? "inline" : "attachment",
      mediaType: file.mediaType,
      downloadName: file.downloadName,
      expiresInSeconds: ttlSeconds,
    });

    if (
      !validateSignedAccess({
        url: signed.url,
        expiresAt: signed.expiresAt,
        now: input.now,
        ttlSeconds,
      })
    ) {
      throw new Error("The storage gateway returned an invalid signed access response.");
    }

    await completeSafely(input.repository, {
      requestId,
      customerId: input.principal.customerId,
      assetId,
      accessKind,
      status: "granted",
      fileId: file.id,
      expiresAt: signed.expiresAt,
      failureCode: null,
      eventPayload: {
        storageProvider: file.storageProvider,
        expiresAt: signed.expiresAt.toISOString(),
      },
    });

    return {
      status: 200,
      body: {
        ok: true,
        access: {
          kind: accessKind,
          url: signed.url,
          expiresAt: signed.expiresAt.toISOString(),
          fileName: file.downloadName,
          mediaType: file.mediaType,
        },
      },
    };
  } catch {
    await completeSafely(input.repository, {
      requestId,
      customerId: input.principal.customerId,
      assetId,
      accessKind,
      status: "failed",
      fileId: file?.id ?? null,
      expiresAt: null,
      failureCode: "SIGNED_ACCESS_FAILED",
    });

    return publicFailure(
      502,
      "MY_LIBRARY_SIGNED_ACCESS_FAILED",
      "Secure file access could not be prepared. Please try again.",
      true,
    );
  }
};
