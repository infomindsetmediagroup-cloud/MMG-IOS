import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_CONFIRMATIONS,
  MMG_CANONICAL_IDENTITY,
  MMG_DIGITAL_ASSET_CONTRACT_ID,
  assertCanonicalPackageReady,
  assertNoForbiddenPublicIdentity,
  assertShopifyDraftAuthorization,
  assertShopifyPublishAuthorization,
  canonicalContractSnapshot,
  canonicalCustomerArtifactFilename,
  canonicalCustomerPackageFiles,
  canonicalizePipelineRecord,
  canonicalizePublicationMetadata,
  sanitizeCanonicalPublicRecord,
} from "../src/kairos-canonical-publishing-contract-v1.js";

test("builds the exact six-file Digital Asset V2 customer package", () => {
  const packageFiles = canonicalCustomerPackageFiles("AI Prompting for Beginners");
  assert.equal(packageFiles.customerFiles.length, 6);
  assert.deepEqual(packageFiles.customerFiles, [
    "AI-Prompting-for-Beginners_Customer-Spec-Sheet.pdf",
    "AI-Prompting-for-Beginners_KDP-Interior_6x9.pdf",
    "AI-Prompting-for-Beginners_Digital-Edition-V2.pdf",
    "AI-Prompting-for-Beginners_Cover-Portrait_2048x3072.png",
    "AI-Prompting-for-Beginners_Cover-Thumbnail_2048x2048.png",
    "AI-Prompting-for-Beginners_README.txt",
  ]);
  assert.equal(
    packageFiles.archive,
    "AI-Prompting-for-Beginners_Digital-Asset-Edition-V2_Customer-Package.zip",
  );
});

test("maps existing manufacturing artifact names to canonical customer filenames", () => {
  assert.equal(
    canonicalCustomerArtifactFilename(
      "customer-spec-sheet.pdf",
      "AI Prompting for Beginners",
    ),
    "AI-Prompting-for-Beginners_Customer-Spec-Sheet.pdf",
  );
  assert.equal(
    canonicalCustomerArtifactFilename(
      "complete-production-package.zip",
      "AI Prompting for Beginners",
    ),
    "AI-Prompting-for-Beginners_Digital-Asset-Edition-V2_Customer-Package.zip",
  );
});

test("locks every public identity field to Mindset Media Group", () => {
  const metadata = canonicalizePublicationMetadata({
    title: "Creator Systems",
    author: "Mindset Media Group™",
    publisher: "Mindset Media Group™",
  });
  assert.equal(metadata.author, MMG_CANONICAL_IDENTITY.author);
  assert.equal(metadata.creator, MMG_CANONICAL_IDENTITY.creator);
  assert.equal(metadata.copyrightHolder, MMG_CANONICAL_IDENTITY.copyrightHolder);
  assert.equal(metadata.publisher, MMG_CANONICAL_IDENTITY.publisher);
  assert.equal(metadata.status, "DRAFT");
  assert.equal(metadata.contracts.digitalAsset, MMG_DIGITAL_ASSET_CONTRACT_ID);
});

test("rejects prohibited personal attribution anywhere in public input", () => {
  assert.throws(
    () =>
      assertNoForbiddenPublicIdentity({
        seo: { description: "Written by Michael King" },
      }),
    (error) => error.code === "FORBIDDEN_PUBLIC_IDENTITY" && error.status === 422,
  );
});

test("sanitizes legacy public records before they cross the canonical boundary", () => {
  const sanitized = sanitizeCanonicalPublicRecord({
    author: "Michael King",
    vendor: "Michael King",
    description: "A guide written by Michael King.",
  });
  assert.equal(sanitized.author, "Mindset Media Group™");
  assert.equal(sanitized.vendor, "Mindset Media Group");
  assert.equal(
    sanitized.description,
    "A guide written by Mindset Media Group™.",
  );
});

test("rejects noncanonical author identity in direct publication metadata", () => {
  assert.throws(
    () => canonicalizePublicationMetadata({ title: "Test", author: "Another Author" }),
    (error) => error.code === "NONCANONICAL_PUBLIC_IDENTITY",
  );
});

test("requires exact Shopify draft and live confirmations", () => {
  assert.equal(
    assertShopifyDraftAuthorization({
      confirmation: CANONICAL_CONFIRMATIONS.shopifyDraft,
    }),
    true,
  );
  assert.equal(
    assertShopifyPublishAuthorization({
      confirmation: CANONICAL_CONFIRMATIONS.shopifyPublish,
    }),
    true,
  );
  assert.throws(
    () => assertShopifyDraftAuthorization({ confirmation: "CREATE DRAFT" }),
    (error) => error.code === "SHOPIFY_DRAFT_CONFIRMATION_REQUIRED",
  );
  assert.throws(
    () => assertShopifyPublishAuthorization({ confirmation: "PUBLISH" }),
    (error) => error.code === "SHOPIFY_PUBLISH_CONFIRMATION_REQUIRED",
  );
});

test("accepts a complete exact-name canonical package before Shopify handoff", () => {
  const expected = canonicalCustomerPackageFiles("Creator Systems");
  const record = {
    status: "production-ready",
    metadata: {
      title: "Creator Systems",
      author: "Mindset Media Group™",
      publisher: "Mindset Media Group™",
    },
    vault: {
      integrity: { passed: true },
      assets: [
        ...expected.customerFiles.map((filename) => ({ filename })),
        { filename: expected.archive },
      ],
    },
  };
  const validated = assertCanonicalPackageReady(record);
  assert.equal(validated.canonicalPackage.ready, true);
  assert.deepEqual(validated.canonicalPackage.missingFiles, []);
});

test("accepts the existing manufacturing record after canonical alias normalization", () => {
  const record = {
    status: "production-ready",
    metadata: {
      title: "Creator Systems",
      author: "Michael King",
      publisher: "Mindset Media Group",
    },
    vault: {
      integrity: { passed: true },
      assets: [
        { filename: "customer-spec-sheet.pdf" },
        { filename: "kdp-interior-6x9.pdf" },
        { filename: "digital-asset-edition-v2.pdf" },
        { filename: "cover-portrait-2048x3072.png" },
        { filename: "cover-thumbnail-2048x2048.png" },
        { filename: "README.txt" },
        { filename: "complete-production-package.zip" },
      ],
    },
  };
  const validated = canonicalizePipelineRecord(record);
  assert.equal(validated.metadata.author, "Mindset Media Group™");
  assert.equal(validated.metadata.publisher, "Mindset Media Group™");
  assert.equal(validated.canonicalPackage.ready, true);
  assert.equal(validated.canonicalPackage.sourceAliases.length, 7);
});

test("blocks Shopify handoff when any customer deliverable is absent", () => {
  const expected = canonicalCustomerPackageFiles("Creator Systems");
  const record = {
    metadata: {
      title: "Creator Systems",
      author: "Mindset Media Group™",
      publisher: "Mindset Media Group™",
    },
    vault: {
      integrity: { passed: true },
      assets: [
        ...expected.customerFiles.slice(0, 5).map((filename) => ({ filename })),
        { filename: expected.archive },
      ],
    },
  };
  assert.throws(
    () => assertCanonicalPackageReady(record),
    (error) =>
      error.code === "CANONICAL_CUSTOMER_PACKAGE_INCOMPLETE" &&
      error.record.canonicalPackage.missingFiles.length === 1,
  );
});

test("blocks Shopify handoff when integrity was not positively verified", () => {
  const expected = canonicalCustomerPackageFiles("Creator Systems");
  assert.throws(
    () =>
      assertCanonicalPackageReady({
        metadata: {
          title: "Creator Systems",
          author: "Mindset Media Group™",
          publisher: "Mindset Media Group™",
        },
        vault: {
          integrity: { passed: false },
          assets: [
            ...expected.customerFiles.map((filename) => ({ filename })),
            { filename: expected.archive },
          ],
        },
      }),
    (error) => error.code === "CANONICAL_CUSTOMER_PACKAGE_INCOMPLETE",
  );
});

test("exposes both canonical invocation contracts", () => {
  const snapshot = canonicalContractSnapshot();
  assert.equal(snapshot.digitalAsset.exactCustomerFileCount, 6);
  assert.equal(snapshot.digitalAsset.minimumFinishedPages, 100);
  assert.equal(snapshot.digitalAsset.legacySourceAliasesNormalized, true);
  assert.equal(snapshot.shopify.draftFirst, true);
  assert.equal(snapshot.shopify.livePublishRequiresSeparateApproval, true);
});
