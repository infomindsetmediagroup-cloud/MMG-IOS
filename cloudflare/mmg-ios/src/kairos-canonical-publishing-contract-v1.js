export const KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD =
  "kairos-canonical-publishing-contract-20260807-3-product-page-content";

export const MMG_DIGITAL_ASSET_CONTRACT_ID =
  "mmg-digital-asset-edition-v2-customer-package-v1";

export const MMG_SHOPIFY_PUBLISHING_CONTRACT_ID =
  "mmg-shopify-product-publishing-v1";

export const MMG_SHOPIFY_PRODUCT_PAGE_CONTRACT_ID =
  "mmg-shopify-product-page-canonical-v1";

export const MMG_CANONICAL_IDENTITY = Object.freeze({
  writtenBy: "Mindset Media Group™",
  author: "Mindset Media Group™",
  creator: "Mindset Media Group™",
  copyrightHolder: "Mindset Media Group™",
  publisher: "Mindset Media Group™",
  vendor: "Mindset Media Group",
});

export const MMG_SHOPIFY_PRODUCT_PAGE_FIELDS = Object.freeze([
  "title",
  "listingTitle",
  "seoTitle",
  "metaDescription",
  "handle",
  "productType",
  "vendor",
  "collections",
  "tags",
  "primaryKeyword",
  "secondaryKeywords",
  "price",
  "currency",
  "status",
  "productFormat",
  "productFamily",
  "series",
  "bookNumber",
  "productImageAltText",
  "canonicalURL",
  "socialTitle",
  "socialDescription",
  "descriptionHtml",
  "productMedia",
  "templateSuffix",
  "releaseLinkage",
  "digitalDelivery",
]);

export const MMG_SHOPIFY_PRODUCT_PAGE_ARCHITECTURE = Object.freeze([
  "approved structural clone/template",
  "canonical section order and styling",
  "Shopify-safe purchase system",
  "Learning Journey",
  "Judge.me review layer",
  "Intelligent Carousel Engine",
  "responsive behavior",
  "full-cover containment",
  "multiple purchase opportunities",
  "Continue Your Journey",
  "final CTA",
  "product-specific copy/identifiers/series/handle/price/featured-image substitutions only",
]);

export const CANONICAL_CONFIRMATIONS = Object.freeze({
  shopifyDraft: "CREATE SHOPIFY PRODUCT DRAFT",
  shopifyPublish: "PUBLISH PRODUCT LIVE",
});

export const CANONICAL_INVOCATIONS = Object.freeze({
  digitalAsset: "Digital Asset",
  shopifyPublishing: "Shopify Publishing",
});

const MMG_CANONICAL_DOMAIN = "https://themindsetmediagroup.com";
const FORBIDDEN_PUBLIC_NAME = /\bmichael\s+king\b/iu;
const FORBIDDEN_PUBLIC_NAME_GLOBAL = /\bmichael\s+king\b/giu;
const CUSTOMER_FILE_SUFFIXES = Object.freeze([
  "Customer-Spec-Sheet.pdf",
  "KDP-Interior_6x9.pdf",
  "Digital-Edition-V2.pdf",
  "Cover-Portrait_2048x3072.png",
  "Cover-Thumbnail_2048x2048.png",
  "README.txt",
]);

const SOURCE_CUSTOMER_ARTIFACT_INDEX = Object.freeze({
  "customer-spec-sheet.pdf": 0,
  "kdp-interior-6x9.pdf": 1,
  "digital-asset-edition-v2.pdf": 2,
  "cover-portrait-2048x3072.png": 3,
  "cover-thumbnail-2048x2048.png": 4,
  "readme.txt": 5,
});

const IDENTITY_FIELDS = new Set([
  "author",
  "creator",
  "copyrightHolder",
  "copyright_holder",
  "publisher",
  "writtenBy",
  "written_by",
  "vendor",
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

export function canonicalCustomerArtifactFilename(sourceName, titleOrSlug) {
  const name = clean(sourceName, 320);
  const expected = canonicalCustomerPackageFiles(titleOrSlug);
  if (!name) return "";
  if (expected.customerFiles.includes(name) || name === expected.archive) return name;

  const lower = name.toLowerCase();
  if (lower === "complete-production-package.zip") return expected.archive;
  const index = SOURCE_CUSTOMER_ARTIFACT_INDEX[lower];
  return Number.isInteger(index) ? expected.customerFiles[index] : name;
}

export function sanitizeCanonicalPublicRecord(value, key = "") {
  if (typeof value === "string") {
    if (IDENTITY_FIELDS.has(String(key))) {
      return key === "vendor"
        ? MMG_CANONICAL_IDENTITY.vendor
        : MMG_CANONICAL_IDENTITY.author;
    }
    return value.replace(
      FORBIDDEN_PUBLIC_NAME_GLOBAL,
      MMG_CANONICAL_IDENTITY.author,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeCanonicalPublicRecord(item, key));
  }
  if (!value || typeof value !== "object") return value;

  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = sanitizeCanonicalPublicRecord(childValue, childKey);
  }
  return output;
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
  const listingTitle = clean(input.listingTitle, 255) || title;
  const handle = normalizeHandle(input.handle || title);
  const description = clean(input.description || input.summary, 5000);
  const descriptionHtml = clean(
    input.descriptionHtml || input.shopifyHTML || input.shopifyHtml || description,
    100000,
  );
  const keywords = uniqueStrings(input.keywords, 20);
  const primaryKeyword = clean(input.primaryKeyword, 160) || keywords[0] || title;
  const secondaryKeywords = uniqueStrings(
    Array.isArray(input.secondaryKeywords) ? input.secondaryKeywords : keywords.slice(1),
    20,
  );
  const collections = uniqueStrings(
    Array.isArray(input.collections) ? input.collections : input.categories,
    10,
  );
  const productType = clean(input.productType, 255) || "Digital Download";
  const isDigital = /digital|download|ebook|e-book|pdf/iu.test(productType) ||
    /digital|download|ebook|e-book|pdf/iu.test(clean(input.productFormat, 120));
  const tags = uniqueStrings(
    [
      ...(Array.isArray(input.tags) ? input.tags : []),
      ...(isDigital ? ["Digital Download"] : []),
      "Mindset Media Group",
    ],
    40,
  );
  const seoTitle = clean(input.seoTitle || input.seo?.title, 255) || listingTitle;
  const metaDescription = clean(
    input.metaDescription || input.seoDescription || input.seo?.description || description,
    500,
  );
  const socialTitle = clean(input.socialTitle, 255) || seoTitle;
  const socialDescription = clean(input.socialDescription, 500) || metaDescription;
  const canonicalURL = clean(input.canonicalURL || input.canonicalUrl, 2000) ||
    `${MMG_CANONICAL_DOMAIN}/products/${handle}`;
  const productImageAltText = clean(input.productImageAltText || input.imageAltText, 500) ||
    `${listingTitle} — Mindset Media Group`;
  const productFormat = clean(input.productFormat, 120) || (isDigital ? "Digital" : "");
  const productFamily = clean(input.productFamily, 160) || clean(input.series, 160) || productType;
  const releaseLinkage = normalizeReleaseLinkage(input.releaseLinkage, input);
  const digitalDelivery = normalizeDigitalDelivery(input.digitalDelivery, input);

  return Object.freeze({
    ...input,
    title,
    listingTitle,
    handle,
    description,
    descriptionHtml,
    seoTitle,
    metaDescription,
    socialTitle,
    socialDescription,
    canonicalURL,
    productImageAltText,
    primaryKeyword,
    secondaryKeywords,
    author: MMG_CANONICAL_IDENTITY.author,
    creator: MMG_CANONICAL_IDENTITY.creator,
    writtenBy: MMG_CANONICAL_IDENTITY.writtenBy,
    copyrightHolder: MMG_CANONICAL_IDENTITY.copyrightHolder,
    publisher: MMG_CANONICAL_IDENTITY.publisher,
    vendor: MMG_CANONICAL_IDENTITY.vendor,
    productType,
    productFormat,
    productFamily,
    series: clean(input.series, 160) || null,
    bookNumber: clean(input.bookNumber, 80) || null,
    price: normalizeMoney(input.price ?? input.productPrice),
    currency: clean(input.currency, 12).toUpperCase() || "USD",
    status: clean(input.status || input.publicationStatus, 32).toUpperCase() || "DRAFT",
    keywords,
    collections,
    tags,
    productMedia: Array.isArray(input.productMedia) ? input.productMedia.slice(0, 50) : [],
    templateSuffix: clean(input.templateSuffix, 160),
    releaseLinkage,
    digitalDelivery,
    productPageContract: MMG_SHOPIFY_PRODUCT_PAGE_CONTRACT_ID,
    contracts: {
      digitalAsset: MMG_DIGITAL_ASSET_CONTRACT_ID,
      shopifyPublishing: MMG_SHOPIFY_PUBLISHING_CONTRACT_ID,
      shopifyProductPage: MMG_SHOPIFY_PRODUCT_PAGE_CONTRACT_ID,
    },
  });
}

export function assertCanonicalShopifyProductPageReady(input = {}, { stage = "draft" } = {}) {
  const metadata = canonicalizePublicationMetadata(input);
  const normalizedStage = String(stage || "draft").trim().toLowerCase();
  if (!new Set(["draft", "live"]).has(normalizedStage)) {
    throw contractError("SHOPIFY_PRODUCT_PAGE_STAGE_INVALID", "Product-page readiness stage must be draft or live.", 400);
  }

  const missing = [];
  requireValue(metadata.title, "title", missing);
  requireValue(metadata.listingTitle, "listingTitle", missing);
  requireValue(metadata.descriptionHtml, "descriptionHtml", missing);
  requireValue(metadata.seoTitle, "seoTitle", missing);
  requireValue(metadata.metaDescription, "metaDescription", missing);
  requireValue(metadata.handle, "handle", missing);
  requireValue(metadata.productType, "productType", missing);
  requireValue(metadata.vendor, "vendor", missing);
  requireValue(metadata.primaryKeyword, "primaryKeyword", missing);
  requireValue(metadata.productFormat, "productFormat", missing);
  requireValue(metadata.productFamily, "productFamily", missing);
  requireValue(metadata.productImageAltText, "productImageAltText", missing);
  requireValue(metadata.canonicalURL, "canonicalURL", missing);
  requireValue(metadata.socialTitle, "socialTitle", missing);
  requireValue(metadata.socialDescription, "socialDescription", missing);
  requireValue(metadata.templateSuffix, "templateSuffix", missing);
  if (!metadata.price || Number(metadata.price) <= 0) missing.push("price");
  if (!Array.isArray(metadata.tags) || metadata.tags.length === 0) missing.push("tags");
  if (!Array.isArray(metadata.collections) || metadata.collections.length < 3 || metadata.collections.length > 5) {
    missing.push("collections(3-5)");
  }

  if (/digital|download|ebook|e-book|pdf/iu.test(`${metadata.productType} ${metadata.productFormat}`) &&
      !metadata.tags.includes("Digital Download")) {
    missing.push("Digital Download tag");
  }

  if (normalizedStage === "live") {
    if (!Array.isArray(metadata.productMedia) || metadata.productMedia.length === 0) missing.push("productMedia");
    if (!releaseLinkageReady(metadata.releaseLinkage) && /digital|download|ebook|e-book|pdf/iu.test(`${metadata.productType} ${metadata.productFormat}`)) {
      missing.push("releaseLinkage");
    }
    if (!digitalDeliveryReady(metadata.digitalDelivery) && /digital|download|ebook|e-book|pdf/iu.test(`${metadata.productType} ${metadata.productFormat}`)) {
      missing.push("digitalDelivery");
    }
  }

  if (missing.length) {
    throw contractError(
      "SHOPIFY_PRODUCT_PAGE_CONTRACT_INCOMPLETE",
      `The canonical Shopify product-page contract is incomplete for ${normalizedStage}: ${missing.join(", ")}.`,
      409,
      { stage: normalizedStage, missing, metadata },
    );
  }

  return Object.freeze({
    ready: true,
    stage: normalizedStage,
    contractId: MMG_SHOPIFY_PRODUCT_PAGE_CONTRACT_ID,
    metadata,
  });
}

export function canonicalizePipelineRecord(record = {}) {
  const sanitized = sanitizeCanonicalPublicRecord(record);
  const rawMetadata = sanitizeCanonicalPublicRecord(sanitized.metadata || {});
  const metadata = canonicalizePublicationMetadata({
    ...rawMetadata,
    author: MMG_CANONICAL_IDENTITY.author,
    creator: MMG_CANONICAL_IDENTITY.creator,
    writtenBy: MMG_CANONICAL_IDENTITY.writtenBy,
    copyrightHolder: MMG_CANONICAL_IDENTITY.copyrightHolder,
    publisher: MMG_CANONICAL_IDENTITY.publisher,
    vendor: MMG_CANONICAL_IDENTITY.vendor,
  });
  const expected = canonicalCustomerPackageFiles(metadata.title);
  const observedSourceFiles = collectObservedFilenames(sanitized);
  const observedFiles = new Set(
    [...observedSourceFiles].map((name) =>
      canonicalCustomerArtifactFilename(name, metadata.title),
    ),
  );
  const missingFiles = expected.customerFiles.filter((name) => !observedFiles.has(name));
  const archivePresent = observedFiles.has(expected.archive);
  const integrityPassed = sanitized?.vault?.integrity?.passed === true;
  const packageReady = missingFiles.length === 0 && archivePresent && integrityPassed;
  const sourceAliases = [...observedSourceFiles]
    .map((source) => ({
      source,
      canonical: canonicalCustomerArtifactFilename(source, metadata.title),
    }))
    .filter((entry) => entry.source !== entry.canonical);

  return Object.freeze({
    ...sanitized,
    metadata,
    canonicalContracts: {
      digitalAsset: MMG_DIGITAL_ASSET_CONTRACT_ID,
      shopifyPublishing: MMG_SHOPIFY_PUBLISHING_CONTRACT_ID,
      shopifyProductPage: MMG_SHOPIFY_PRODUCT_PAGE_CONTRACT_ID,
      build: KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
    },
    canonicalPackage: {
      stem: expected.stem,
      expectedCustomerFiles: expected.customerFiles,
      expectedArchive: expected.archive,
      observedSourceFiles: [...observedSourceFiles].sort(),
      observedFiles: [...observedFiles].sort(),
      sourceAliases,
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
      legacySourceAliasesNormalized: true,
    },
    shopify: {
      contractId: MMG_SHOPIFY_PUBLISHING_CONTRACT_ID,
      productPageContract: {
        contractId: MMG_SHOPIFY_PRODUCT_PAGE_CONTRACT_ID,
        fields: MMG_SHOPIFY_PRODUCT_PAGE_FIELDS,
        architecture: MMG_SHOPIFY_PRODUCT_PAGE_ARCHITECTURE,
        collectionStandard: "3-5",
        seriesAndBookNumberMayBeExplicitlyNull: true,
        draftReadinessRequiredBeforeProductContentIsApproved: true,
        liveReadinessRequiredBeforePublication: true,
      },
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

function normalizeReleaseLinkage(value, input) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return sanitizeCanonicalPublicRecord(value);
  }
  const releaseId = clean(input.releaseId || input.manifestId || input.releaseManifestId, 240);
  const checksum = clean(input.releaseChecksum || input.manifestChecksum || input.checksum, 240);
  const files = uniqueStrings(
    input.releaseFiles || input.filenames || input.deliveryFiles,
    50,
  );
  return { releaseId: releaseId || null, checksum: checksum || null, files };
}

function normalizeDigitalDelivery(value, input) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return sanitizeCanonicalPublicRecord(value);
  }
  if (value === true) return { configured: true };
  if (value === false) return { configured: false };
  const configured = input.digitalDeliveryConfigured === true || input.deliveryConfigured === true;
  return { configured };
}

function releaseLinkageReady(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const releaseId = clean(value.releaseId || value.manifestId, 240);
  const checksum = clean(value.checksum || value.manifestChecksum, 240);
  const files = Array.isArray(value.files) ? value.files.filter(Boolean) : [];
  return Boolean((releaseId || checksum) && files.length);
}

function digitalDeliveryReady(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.configured === true);
}

function requireValue(value, field, missing) {
  if (value == null || (typeof value === "string" && !value.trim())) missing.push(field);
}

function normalizeMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return number.toFixed(2);
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
