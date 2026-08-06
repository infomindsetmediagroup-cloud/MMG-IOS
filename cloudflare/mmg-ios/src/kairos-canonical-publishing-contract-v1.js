export const KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD =
  "kairos-canonical-publishing-contract-20260806-1";

export const MMG_DIGITAL_ASSET_CONTRACT_ID =
  "mmg-digital-asset-edition-v2-customer-package-v1";

export const MMG_SHOPIFY_PUBLISHING_CONTRACT_ID =
  "mmg-shopify-product-publishing-v1";

export const MMG_CANONICAL_IDENTITY = Object.freeze({
  writtenBy: "Mindset Media Group™",
  author: "Mindset Media Group™",
  creator: "Mindset Media Group™",
  copyrightHolder: "Mindset Media Group™",
  publisher: "Mindset Media Group™",
  vendor: "Mindset Media Group",
});

export const CANONICAL_CONFIRMATIONS = Object.freeze({
  shopifyDraft: "CREATE SHOPIFY PRODUCT DRAFT",
  shopifyPublish: "PUBLISH PRODUCT LIVE",
});

export const CANONICAL_INVOCATIONS = Object.freeze({
  digitalAsset: "Digital Asset",
  shopifyPublishing: "Shopify Publishing",
});

const FORBIDDEN_PUBLIC_NAME = /\bmichael\s+king\b/iu;
const CUSTOMER_FILE_SUFFIXES = Object.freeze([
  "Customer-Spec-Sheet.pdf",
  "KDP-Interior_6x9.pdf",
  "Digital-Edition-V2.pdf",
  "Cover-Portrait_2048x3072.png",
  "Cover-Thumbnail_2048x2048.png",
  "README.txt",
]);

const IDENTITY_FIELDS = new Set([
  "author",
  "creator",
  "copyrightHolder",
  "copyright_holder",
  "publisher",
  "writtenBy",
  "written_by",
]);

export function normalizeTitleSlug(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
  return normalized || "Untitled-Digital-Asset";
}

export function canonicalCustomerPackageFiles(titleOrSlug) {
  const stem = normalizeTitleSlug(titleOrSlug);
  const customerFiles = CUSTOMER_FILE_SUFFIXES.map((suffix) => `${stem}_${suffix}`);
  return Object.freeze({
    stem,
    customerFiles,
    archive: `${stem}_Digital-Asset-Edition-V2_Customer-Package.zip`,
  });
}

export function assertNoForbiddenPublicIdentity(value, path = "root") {
  walk(value, path, (candidate, candidatePath, key) => {
    if (FORBIDDEN_PUBLIC_NAME.test(candidate)) {
      throw contractError(
        "FORBIDDEN_PUBLIC_IDENTITY",
        `Forbidden personal attribution was found at ${candidatePath}.`,
        422,
      );
    }

    if (IDENTITY_FIELDS.has(String(key || "")) && candidate.trim()) {
      const accepted = new Set([
        MMG_CANONICAL_IDENTITY.author,
        MMG_CANONICAL_IDENTITY.vendor,
      ]);
      if (!accepted.has(candidate.trim())) {
        throw contractError(
          "NONCANONICAL_PUBLIC_IDENTITY",
          `The public identity at ${candidatePath} must be Mindset Media Group™.`,
          422,
        );
      }
    }
  });
  return true;
}

export function canonicalizePublicationMetadata(input = {}) {
  assertNoForbiddenPublicIdentity(input);
  const title = clean(input.title, 255) || "Untitled Digital Asset";
  const handle = normalizeHandle(input.handle || title);
  const description = clean(input.description || input.summary, 5000);
  const keywords = uniqueStrings(input.keywords, 20);
  const tags = uniqueStrings(
    [
      ...(Array.isArray(input.tags) ? input.tags : []),
      "Digital Download",
      "Mindset Media Group",
    ],
    40,
  );

  return Object.freeze({
    ...input,
    title,
    handle,
    description,
    author: MMG_CANONICAL_IDENTITY.author,
    creator: MMG_CANONICAL_IDENTITY.creator,
    writtenBy: MMG_CANONICAL_IDENTITY.writtenBy,
    copyrightHolder: MMG_CANONICAL_IDENTITY.copyrightHolder,
    publisher: MMG_CANONICAL_IDENTITY.publisher,
    vendor: MMG_CANONICAL_IDENTITY.vendor,
    productType: clean(input.productType, 255) || "Digital Download",
    status: clean(input.status, 32).toUpperCase() || "DRAFT",
    keywords,
    tags,
    contracts: {
      digitalAsset: MMG_DIGITAL_ASSET_CONTRACT_ID,
      shopifyPublishing: MMG_SHOPIFY_PUBLISHING_CONTRACT_ID,
    },
  });
}

export function canonicalizePipelineRecord(record = {}) {
  assertNoForbiddenPublicIdentity(record);
  const metadata = canonicalizePublicationMetadata(record.metadata || {});
  const expected = canonicalCustomerPackageFiles(metadata.title);
  const observedFiles = collectObservedFilenames(record);
  const missingFiles = expected.customerFiles.filter((name) => !observedFiles.has(name));
  const archivePresent = observedFiles.has(expected.archive);
  const integrityPassed = record?.vault?.integrity?.passed !== false;
  const packageReady = missingFiles.length === 0 && archivePresent && integrityPassed;

  return Object.freeze({
    ...record,
    metadata,
    canonicalContracts: {
      digitalAsset: MMG_DIGITAL_ASSET_CONTRACT_ID,
      shopifyPublishing: MMG_SHOPIFY_PUBLISHING_CONTRACT_ID,
      build: KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
    },
    canonicalPackage: {
      stem: expected.stem,
      expectedCustomerFiles: expected.customerFiles,
      expectedArchive: expected.archive,
      observedFiles: [...observedFiles].sort(),
      missingFiles,
      archivePresent,
      integrityPassed,
      ready: packageReady,
    },
  });
}

export function assertCanonicalPackageReady(record = {}) {
  const normalized = canonicalizePipelineRecord(record);
  if (!normalized.canonicalPackage.ready) {
    const missing = normalized.canonicalPackage.missingFiles;
    throw contractError(
      "CANONICAL_CUSTOMER_PACKAGE_INCOMPLETE",
      missing.length
        ? `The Digital Asset package is missing: ${missing.join(", ")}.`
        : "The Digital Asset package archive is missing or failed integrity validation.",
      409,
      normalized,
    );
  }
  return normalized;
}

export function assertShopifyDraftAuthorization(body = {}) {
  assertNoForbiddenPublicIdentity(body);
  if (String(body.confirmation || "") !== CANONICAL_CONFIRMATIONS.shopifyDraft) {
    throw contractError(
      "SHOPIFY_DRAFT_CONFIRMATION_REQUIRED",
      `Type ${CANONICAL_CONFIRMATIONS.shopifyDraft} to authorize draft creation.`,
      403,
    );
  }
  return true;
}

export function assertShopifyPublishAuthorization(body = {}) {
  assertNoForbiddenPublicIdentity(body);
  if (String(body.confirmation || "") !== CANONICAL_CONFIRMATIONS.shopifyPublish) {
    throw contractError(
      "SHOPIFY_PUBLISH_CONFIRMATION_REQUIRED",
      `Type ${CANONICAL_CONFIRMATIONS.shopifyPublish} to authorize live publication.`,
      403,
    );
  }
  return true;
}

export function canonicalContractSnapshot() {
  return Object.freeze({
    build: KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
    identity: MMG_CANONICAL_IDENTITY,
    invocations: CANONICAL_INVOCATIONS,
    confirmations: CANONICAL_CONFIRMATIONS,
    digitalAsset: {
      contractId: MMG_DIGITAL_ASSET_CONTRACT_ID,
      minimumFinishedPages: 100,
      exactCustomerFileCount: CUSTOMER_FILE_SUFFIXES.length,
      customerFileSuffixes: CUSTOMER_FILE_SUFFIXES,
      coverPreservationRequired: true,
      kdpInteriorCoverFree: true,
      internalFilesExcludedFromCustomerZip: true,
    },
    shopify: {
      contractId: MMG_SHOPIFY_PUBLISHING_CONTRACT_ID,
      draftFirst: true,
      livePublishRequiresSeparateApproval: true,
      approvedStatusSequence: ["DRAFT", "ACTIVE"],
      productType: "Digital Download",
      deliveryAssetRole: "Digital-Edition-V2.pdf",
    },
  });
}

function collectObservedFilenames(record) {
  const values = new Set();
  const candidates = [
    ...(Array.isArray(record?.vault?.assets) ? record.vault.assets : []),
    ...(Array.isArray(record?.assets) ? record.assets : []),
    ...(Array.isArray(record?.artifacts) ? record.artifacts : []),
  ];
  for (const item of candidates) {
    const name = clean(item?.filename || item?.name || item?.fileName, 320);
    if (name) values.add(name);
  }
  const packageName = clean(
    record?.vault?.finalPackageFilename ||
      record?.finalPackageFilename ||
      record?.package?.filename,
    320,
  );
  if (packageName) values.add(packageName);
  return values;
}

function walk(value, path, visit, key = "") {
  if (typeof value === "string") {
    visit(value, path, key);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit, key));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [childKey, childValue] of Object.entries(value)) {
    walk(childValue, `${path}.${childKey}`, visit, childKey);
  }
}

function normalizeHandle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 255) || "untitled-digital-asset";
}

function uniqueStrings(values, limit) {
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const cleaned = clean(value, 120);
    if (cleaned) seen.add(cleaned);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function contractError(code, message, status = 400, record = null) {
  return Object.assign(new Error(message), { code, status, record });
}
