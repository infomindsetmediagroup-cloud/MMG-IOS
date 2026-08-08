export const MMG_PUBLICATION_VISUAL_STANDARD_ID =
  "mmg-publication-visual-production-standard-v1";

export const MMG_PUBLICATION_VISUAL_STANDARD_BUILD =
  "mmg-publication-visual-production-standard-20260808-1";

export const MMG_PUBLICATION_VISUAL_BENCHMARKS = Object.freeze([
  "MMG Project Guide Golden Master v1.0",
  "MMG Subscription Member Guide Golden Master v1.0",
]);

export const MMG_CANONICAL_CUSTOMER_DELIVERABLES = Object.freeze([
  "Customer-Spec-Sheet.pdf",
  "KDP-Interior_6x9.pdf",
  "Digital-Edition-V2.pdf",
  "Cover-Portrait_2048x3072.png",
  "Cover-Thumbnail_2048x2048.png",
  "README.txt",
]);

export const MMG_PUBLICATION_VISUAL_STANDARD = deepFreeze({
  contractId: MMG_PUBLICATION_VISUAL_STANDARD_ID,
  build: MMG_PUBLICATION_VISUAL_STANDARD_BUILD,
  status: "AUTHORITATIVE",
  owner: "Mindset Media Group™",
  benchmarks: MMG_PUBLICATION_VISUAL_BENCHMARKS,
  scope: [
    "books",
    "digital guides",
    "manuals",
    "playbooks",
    "prompt libraries",
    "workbooks",
    "field guides",
    "customer-facing digital publications",
    "KDP submission interiors",
  ],
  immutableRules: {
    manuscriptIsContentAuthority: true,
    visualUpgradeDoesNotAuthorizeEditorialRewrite: true,
    preserveApprovedTitleSpecificColorIdentity: true,
    doNotHomogenizeAllTitlesToMMGBlue: true,
    exactCustomerDeliverableCount: 6,
    customerDeliverableSetUnchanged: true,
    archiveStructureUnchanged: true,
    changingDeliverableCountRequiresExplicitExecutiveApproval: true,
  },
  digitalEdition: {
    fileRole: "Digital-Edition-V2.pdf",
    productionClass: "premium-customer-facing-publication",
    purpose: "The primary polished reading and customer-use edition.",
    designDoctrine: [
      "Build the approved manuscript into a finished professional publication rather than exporting a raw manuscript layout.",
      "Use the approved MMG Project Guide and Subscription Member Guide Golden Masters as visual-quality benchmarks, not as literal one-size-fits-all templates.",
      "Preserve the established color identity of the individual title and derive accents, section treatments, callouts, and supporting visual elements from that title identity.",
      "Use disciplined whitespace, strong typography, clear hierarchy, deliberate section openings, professional headers and footers where appropriate, page numbering, visual rhythm, and consistent alignment.",
      "Use cards, callouts, grids, diagrams, checklists, worksheets, prompt modules, tables, and other structured visual devices only when the publication type and manuscript content benefit from them.",
      "Adapt the layout system to the asset class: a book should read like a professionally typeset book; a manual should prioritize instruction and sequence; a prompt library should prioritize scanability and modular reuse; a workbook should prioritize interaction and completion space.",
      "Maintain accessibility and reading quality: sufficient contrast, readable type sizes, sensible line lengths, consistent heading hierarchy, and no decorative treatment that competes with the manuscript.",
      "Preserve the approved cover as page one when required by the Digital Asset Edition V2 contract.",
    ],
    prohibited: [
      "raw word-processor export appearance",
      "generic all-blue visual homogenization",
      "decorative clutter unrelated to the manuscript",
      "visual redesign that silently rewrites, shortens, expands, or changes the approved manuscript",
      "one universal page template forced onto every publication type",
    ],
  },
  kdpInterior: {
    fileRole: "KDP-Interior_6x9.pdf",
    productionClass: "professional-submission-only-interior",
    purpose: "A clean, restrained print interior prepared only for KDP submission and platform review.",
    designDoctrine: [
      "Keep the interior cover-free and exactly 6 × 9 inches where the current Digital Asset Edition V2 contract requires that trim size.",
      "Use professional book typography, chapter hierarchy, front matter, back matter, margins, mirrored gutters where appropriate, pagination, paragraph spacing, and clean image/table handling.",
      "Prioritize print readability, platform compatibility, stable page geometry, and professional typesetting over customer-facing brand decoration.",
      "Use restrained title-aware accent treatment only when it remains appropriate for a print interior and does not interfere with KDP suitability.",
      "Treat the KDP file as a platform-submission artifact, not as the primary branded customer reading edition.",
    ],
    prohibited: [
      "embedded front cover",
      "customer-facing brochure layouts",
      "marketing cards or promotional panels",
      "oversized decorative branding",
      "Continue Your Journey merchandising sections unless they are part of the approved manuscript itself",
      "storefront calls to action",
      "ornamental handbook UI that does not belong in a professional book interior",
    ],
  },
  otherCustomerFiles: {
    customerSpecSheet: "Keep professional, concise, branded, and aligned to the title while preserving its technical/customer-guidance purpose.",
    portraitCover: "Preserve the approved title cover and its title-specific visual identity.",
    thumbnailCover: "Preserve the approved title cover without destructive cropping or unrelated restyling.",
    readme: "Keep operational and concise; explain file purpose without turning the README into a marketing document.",
  },
  qa: {
    digitalEdition: [
      "manuscript content preserved",
      "title-specific palette preserved",
      "professional visual hierarchy",
      "consistent typography and spacing",
      "no raw-export appearance",
      "publication-type-appropriate modules",
      "cover and metadata aligned",
      "customer-ready reading quality",
    ],
    kdpInterior: [
      "cover-free",
      "correct trim geometry",
      "professional typesetting",
      "chapter hierarchy clean",
      "margins and gutters clean",
      "pagination clean",
      "no customer-marketing UI",
      "submission-only purpose preserved",
    ],
    package: [
      "exactly six canonical customer deliverables",
      "no added or removed customer deliverables",
      "existing archive naming and package structure preserved",
    ],
  },
});

export function publicationVisualStandardSnapshot() {
  return MMG_PUBLICATION_VISUAL_STANDARD;
}

export function applyPublicationVisualStandardToManufacturingPayload(payload = {}) {
  const input = payload && typeof payload === "object" ? payload : {};
  const titlePalette = normalizePaletteHint(
    input.titlePalette ||
    input.palette ||
    input.visualIdentity?.palette ||
    input.cover?.palette ||
    null,
  );

  const standard = {
    contractId: MMG_PUBLICATION_VISUAL_STANDARD_ID,
    build: MMG_PUBLICATION_VISUAL_STANDARD_BUILD,
    preserveApprovedTitleSpecificColorIdentity: true,
    titlePalette,
    benchmarks: [...MMG_PUBLICATION_VISUAL_BENCHMARKS],
    digitalEditionClass: MMG_PUBLICATION_VISUAL_STANDARD.digitalEdition.productionClass,
    kdpInteriorClass: MMG_PUBLICATION_VISUAL_STANDARD.kdpInterior.productionClass,
    exactCustomerDeliverableCount: 6,
    customerDeliverableSetUnchanged: true,
  };

  const directive = [
    "Apply mmg-publication-visual-production-standard-v1.",
    "Build the customer-facing Digital Edition as a premium professional publication using the approved MMG handbook/guide visual-quality language while preserving this title's established color identity.",
    "Do not treat the reference guides as a literal universal template; adapt layout to the publication type and manuscript content.",
    "Do not rewrite, shorten, expand, or materially alter approved manuscript content merely to fit the design.",
    "Build the KDP 6x9 interior as a separate restrained, cover-free, professional submission-only book interior with clean typography, hierarchy, margins, gutters, pagination, and print-safe structure.",
    "Do not place customer-facing brochure UI, merchandising panels, storefront CTAs, or unnecessary decorative branding in the KDP interior.",
    "Preserve the existing exact six-customer-deliverable package and archive structure; this visual standard changes production quality, not deliverable count.",
  ].join(" ");

  const objective = appendDirective(input.objective, directive, 12000);
  return Object.freeze({
    ...input,
    objective,
    publicationVisualStandard: standard,
  });
}

export function assertPublicationVisualStandardInvariant(snapshot = MMG_PUBLICATION_VISUAL_STANDARD) {
  const problems = [];
  if (snapshot?.contractId !== MMG_PUBLICATION_VISUAL_STANDARD_ID) problems.push("contractId");
  if (snapshot?.immutableRules?.exactCustomerDeliverableCount !== 6) problems.push("exactCustomerDeliverableCount");
  if (snapshot?.immutableRules?.customerDeliverableSetUnchanged !== true) problems.push("customerDeliverableSetUnchanged");
  if (snapshot?.immutableRules?.preserveApprovedTitleSpecificColorIdentity !== true) problems.push("preserveApprovedTitleSpecificColorIdentity");
  if (snapshot?.digitalEdition?.productionClass !== "premium-customer-facing-publication") problems.push("digitalEdition.productionClass");
  if (snapshot?.kdpInterior?.productionClass !== "professional-submission-only-interior") problems.push("kdpInterior.productionClass");
  if (!snapshot?.kdpInterior?.prohibited?.includes("embedded front cover")) problems.push("kdpInterior.coverFree");
  if (MMG_CANONICAL_CUSTOMER_DELIVERABLES.length !== 6) problems.push("canonicalDeliverableList");
  if (problems.length) {
    throw Object.assign(
      new Error(`Publication visual production standard invariant failed: ${problems.join(", ")}.`),
      { code: "PUBLICATION_VISUAL_STANDARD_INVARIANT_FAILED", status: 500, problems },
    );
  }
  return true;
}

function normalizePaletteHint(value) {
  if (!value) return null;
  if (typeof value === "string") return value.trim().slice(0, 500) || null;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "object") {
    const clean = {};
    for (const [key, item] of Object.entries(value).slice(0, 20)) {
      if (item == null) continue;
      clean[String(key).slice(0, 80)] = typeof item === "string" ? item.slice(0, 160) : item;
    }
    return clean;
  }
  return String(value).slice(0, 500);
}

function appendDirective(base, directive, maxLength) {
  const current = String(base || "").replace(/\u0000/g, "").trim();
  const addition = String(directive || "").replace(/\u0000/g, "").trim();
  if (!current) return addition.slice(0, maxLength);
  if (current.includes(MMG_PUBLICATION_VISUAL_STANDARD_ID)) return current.slice(0, maxLength);
  return `${current} ${addition}`.slice(0, maxLength);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
