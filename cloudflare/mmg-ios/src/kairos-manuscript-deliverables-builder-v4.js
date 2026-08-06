import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  runManuscriptDeliverablesBuild as runLegacyFiveFileBuild,
} from "./kairos-manuscript-deliverables-builder-v3.js";

export const KAIROS_MANUSCRIPT_DELIVERABLES_BUILDER_BUILD =
  "kairos-manuscript-deliverables-builder-20260805-4-canonical-digital-asset-v2";

export const PACKAGE_CONTRACT = "mmg-canonical-digital-asset-edition-v2";

export const REQUIRED_DELIVERABLE_KINDS = Object.freeze([
  "CUSTOMER_SPEC_SHEET_PDF",
  "KDP_INTERIOR_PDF",
  "DIGITAL_EDITION_V2_PDF",
  "COVER_PORTRAIT_PNG",
  "COVER_THUMBNAIL_PNG",
  "README_TXT",
]);

export const REQUIRED_PACKAGE_FILE_COUNT = 6;
export const MINIMUM_KDP_INTERIOR_PAGES = 100;
export const PORTRAIT_COVER = Object.freeze({ width: 2048, height: 3072 });
export const THUMBNAIL_COVER = Object.freeze({ width: 2048, height: 2048 });

const BUILD_KEY_PREFIX = "manuscript-deliverables-build:";
const ZIP_CHUNK_BYTES = 96 * 1024;
const ZIP_WRITE_BATCH = 16;
const PDF_MIME = "application/pdf";
const PNG_MIME = "image/png";
const TEXT_MIME = "text/plain; charset=utf-8";
const LETTER = Object.freeze({ width: 612, height: 792 });

export async function runManuscriptDeliverablesBuild(state, projectId, handlers) {
  if (!projectId) throw fail(400, "project_id_required", "A manuscript project id is required.");

  // The v3 renderer remains an internal rendering primitive only. Its retired
  // five-file package is immediately replaced and is never returned to a customer.
  const legacy = await runLegacyFiveFileBuild(transientRenderingState(state, projectId), projectId, handlers);
  const legacyBuild = legacy?.build;
  const title = String(legacyBuild?.metadata?.workingTitle || "Untitled Manuscript").trim();
  const author = String(legacyBuild?.metadata?.author || "Unknown Author").trim();
  const manuscript = await resolveApprovedManuscript(state, projectId, handlers);
  const stem = titleStem(title);

  const interiorArtifact = artifactByKind(legacyBuild, "KDP_INTERIOR_PDF");
  const portraitArtifact = artifactByKind(legacyBuild, "STANDALONE_COVER_IMAGE");
  const interiorPdf = requiredFile(legacy, interiorArtifact, "KDP interior");
  const uploadedCover = requiredFile(legacy, portraitArtifact, "approved cover");

  const portraitPng = await canonicalPortraitPng(uploadedCover, portraitArtifact?.mimeType);
  const portraitInfo = await decodePng(portraitPng);
  requireDimensions(portraitInfo, PORTRAIT_COVER, "portrait cover");
  const thumbnailPng = await makeContainedSquareThumbnail(portraitInfo);
  const thumbnailInfo = await decodePng(thumbnailPng);
  requireDimensions(thumbnailInfo, THUMBNAIL_COVER, "square thumbnail");

  const interiorDocument = await PDFDocument.load(interiorPdf, { ignoreEncryption: true });
  const interiorPageCount = interiorDocument.getPageCount();
  if (interiorPageCount < MINIMUM_KDP_INTERIOR_PAGES) {
    throw fail(
      409,
      "mmg_minimum_page_standard_not_met",
      `The approved manuscript produces ${interiorPageCount} KDP interior pages. MMG Digital Asset Edition V2 requires at least ${MINIMUM_KDP_INTERIOR_PAGES} pages before manufacturing.`,
    );
  }

  const headings = manuscriptHeadings(manuscript);
  const wordCount = countWords(manuscript);
  const digitalEditionPdf = await buildDigitalEditionV2({
    title,
    author,
    manuscript,
    headings,
    interiorPdf,
    portraitPng,
  });
  const digitalDocument = await PDFDocument.load(digitalEditionPdf, { ignoreEncryption: true });
  const digitalPageCount = digitalDocument.getPageCount();

  const filenames = Object.freeze({
    specSheet: `${stem}_Customer-Spec-Sheet.pdf`,
    interior: `${stem}_KDP-Interior_6x9.pdf`,
    digital: `${stem}_Digital-Edition-V2.pdf`,
    portrait: `${stem}_Cover-Portrait_2048x3072.png`,
    thumbnail: `${stem}_Cover-Thumbnail_2048x2048.png`,
    readme: `${stem}_README.txt`,
    zip: `${titleStem(title, { preserveUppercase: true })}_Digital-Asset-Edition-V2_Customer-Package.zip`,
  });

  const specSheetPdf = await buildCustomerSpecSheet({
    title,
    author,
    headings,
    wordCount,
    interiorPageCount,
    digitalPageCount,
    filenames,
  });
  const readme = encode(buildReadme({
    title,
    author,
    headings,
    wordCount,
    interiorPageCount,
    digitalPageCount,
    filenames,
  }));

  const packageFiles = [
    {
      kind: "CUSTOMER_SPEC_SHEET_PDF",
      filename: filenames.specSheet,
      mimeType: PDF_MIME,
      data: specSheetPdf,
      role: "Two-page customer specification and file-use guide",
    },
    {
      kind: "KDP_INTERIOR_PDF",
      filename: filenames.interior,
      mimeType: PDF_MIME,
      data: interiorPdf,
      role: "KDP-ready 6 x 9 inch print interior",
    },
    {
      kind: "DIGITAL_EDITION_V2_PDF",
      filename: filenames.digital,
      mimeType: PDF_MIME,
      data: digitalEditionPdf,
      role: "US Letter customer digital edition with approved cover as page one",
    },
    {
      kind: "COVER_PORTRAIT_PNG",
      filename: filenames.portrait,
      mimeType: PNG_MIME,
      data: portraitPng,
      role: "Approved portrait cover at exactly 2048 x 3072 pixels",
    },
    {
      kind: "COVER_THUMBNAIL_PNG",
      filename: filenames.thumbnail,
      mimeType: PNG_MIME,
      data: thumbnailPng,
      role: "Square 2048 x 2048 cover thumbnail preserving the complete portrait cover",
    },
    {
      kind: "README_TXT",
      filename: filenames.readme,
      mimeType: TEXT_MIME,
      data: readme,
      role: "Customer package manifest, edition details, and use instructions",
    },
  ];

  validatePackageFiles(packageFiles, filenames);
  const zipBytes = writeZip(packageFiles.map(({ filename, data }) => ({ filename, data })));
  const createdAt = new Date().toISOString();
  const artifacts = [];
  for (const item of packageFiles) artifacts.push(await buildArtifact(projectId, createdAt, item));
  artifacts.push(await buildArtifact(projectId, createdAt, {
    kind: "ZIP_ARCHIVE",
    filename: filenames.zip,
    mimeType: "application/zip",
    data: zipBytes,
    role: "Canonical six-file MMG Digital Asset Edition V2 customer package",
  }));

  const build = {
    id: `mb_${crypto.randomUUID()}`,
    projectId,
    status: "COMPLETED",
    artifacts,
    metadata: {
      workingTitle: title,
      author,
      publisher: "Mindset Media Group™",
      edition: "Digital Asset Edition V2",
      service: legacyBuild?.metadata?.service || "Digital Edition Production",
      trimSize: "6x9",
      wordCount,
      pageCount: interiorPageCount,
      kdpInteriorPageCount: interiorPageCount,
      digitalEditionPageCount: digitalPageCount,
      minimumInteriorPages: MINIMUM_KDP_INTERIOR_PAGES,
      minimumInteriorPagesVerified: interiorPageCount >= MINIMUM_KDP_INTERIOR_PAGES,
      packageContract: PACKAGE_CONTRACT,
      packageFileCount: REQUIRED_PACKAGE_FILE_COUNT,
      packageContentsVerified: true,
      packageFilename: filenames.zip,
      customerSpecSheetPages: 2,
      customerSpecSheetPageSize: "US Letter",
      kdpInteriorPageSize: "6x9 inches",
      digitalEditionPageSize: "US Letter",
      digitalEditionCoverFirst: true,
      digitalEditionSelectableText: true,
      portraitCoverDimensions: `${PORTRAIT_COVER.width}x${PORTRAIT_COVER.height}`,
      thumbnailCoverDimensions: `${THUMBNAIL_COVER.width}x${THUMBNAIL_COVER.height}`,
      portraitCoverChecksum: await sha256Hex(portraitPng),
      thumbnailCoverChecksum: await sha256Hex(thumbnailPng),
      sourceFilename: legacyBuild?.metadata?.sourceFilename || null,
      manuscriptAuthority: legacyBuild?.metadata?.manuscriptAuthority || "stored-intake-source",
      legacyFiveFilePackageReturnedToCustomer: false,
      liveShopifyMutationAuthorized: false,
    },
    createdAt,
    updatedAt: createdAt,
    errorMessage: null,
  };

  await state.storage.put(`${BUILD_KEY_PREFIX}${projectId}`, build);
  await storeCanonicalZip(state, projectId, zipBytes);
  return {
    build,
    files: Object.fromEntries(packageFiles.map((item) => [item.filename, item.data])),
    zipFilename: filenames.zip,
  };
}

export async function getStoredManuscriptDeliverablesBuild(state, projectId) {
  return state.storage.get(`${BUILD_KEY_PREFIX}${projectId}`);
}

export async function getStoredManuscriptDeliverablesZip(state, projectId) {
  const metadata = await state.storage.get(`${BUILD_KEY_PREFIX}${projectId}:zip:metadata`);
  if (!metadata) return state.storage.get(`${BUILD_KEY_PREFIX}${projectId}:zip`);
  const keys = Array.from({ length: Number(metadata.chunks || 0) }, (_, index) => `${BUILD_KEY_PREFIX}${projectId}:zip:chunk:${index}`);
  const values = keys.length ? await state.storage.get(keys) : new Map();
  const output = new Uint8Array(Number(metadata.size || 0));
  let offset = 0;
  for (const key of keys) {
    const value = values.get(key);
    if (!value) throw fail(502, "canonical_package_chunk_missing", "A stored canonical package chunk is missing.");
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    output.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== output.length) throw fail(502, "canonical_package_size_mismatch", "The stored canonical package failed its size check.");
  return output;
}

export function validateBuildArtifacts(build) {
  const present = new Set((build?.artifacts || []).map((item) => item?.kind));
  const missing = REQUIRED_DELIVERABLE_KINDS.filter((kind) => !present.has(kind));
  if (!present.has("ZIP_ARCHIVE")) missing.push("ZIP_ARCHIVE");
  const packageFiles = (build?.artifacts || []).filter((item) => item?.kind !== "ZIP_ARCHIVE");
  return {
    ok: missing.length === 0
      && packageFiles.length === REQUIRED_PACKAGE_FILE_COUNT
      && build?.metadata?.packageContract === PACKAGE_CONTRACT,
    missing,
  };
}


function transientRenderingState(state, projectId) {
  const transient = new Map();
  const legacyPrefix = `${BUILD_KEY_PREFIX}${projectId}`;
  const storage = {
    async get(key) {
      if (Array.isArray(key)) {
        const delegatedKeys = key.filter((item) => !String(item).startsWith(legacyPrefix));
        const delegated = delegatedKeys.length ? await state.storage.get(delegatedKeys) : new Map();
        return new Map(key.map((item) => [
          item,
          String(item).startsWith(legacyPrefix) ? transient.get(item) : delegated.get(item),
        ]));
      }
      if (String(key).startsWith(legacyPrefix) && transient.has(key)) return transient.get(key);
      return state.storage.get(key);
    },
    async put(key, value) {
      if (key && typeof key === "object" && !Array.isArray(key)) {
        const delegated = {};
        for (const [entryKey, entryValue] of Object.entries(key)) {
          if (entryKey.startsWith(legacyPrefix)) transient.set(entryKey, entryValue);
          else delegated[entryKey] = entryValue;
        }
        if (Object.keys(delegated).length) await state.storage.put(delegated);
        return;
      }
      if (String(key).startsWith(legacyPrefix)) {
        transient.set(key, value);
        return;
      }
      return state.storage.put(key, value);
    },
    async delete(key) {
      if (Array.isArray(key)) {
        const delegated = [];
        for (const item of key) {
          if (String(item).startsWith(legacyPrefix)) transient.delete(item);
          else delegated.push(item);
        }
        if (delegated.length) await state.storage.delete(delegated);
        return;
      }
      if (String(key).startsWith(legacyPrefix)) {
        transient.delete(key);
        return;
      }
      return state.storage.delete(key);
    },
  };
  return { storage };
}

async function storeCanonicalZip(state, projectId, bytes) {
  const metadataKey = `${BUILD_KEY_PREFIX}${projectId}:zip:metadata`;
  const previous = await state.storage.get(metadataKey);
  if (previous?.chunks) {
    const oldKeys = Array.from({ length: Number(previous.chunks) }, (_, index) => `${BUILD_KEY_PREFIX}${projectId}:zip:chunk:${index}`);
    for (let start = 0; start < oldKeys.length; start += 64) await state.storage.delete(oldKeys.slice(start, start + 64));
  }
  await state.storage.delete(`${BUILD_KEY_PREFIX}${projectId}:zip`);
  const chunks = Math.ceil(bytes.length / ZIP_CHUNK_BYTES);
  for (let start = 0; start < chunks; start += ZIP_WRITE_BATCH) {
    const entries = {};
    for (let index = start; index < Math.min(chunks, start + ZIP_WRITE_BATCH); index += 1) {
      entries[`${BUILD_KEY_PREFIX}${projectId}:zip:chunk:${index}`] = bytes.slice(
        index * ZIP_CHUNK_BYTES,
        Math.min(bytes.length, (index + 1) * ZIP_CHUNK_BYTES),
      );
    }
    await state.storage.put(entries);
  }
  await state.storage.put(metadataKey, {
    projectId,
    contract: PACKAGE_CONTRACT,
    size: bytes.length,
    chunks,
    sha256: await sha256Hex(bytes),
    storedAt: new Date().toISOString(),
  });
}

async function resolveApprovedManuscript(state, projectId, handlers) {
  const sourceHandler = handlers?.handleManuscriptSourceObjectRequest;
  if (typeof sourceHandler !== "function") {
    throw fail(500, "manuscript_source_handler_unavailable", "The manuscript source handler is required.");
  }
  const response = await sourceHandler(
    state,
    new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source/text`, { method: "GET" }),
  );
  const body = await response.clone().json().catch(() => ({}));
  if (!response.ok || !String(body?.manuscript || "").trim()) {
    throw fail(response.status || 409, "approved_manuscript_unavailable", body?.error?.message || "The approved manuscript could not be loaded.");
  }
  return String(body.manuscript).trim();
}

function artifactByKind(build, kind) {
  return (build?.artifacts || []).find((item) => item?.kind === kind) || null;
}

function requiredFile(result, artifact, label) {
  const bytes = artifact?.filename ? result?.files?.[artifact.filename] : null;
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength) {
    throw fail(502, "legacy_rendering_primitive_failed", `The internal ${label} rendering primitive did not return usable bytes.`);
  }
  return bytes;
}

async function canonicalPortraitPng(bytes, mimeType) {
  const normalized = String(mimeType || "").split(";", 1)[0].toLowerCase();
  if (normalized !== PNG_MIME) {
    throw fail(
      409,
      "canonical_portrait_cover_required",
      "The approved cover must be normalized to a 2048 x 3072 PNG during Project Setup before Digital Asset Edition V2 manufacturing.",
    );
  }
  const info = await decodePng(bytes);
  requireDimensions(info, PORTRAIT_COVER, "portrait cover");
  return bytes;
}

async function buildDigitalEditionV2({ title, author, headings, interiorPdf, portraitPng }) {
  const output = await PDFDocument.create();
  output.setTitle(title);
  output.setAuthor(author);
  output.setSubject("Mindset Media Group Digital Asset Edition V2");
  output.setCreator("Kairos Manuscript Builder");
  output.setProducer("Mindset Media Group™");

  const regular = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const cover = await output.embedPng(portraitPng);

  const coverPage = output.addPage([LETTER.width, LETTER.height]);
  drawContainedImage(coverPage, cover, LETTER.width, LETTER.height, 0);

  const titlePage = output.addPage([LETTER.width, LETTER.height]);
  drawCenteredLines(titlePage, wrap(title, 34), bold, 26, 540, 34);
  titlePage.drawText(author, {
    x: centeredTextX(author, regular, 14, LETTER.width),
    y: 430,
    size: 14,
    font: regular,
    color: rgb(0.18, 0.22, 0.28),
  });
  titlePage.drawText("Digital Asset Edition V2", {
    x: centeredTextX("Digital Asset Edition V2", bold, 12, LETTER.width),
    y: 380,
    size: 12,
    font: bold,
    color: rgb(0.04, 0.35, 0.78),
  });
  titlePage.drawText("Mindset Media Group™", {
    x: centeredTextX("Mindset Media Group™", regular, 11, LETTER.width),
    y: 96,
    size: 11,
    font: regular,
    color: rgb(0.25, 0.28, 0.34),
  });

  const contents = output.addPage([LETTER.width, LETTER.height]);
  contents.drawText("Contents", { x: 54, y: 720, size: 24, font: bold, color: rgb(0.04, 0.15, 0.32) });
  let contentsY = 678;
  const list = headings.length ? headings.slice(0, 28) : ["Introduction", "Core Concepts", "Practical Application", "Conclusion"];
  for (const [index, heading] of list.entries()) {
    const line = `${String(index + 1).padStart(2, "0")}  ${heading}`;
    for (const wrapped of wrap(line, 70)) {
      if (contentsY < 72) break;
      contents.drawText(wrapped, { x: 58, y: contentsY, size: 11, font: regular, color: rgb(0.12, 0.15, 0.2) });
      contentsY -= 18;
    }
  }

  const editionPage = output.addPage([LETTER.width, LETTER.height]);
  editionPage.drawText("About This Edition", { x: 54, y: 720, size: 24, font: bold, color: rgb(0.04, 0.15, 0.32) });
  const editionCopy = [
    "This Digital Asset Edition V2 is formatted for screen reading, reference, education, and practical implementation.",
    "The approved cover appears as page one. The manuscript text remains selectable and searchable. The print interior is supplied separately in the customer package.",
    "Publisher: Mindset Media Group™",
  ];
  let editionY = 670;
  for (const paragraph of editionCopy) {
    for (const line of wrap(paragraph, 82)) {
      editionPage.drawText(line, { x: 54, y: editionY, size: 12, font: regular, color: rgb(0.13, 0.16, 0.21) });
      editionY -= 19;
    }
    editionY -= 14;
  }

  const source = await PDFDocument.load(interiorPdf, { ignoreEncryption: true });
  const indices = source.getPageIndices();
  for (const index of indices) {
    const sourcePage = source.getPage(index);
    const embedded = await output.embedPage(sourcePage);
    const page = output.addPage([LETTER.width, LETTER.height]);
    const availableWidth = LETTER.width - 72;
    const availableHeight = LETTER.height - 72;
    const scale = Math.min(availableWidth / embedded.width, availableHeight / embedded.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    page.drawPage(embedded, {
      x: (LETTER.width - width) / 2,
      y: (LETTER.height - height) / 2,
      width,
      height,
    });
  }

  return new Uint8Array(await output.save({ useObjectStreams: false }));
}

async function buildCustomerSpecSheet({
  title,
  author,
  headings,
  wordCount,
  interiorPageCount,
  digitalPageCount,
  filenames,
}) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} — Customer Spec Sheet`);
  doc.setAuthor("Mindset Media Group™");
  doc.setCreator("Kairos Manuscript Builder");
  doc.setProducer("Mindset Media Group™");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page1 = doc.addPage([LETTER.width, LETTER.height]);
  drawHeader(page1, bold, "Customer Specification Sheet", title);
  let y = 650;
  y = drawKeyValue(page1, regular, bold, y, "Product", title);
  y = drawKeyValue(page1, regular, bold, y, "Author", author);
  y = drawKeyValue(page1, regular, bold, y, "Publisher", "Mindset Media Group™");
  y = drawKeyValue(page1, regular, bold, y, "Edition", "Digital Asset Edition V2");
  y = drawKeyValue(page1, regular, bold, y, "Word count", formatNumber(wordCount));
  y = drawKeyValue(page1, regular, bold, y, "KDP interior", `${interiorPageCount} pages · 6 x 9 inches`);
  y = drawKeyValue(page1, regular, bold, y, "Digital edition", `${digitalPageCount} pages · US Letter`);
  y -= 12;
  page1.drawText("Primary Learning Outcomes", { x: 54, y, size: 16, font: bold, color: rgb(0.04, 0.15, 0.32) });
  y -= 28;
  const outcomes = headings.length
    ? headings.slice(0, 8).map((heading) => `Develop practical understanding of ${sentenceCase(heading)}.`)
    : [
        "Understand the title's core principles and terminology.",
        "Apply the methods through structured examples and workflows.",
        "Build a repeatable system for practical implementation.",
      ];
  for (const outcome of outcomes) y = drawBullet(page1, regular, y, outcome);
  drawFooter(page1, regular, 1);

  const page2 = doc.addPage([LETTER.width, LETTER.height]);
  drawHeader(page2, bold, "Customer Package Guide", title);
  y = 648;
  const rows = [
    [filenames.specSheet, "Product specifications, file guide, and technical requirements."],
    [filenames.interior, "Print-ready 6 x 9 KDP interior. Upload as the paperback interior file."],
    [filenames.digital, "US Letter digital edition for reading, reference, and customer delivery."],
    [filenames.portrait, "Approved portrait cover at 2048 x 3072 pixels."],
    [filenames.thumbnail, "Square 2048 x 2048 promotional thumbnail with the complete cover preserved."],
    [filenames.readme, "Plain-text manifest and customer use instructions."],
  ];
  for (const [name, description] of rows) {
    page2.drawText(name, { x: 54, y, size: 10, font: bold, color: rgb(0.04, 0.35, 0.78) });
    y -= 16;
    for (const line of wrap(description, 82)) {
      page2.drawText(line, { x: 66, y, size: 10, font: regular, color: rgb(0.14, 0.17, 0.22) });
      y -= 15;
    }
    y -= 13;
  }
  page2.drawText("Technical Validation", { x: 54, y: Math.max(y - 4, 150), size: 16, font: bold, color: rgb(0.04, 0.15, 0.32) });
  let validationY = Math.max(y - 32, 122);
  for (const item of [
    "All PDFs open successfully and use selectable text where applicable.",
    "KDP interior geometry is 6 x 9 inches and contains at least 100 pages.",
    "Digital Edition V2 uses US Letter pages and begins with the approved cover.",
    "Portrait and square cover files are PNG images at the exact required dimensions.",
    "The customer ZIP contains exactly the six listed files and no internal production files.",
  ]) validationY = drawBullet(page2, regular, validationY, item);
  drawFooter(page2, regular, 2);

  return new Uint8Array(await doc.save({ useObjectStreams: false }));
}

function buildReadme({ title, author, headings, wordCount, interiorPageCount, digitalPageCount, filenames }) {
  const topicLines = headings.slice(0, 12).map((heading) => `- ${heading}`).join("\n");
  return `${title}\nDigital Asset Edition V2 — Customer Package\n\nAuthor: ${author}\nPublisher: Mindset Media Group™\nPackage Contract: ${PACKAGE_CONTRACT}\n\nPACKAGE CONTENTS\n1. ${filenames.specSheet}\n   Two-page customer specification sheet and file guide.\n2. ${filenames.interior}\n   KDP-ready 6 x 9 inch interior (${interiorPageCount} pages).\n3. ${filenames.digital}\n   US Letter Digital Edition V2 (${digitalPageCount} pages), with the approved cover as page one.\n4. ${filenames.portrait}\n   Portrait cover PNG at exactly 2048 x 3072 pixels.\n5. ${filenames.thumbnail}\n   Square cover thumbnail PNG at exactly 2048 x 2048 pixels.\n6. ${filenames.readme}\n   This package manifest and customer use guide.\n\nMANUSCRIPT DETAILS\nWord count: ${formatNumber(wordCount)}\nMinimum KDP interior standard: ${MINIMUM_KDP_INTERIOR_PAGES} pages\n\nCORE TOPICS\n${topicLines || "- See the Digital Edition V2 contents page."}\n\nUSE INSTRUCTIONS\n- Use the KDP Interior PDF for the paperback interior upload.\n- Use the Digital Edition V2 PDF for direct digital delivery and screen reading.\n- Use the portrait cover for vertical product and promotional placements.\n- Use the square thumbnail for storefront, catalog, and social preview placements.\n- Retain this README and the Customer Spec Sheet with the delivered product files.\n\nVALIDATION\nThis customer package contains exactly six files. It does not include source manuscripts, DOCX files, internal QA records, Markdown, HTML, JSON manifests, placeholders, or temporary production files.\n\n© ${new Date().getUTCFullYear()} ${author}. Published by Mindset Media Group™.\n`;
}

async function makeContainedSquareThumbnail(image) {
  const targetWidth = THUMBNAIL_COVER.width;
  const targetHeight = THUMBNAIL_COVER.height;
  const output = new Uint8Array(targetWidth * targetHeight * 4);
  for (let i = 0; i < output.length; i += 4) {
    output[i] = 0;
    output[i + 1] = 0;
    output[i + 2] = 0;
    output[i + 3] = 255;
  }
  const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * scale));
  const drawHeight = Math.max(1, Math.round(image.height * scale));
  const offsetX = Math.floor((targetWidth - drawWidth) / 2);
  const offsetY = Math.floor((targetHeight - drawHeight) / 2);

  for (let y = 0; y < drawHeight; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < drawWidth; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor(x / scale));
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      const targetOffset = ((offsetY + y) * targetWidth + offsetX + x) * 4;
      const alpha = image.rgba[sourceOffset + 3] / 255;
      output[targetOffset] = Math.round(image.rgba[sourceOffset] * alpha);
      output[targetOffset + 1] = Math.round(image.rgba[sourceOffset + 1] * alpha);
      output[targetOffset + 2] = Math.round(image.rgba[sourceOffset + 2] * alpha);
      output[targetOffset + 3] = 255;
    }
  }
  return encodePng(targetWidth, targetHeight, output);
}

async function decodePng(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!(bytes instanceof Uint8Array) || !signature.every((value, index) => bytes[index] === value)) {
    throw fail(400, "cover_png_invalid", "The canonical cover PNG signature is invalid.");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readU32(data, 0);
      height = readU32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0) {
    throw fail(400, "cover_png_unsupported", "The canonical cover must be a non-interlaced 8-bit PNG.");
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[colorType];
  if (!channels) throw fail(400, "cover_png_unsupported", "The canonical cover PNG color format is not supported.");
  const inflated = await inflate(concatBytes(idat));
  const rowBytes = width * channels;
  const raw = new Uint8Array(rowBytes * height);
  let inputOffset = 0;
  let outputOffset = 0;
  let previous = new Uint8Array(rowBytes);
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[inputOffset++];
    const current = inflated.slice(inputOffset, inputOffset + rowBytes);
    inputOffset += rowBytes;
    unfilter(current, previous, channels, filter);
    raw.set(current, outputOffset);
    outputOffset += rowBytes;
    previous = current;
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const src = pixel * channels;
    const dst = pixel * 4;
    if (colorType === 0) {
      rgba[dst] = raw[src];
      rgba[dst + 1] = raw[src];
      rgba[dst + 2] = raw[src];
      rgba[dst + 3] = transparency && raw[src] === transparency[1] ? 0 : 255;
    } else if (colorType === 2) {
      rgba[dst] = raw[src];
      rgba[dst + 1] = raw[src + 1];
      rgba[dst + 2] = raw[src + 2];
      rgba[dst + 3] = 255;
    } else if (colorType === 3) {
      const index = raw[src];
      rgba[dst] = palette?.[index * 3] ?? 0;
      rgba[dst + 1] = palette?.[index * 3 + 1] ?? 0;
      rgba[dst + 2] = palette?.[index * 3 + 2] ?? 0;
      rgba[dst + 3] = transparency?.[index] ?? 255;
    } else if (colorType === 4) {
      rgba[dst] = raw[src];
      rgba[dst + 1] = raw[src];
      rgba[dst + 2] = raw[src];
      rgba[dst + 3] = raw[src + 1];
    } else {
      rgba[dst] = raw[src];
      rgba[dst + 1] = raw[src + 1];
      rgba[dst + 2] = raw[src + 2];
      rgba[dst + 3] = raw[src + 3];
    }
  }
  return { width, height, rgba };
}

async function encodePng(width, height, rgba) {
  const scanlines = new Uint8Array(height * (width * 4 + 1));
  let sourceOffset = 0;
  let targetOffset = 0;
  for (let y = 0; y < height; y += 1) {
    scanlines[targetOffset++] = 0;
    scanlines.set(rgba.subarray(sourceOffset, sourceOffset + width * 4), targetOffset);
    sourceOffset += width * 4;
    targetOffset += width * 4;
  }
  const compressed = await deflate(scanlines);
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return concatBytes([
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function pngChunk(type, data) {
  const typeBytes = encode(type);
  const output = new Uint8Array(12 + data.length);
  writeU32(output, 0, data.length);
  output.set(typeBytes, 4);
  output.set(data, 8);
  writeU32(output, 8 + data.length, crc32(concatBytes([typeBytes, data])));
  return output;
}

function unfilter(current, previous, bytesPerPixel, filter) {
  for (let index = 0; index < current.length; index += 1) {
    const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
    const up = previous[index] || 0;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] || 0 : 0;
    if (filter === 1) current[index] = (current[index] + left) & 255;
    else if (filter === 2) current[index] = (current[index] + up) & 255;
    else if (filter === 3) current[index] = (current[index] + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) current[index] = (current[index] + paeth(left, up, upLeft)) & 255;
    else if (filter !== 0) throw fail(400, "cover_png_filter_unsupported", "The canonical cover PNG uses an unsupported row filter.");
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function requireDimensions(image, expected, label) {
  if (image.width !== expected.width || image.height !== expected.height) {
    throw fail(
      409,
      "canonical_cover_dimensions_invalid",
      `The ${label} is ${image.width} x ${image.height}. The canonical MMG standard requires exactly ${expected.width} x ${expected.height} pixels.`,
    );
  }
}

function validatePackageFiles(files, filenames) {
  if (files.length !== REQUIRED_PACKAGE_FILE_COUNT) {
    throw fail(500, "canonical_package_file_count_invalid", `The customer package must contain exactly ${REQUIRED_PACKAGE_FILE_COUNT} files.`);
  }
  const kinds = files.map((item) => item.kind);
  if (JSON.stringify(kinds) !== JSON.stringify(REQUIRED_DELIVERABLE_KINDS)) {
    throw fail(500, "canonical_package_kind_order_invalid", "The customer package files do not match the canonical Digital Asset Edition V2 order.");
  }
  const expectedNames = [
    filenames.specSheet,
    filenames.interior,
    filenames.digital,
    filenames.portrait,
    filenames.thumbnail,
    filenames.readme,
  ];
  const names = files.map((item) => item.filename);
  if (JSON.stringify(names) !== JSON.stringify(expectedNames) || new Set(names).size !== REQUIRED_PACKAGE_FILE_COUNT) {
    throw fail(500, "canonical_package_filenames_invalid", "The customer package filenames do not match the title-specific canonical manifest.");
  }
  const forbidden = /(?:\.docx$|\.md$|\.html?$|\.json$|source|qa|manifest)/i;
  if (names.some((name) => forbidden.test(name))) {
    throw fail(500, "canonical_package_forbidden_file", "The customer package contains a forbidden internal or source file.");
  }
}

async function buildArtifact(projectId, createdAt, item) {
  return {
    artifactId: `artifact_${crypto.randomUUID()}`,
    projectId,
    kind: item.kind,
    filename: item.filename,
    mimeType: item.mimeType,
    bytes: item.data.byteLength,
    sha256: await sha256Hex(item.data),
    role: item.role,
    status: "ready",
    createdAt,
    downloadURL: item.kind === "ZIP_ARCHIVE"
      ? `/api/production-registry/manuscripts/${encodeURIComponent(projectId)}/deliverables/zip`
      : null,
  };
}

function drawContainedImage(page, image, width, height, margin) {
  const availableWidth = width - margin * 2;
  const availableHeight = height - margin * 2;
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0, 0, 0) });
  page.drawImage(image, {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
}

function drawCenteredLines(page, lines, font, size, startY, leading) {
  let y = startY;
  for (const line of lines) {
    page.drawText(line, {
      x: centeredTextX(line, font, size, LETTER.width),
      y,
      size,
      font,
      color: rgb(0.04, 0.15, 0.32),
    });
    y -= leading;
  }
}

function centeredTextX(text, font, size, width) {
  return Math.max(36, (width - font.widthOfTextAtSize(text, size)) / 2);
}

function drawHeader(page, bold, heading, title) {
  page.drawRectangle({ x: 0, y: 710, width: LETTER.width, height: 82, color: rgb(0.02, 0.07, 0.14) });
  page.drawText(heading, { x: 54, y: 752, size: 20, font: bold, color: rgb(1, 1, 1) });
  const titleLines = wrap(title, 70).slice(0, 2);
  let y = 728;
  for (const line of titleLines) {
    page.drawText(line, { x: 54, y, size: 10, font: bold, color: rgb(0.25, 0.7, 1) });
    y -= 13;
  }
}

function drawFooter(page, regular, pageNumber) {
  page.drawText(`Mindset Media Group™ · Digital Asset Edition V2 · ${pageNumber} of 2`, {
    x: 54,
    y: 28,
    size: 8,
    font: regular,
    color: rgb(0.35, 0.38, 0.44),
  });
}

function drawKeyValue(page, regular, bold, y, label, value) {
  page.drawText(`${label}:`, { x: 54, y, size: 10, font: bold, color: rgb(0.08, 0.18, 0.33) });
  const lines = wrap(String(value), 66);
  let current = y;
  for (const line of lines) {
    page.drawText(line, { x: 170, y: current, size: 10, font: regular, color: rgb(0.14, 0.17, 0.22) });
    current -= 15;
  }
  return Math.min(y - 22, current - 7);
}

function drawBullet(page, font, y, value) {
  const lines = wrap(String(value), 78);
  page.drawCircle({ x: 60, y: y + 3, size: 2, color: rgb(0.04, 0.35, 0.78) });
  let current = y;
  for (const line of lines) {
    page.drawText(line, { x: 72, y: current, size: 10, font, color: rgb(0.14, 0.17, 0.22) });
    current -= 15;
  }
  return current - 7;
}

function manuscriptHeadings(manuscript) {
  const lines = String(manuscript || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headings = [];
  for (const line of lines) {
    if (/^(?:chapter|part|section|introduction|conclusion|final conclusion|about the author|appendix)\b/i.test(line)
      || (/^[A-Z][^.!?]{3,80}$/.test(line) && line.split(/\s+/).length <= 10)) {
      const cleaned = line.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
      if (cleaned && !headings.includes(cleaned)) headings.push(cleaned);
    }
  }
  return headings.slice(0, 60);
}

function titleStem(title, options = {}) {
  const words = String(title || "Untitled")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const transformed = words.map((word) => {
    if (options.preserveUppercase && /^[A-Z0-9]{2,}$/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  return transformed.join("-") || "Untitled";
}

function sentenceCase(value) {
  const text = String(value || "").replace(/^[^A-Za-z0-9]+/, "").trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "the subject";
}

function wrap(value, maxCharacters) {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function countWords(value) {
  return (String(value || "").match(/\b[\w’'-]+\b/g) || []).length;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function writeZip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encode(file.filename);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localHeader.set(name, 30);
    local.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(name, 46);
    central.push(centralHeader);
    offset += localHeader.length + data.length;
  }
  const centralBytes = concatBytes(central);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralBytes.length, true);
  endView.setUint32(16, offset, true);
  return concatBytes([...local, centralBytes, end]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readU32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function writeU32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value >>> 0, false);
}

function concatBytes(values) {
  const length = values.reduce((total, value) => total + value.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.byteLength;
  }
  return output;
}

function encode(value) {
  return new TextEncoder().encode(String(value));
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
