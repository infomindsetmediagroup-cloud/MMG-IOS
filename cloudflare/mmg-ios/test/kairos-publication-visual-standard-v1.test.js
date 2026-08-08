import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MMG_CANONICAL_CUSTOMER_DELIVERABLES,
  MMG_PUBLICATION_VISUAL_BENCHMARKS,
  MMG_PUBLICATION_VISUAL_STANDARD,
  MMG_PUBLICATION_VISUAL_STANDARD_ID,
  applyPublicationVisualStandardToManufacturingPayload,
  assertPublicationVisualStandardInvariant,
  publicationVisualStandardSnapshot,
} from "../src/kairos-publication-visual-standard-v1.js";

test("locks the publication visual standard as authoritative", () => {
  const snapshot = publicationVisualStandardSnapshot();
  assert.equal(snapshot.contractId, MMG_PUBLICATION_VISUAL_STANDARD_ID);
  assert.equal(snapshot.status, "AUTHORITATIVE");
  assert.equal(assertPublicationVisualStandardInvariant(snapshot), true);
});

test("keeps the existing six customer deliverables unchanged", () => {
  assert.equal(MMG_CANONICAL_CUSTOMER_DELIVERABLES.length, 6);
  assert.deepEqual(MMG_CANONICAL_CUSTOMER_DELIVERABLES, [
    "Customer-Spec-Sheet.pdf",
    "KDP-Interior_6x9.pdf",
    "Digital-Edition-V2.pdf",
    "Cover-Portrait_2048x3072.png",
    "Cover-Thumbnail_2048x2048.png",
    "README.txt",
  ]);
  assert.equal(MMG_PUBLICATION_VISUAL_STANDARD.immutableRules.exactCustomerDeliverableCount, 6);
  assert.equal(MMG_PUBLICATION_VISUAL_STANDARD.immutableRules.customerDeliverableSetUnchanged, true);
  assert.equal(MMG_PUBLICATION_VISUAL_STANDARD.immutableRules.archiveStructureUnchanged, true);
});

test("separates premium digital editions from submission-only KDP interiors", () => {
  assert.equal(
    MMG_PUBLICATION_VISUAL_STANDARD.digitalEdition.productionClass,
    "premium-customer-facing-publication",
  );
  assert.equal(
    MMG_PUBLICATION_VISUAL_STANDARD.kdpInterior.productionClass,
    "professional-submission-only-interior",
  );
  assert.ok(MMG_PUBLICATION_VISUAL_STANDARD.kdpInterior.prohibited.includes("embedded front cover"));
  assert.ok(MMG_PUBLICATION_VISUAL_STANDARD.kdpInterior.prohibited.includes("customer-facing brochure layouts"));
});

test("preserves title-specific color identity instead of forcing one MMG palette", () => {
  assert.equal(
    MMG_PUBLICATION_VISUAL_STANDARD.immutableRules.preserveApprovedTitleSpecificColorIdentity,
    true,
  );
  assert.equal(
    MMG_PUBLICATION_VISUAL_STANDARD.immutableRules.doNotHomogenizeAllTitlesToMMGBlue,
    true,
  );
});

test("locks the approved MMG guide and handbook visual benchmarks", () => {
  assert.deepEqual(MMG_PUBLICATION_VISUAL_BENCHMARKS, [
    "MMG Project Guide Golden Master v1.0",
    "MMG Subscription Member Guide Golden Master v1.0",
  ]);
});

test("visual upgrades never authorize manuscript rewriting", () => {
  assert.equal(
    MMG_PUBLICATION_VISUAL_STANDARD.immutableRules.manuscriptIsContentAuthority,
    true,
  );
  assert.equal(
    MMG_PUBLICATION_VISUAL_STANDARD.immutableRules.visualUpgradeDoesNotAuthorizeEditorialRewrite,
    true,
  );
});

test("manufacturing payload receives the permanent production directive without changing package count", () => {
  const payload = applyPublicationVisualStandardToManufacturingPayload({
    title: "Example Guide",
    objective: "Produce the approved manuscript package.",
    titlePalette: { primary: "#8B2BE2", accent: "#D79BFF" },
  });

  assert.equal(payload.publicationVisualStandard.contractId, MMG_PUBLICATION_VISUAL_STANDARD_ID);
  assert.equal(payload.publicationVisualStandard.exactCustomerDeliverableCount, 6);
  assert.equal(payload.publicationVisualStandard.customerDeliverableSetUnchanged, true);
  assert.deepEqual(payload.publicationVisualStandard.titlePalette, {
    primary: "#8B2BE2",
    accent: "#D79BFF",
  });
  assert.match(payload.objective, /premium professional publication/i);
  assert.match(payload.objective, /KDP 6x9 interior/i);
  assert.match(payload.objective, /six-customer-deliverable package/i);
});

test("canonical production entry applies the visual contract to manufacturing requests", () => {
  const entry = readFileSync(
    new URL("../src/kairos-production-entry-canonical-publishing-v1.js", import.meta.url),
    "utf8",
  );

  assert.match(entry, /applyPublicationVisualStandardToManufacturingPayload/);
  assert.match(entry, /assertPublicationVisualStandardInvariant\(\)/);
  assert.match(entry, /url\.pathname === "\/product-manufacturing\/create"/);
  assert.match(entry, /X-Kairos-Publication-Visual-Standard/);
  assert.match(entry, /MMG_PUBLICATION_VISUAL_STANDARD_ID/);
});
