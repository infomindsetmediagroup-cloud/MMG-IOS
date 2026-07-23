import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { unzlibSync, zlibSync } from "fflate";

export const KAIROS_DIGITAL_ASSET_V2_BUILD = "kairos-digital-asset-edition-v2-20260722-1";
export const DIGITAL_ASSET_V2_LABEL = "MMG Digital Asset Edition V2";
export const MINIMUM_FINISHED_PAGES = 100;

const CUSTOMER_FORBIDDEN_PATTERNS = [
  /Michael\s+King/gi,
  /\bShopify\b/gi,
  /\bKairos\b/gi,
  /admin asset vault/gi,
  /production manifest/gi,
  /internal production/gi,
  /private (?:url|link)/gi,
  /qa report/gi,
];

const PRACTICAL_MODULE_TERMS = [
  "framework",
  "workflow",
  "checklist",
  "worksheet",
  "template",
  "prompt",
  "lab",
  "action step",
  "decision rule",
  "implementation",
];

export function customerReleaseNames(publication = {}) {
  const base = safeBaseName(publication.title || "Digital-Asset");
  return Object.freeze({
    specSheet: `${base}_Customer-Spec-Sheet.pdf`,
    kdpInterior: `${base}_KDP-Interior_6x9.pdf`,
    digitalEdition: `${base}_Digital-Edition-V2.pdf`,
    portraitCover: `${base}_Cover-Portrait_2048x3072.png`,
    thumbnailCover: `${base}_Cover-Thumbnail_2048x2048.png`,
    readme: `${base}_README.txt`,
  });
}

export function normalizeDigitalAssetV2Publication(publication = {}) {
  const chapters = Array.isArray(publication.chapters)
    ? publication.chapters.map((chapter, index) => ({
        ...chapter,
        number: Number(chapter?.number || index + 1),
        title: sanitizeCustomerText(chapter?.title || `Section ${index + 1}`),
        content: sanitizeCustomerText(chapter?.content || ""),
      }))
    : [];

  const normalized = {
    ...publication,
    title: sanitizeCustomerText(publication.title || "Untitled Digital Guide"),
    subtitle: sanitizeCustomerText(publication.subtitle || ""),
    author: "Mindset Media Group™",
    publisher: "Mindset Media Group™",
    creator: "Mindset Media Group™",
    backCoverCopy: sanitizeCustomerText(publication.backCoverCopy || ""),
    chapters,
    digitalAssetEdition: {
      label: DIGITAL_ASSET_V2_LABEL,
      version: "2.0",
      minimumFinishedPages: MINIMUM_FINISHED_PAGES,
      customerFacingOnly: true,
      individualAttributionAllowed: false,
      shopifyContentAllowed: false,
      internalWorkflowContentAllowed: false,
      sourceOfTruth: "Master Production DOCX",
      build: KAIROS_DIGITAL_ASSET_V2_BUILD,
    },
  };

  normalized.wordCount = Number(publication.wordCount || countWords(chapters.map((chapter) => chapter.content).join("\n")));
  normalized.pageCount = Number(publication.pageCount || Math.ceil(normalized.wordCount / 250));
  assertDigitalAssetV2Manuscript(normalized);
  return normalized;
}

export function assertDigitalAssetV2Manuscript(publication = {}) {
  const chapters = Array.isArray(publication.chapters) ? publication.chapters : [];
  const body = chapters.map((chapter) => `${chapter.title || ""}\n${chapter.content || ""}`).join("\n\n");
  const wordCount = Number(publication.wordCount || countWords(body));
  const pageCount = Number(publication.pageCount || Math.ceil(wordCount / 250));

  if (pageCount < MINIMUM_FINISHED_PAGES) {
    throw contractError(
      "digital_asset_v2_minimum_pages_not_met",
      `Digital Asset Edition V2 requires at least ${MINIMUM_FINISHED_PAGES} substantive finished pages. The current manuscript is estimated at ${pageCount}.`,
    );
  }
  if (chapters.length < 8) {
    throw contractError("digital_asset_v2_structure_incomplete", "Digital Asset Edition V2 requires a substantial part-and-chapter progression with at least eight developed sections.");
  }

  const lower = body.toLowerCase();
  const practicalModules = PRACTICAL_MODULE_TERMS.filter((term) => lower.includes(term));
  if (practicalModules.length < 5) {
    throw contractError(
      "digital_asset_v2_practical_tools_incomplete",
      "The manuscript must operate as a premium customer field guide with multiple frameworks, workflows, checklists, worksheets, templates, prompts, labs, decision rules, or implementation tools.",
    );
  }

  const duplicateRatio = repeatedParagraphRatio(body);
  if (duplicateRatio > 0.1) {
    throw contractError("digital_asset_v2_padding_detected", "The manuscript contains excessive repeated paragraphs and cannot use duplication or filler to satisfy the page requirement.");
  }

  assertCustomerFacingText(body, "manuscript");
  return { pageCount, wordCount, chapterCount: chapters.length, practicalModules, duplicateRatio };
}

export async function buildCustomerSpecSheetPDF(publication, names = customerReleaseNames(publication)) {
  const normalized = normalizeDigitalAssetV2Publication(publication);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const lineHeight = 15;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 58;

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - 58;
  };
  const heading = (text, size = 15) => {
    if (y < 110) newPage();
    page.drawText(text, { x: margin, y, size, font: bold, color: rgb(0.02, 0.22, 0.35), maxWidth: pageWidth - margin * 2 });
    y -= size + 12;
  };
  const paragraph = (text, options = {}) => {
    const size = options.size || 10.5;
    const lines = wrapText(text, regular, size, pageWidth - margin * 2);
    for (const line of lines) {
      if (y < 58) newPage();
      page.drawText(line, { x: margin, y, size, font: regular, color: rgb(0.08, 0.09, 0.11) });
      y -= options.lineHeight || lineHeight;
    }
    y -= options.after == null ? 8 : options.after;
  };
  const bullet = (text) => paragraph(`• ${text}`, { after: 3 });

  page.drawText("MINDSET MEDIA GROUP™", { x: margin, y, size: 10, font: bold, color: rgb(0.03, 0.48, 0.72) });
  y -= 30;
  page.drawText(normalized.title, { x: margin, y, size: 24, font: bold, color: rgb(0.02, 0.08, 0.13), maxWidth: pageWidth - margin * 2 });
  y -= 38;
  if (normalized.subtitle) paragraph(normalized.subtitle, { size: 12, after: 12 });
  page.drawText("Customer Product Specification", { x: margin, y, size: 15, font: bold, color: rgb(0.03, 0.48, 0.72) });
  y -= 32;

  heading("About This Edition");
  paragraph(`${normalized.title} is a ${DIGITAL_ASSET_V2_LABEL} publication developed as a substantial, customer-ready operating manual. It is designed for practical use, repeat reference, and direct implementation—not as a thin or abbreviated ebook.`);

  heading("What You Receive");
  bullet(`${names.digitalEdition} — customer-ready digital reading edition with the approved cover as page one.`);
  bullet(`${names.kdpInterior} — clean 6 × 9-inch interior PDF without an embedded front cover.`);
  bullet(`${names.portraitCover} — 2048 × 3072-pixel portrait cover image.`);
  bullet(`${names.thumbnailCover} — 2048 × 2048-pixel square thumbnail with the full portrait cover preserved.`);
  bullet(`${names.readme} — package guide and file-use instructions.`);
  bullet(`${names.specSheet} — this customer-facing product specification.`);

  heading("What the Book Provides");
  paragraph(summaryFor(normalized));
  paragraph(`The edition contains ${normalized.chapters.length} developed sections and approximately ${normalized.pageCount} finished pages. Its practical architecture uses reusable systems such as frameworks, workflows, prompts, templates, checklists, worksheets, labs, decision rules, and implementation steps where appropriate to the subject.`);

  heading("Who This Is For");
  paragraph(audienceFor(normalized));

  heading("How to Use the Package");
  bullet("Open the Digital Edition for screen reading, study, and direct use.");
  bullet("Use the KDP Interior only for a compatible 6 × 9-inch print-interior workflow.");
  bullet("Use the portrait cover for product listings and tall-format presentation.");
  bullet("Use the square thumbnail where a 1:1 marketplace or library image is required.");
  bullet("Keep the files together so edition, cover, and usage information remain aligned.");

  heading("Technical Specifications");
  bullet(`Edition: ${DIGITAL_ASSET_V2_LABEL}`);
  bullet(`Publisher and creator identity: Mindset Media Group™`);
  bullet(`Minimum finished length: ${MINIMUM_FINISHED_PAGES} substantive pages`);
  bullet("Digital PDF: cover included as page one; selectable text and structured headings where supported.");
  bullet("KDP Interior PDF: 6 × 9 inches; cover-free interior; print-safe page geometry.");
  bullet("Portrait cover: PNG, RGB, 2048 × 3072 pixels, 2:3 aspect ratio.");
  bullet("Square thumbnail: PNG, RGB, 2048 × 2048 pixels, full portrait cover visible without cropping or redrawing.");

  heading("Customer Use Notice");
  paragraph("These files are provided as a coordinated publication package. Preserve the original filenames and edition label when archiving or transferring the package. Review the applicable platform requirements before uploading the KDP Interior or cover images to a third-party service.");

  pdf.setTitle(`${normalized.title} — Customer Product Specification`);
  pdf.setAuthor("Mindset Media Group™");
  pdf.setCreator("Mindset Media Group™");
  pdf.setProducer("Mindset Media Group™");
  pdf.setSubject(DIGITAL_ASSET_V2_LABEL);
  return pdf.save();
}

export function buildCustomerREADME(publication, names = customerReleaseNames(publication)) {
  const normalized = normalizeDigitalAssetV2Publication(publication);
  const text = [
    normalized.title,
    DIGITAL_ASSET_V2_LABEL,
    "Published by Mindset Media Group™",
    "",
    "PACKAGE CONTENTS",
    `1. ${names.specSheet}`,
    `2. ${names.kdpInterior}`,
    `3. ${names.digitalEdition}`,
    `4. ${names.portraitCover}`,
    `5. ${names.thumbnailCover}`,
    `6. ${names.readme}`,
    "",
    "HOW TO USE THESE FILES",
    "- Read and use the Digital Edition as the primary customer edition.",
    "- Use the KDP Interior only as a cover-free 6 × 9-inch print interior.",
    "- Use the portrait cover for tall-format product presentation.",
    "- Use the square thumbnail where a 1:1 image is required.",
    "- Open the Customer Product Specification for edition details, package guidance, and technical specifications.",
    "",
    "EDITION DETAILS",
    `- Edition: ${DIGITAL_ASSET_V2_LABEL}`,
    `- Finished pages: approximately ${normalized.pageCount}`,
    `- Developed sections: ${normalized.chapters.length}`,
    "- Publisher and creator identity: Mindset Media Group™",
    "",
    "IMPORTANT",
    "The Digital Edition includes the approved front cover as page one. The KDP Interior does not include a front cover. Keep the files together and preserve their original filenames.",
    "",
  ].join("\n");
  assertCustomerFacingText(text, "README");
  return new TextEncoder().encode(text);
}

export function buildPortraitCoverPNG(cover) {
  return resizeApprovedCover(cover, 2048, 3072);
}

export function buildThumbnailCoverPNG(cover) {
  return resizeApprovedCover(cover, 2048, 2048);
}

export function assertCustomerFacingText(value, label = "customer deliverable") {
  const text = String(value || "");
  for (const pattern of CUSTOMER_FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      throw contractError("digital_asset_v2_customer_facing_violation", `${label} contains internal, storefront, workflow, or individual-attribution content that is prohibited from the customer release.`);
    }
  }
  return true;
}

function sanitizeCustomerText(value) {
  let text = String(value == null ? "" : value).replace(/Michael\s+King/gi, "Mindset Media Group™");
  text = text.replace(/^\s*Author\s*:\s*Mindset Media Group™\s*$/gim, "Published by Mindset Media Group™");
  return text.trim();
}

function resizeApprovedCover(cover, targetWidth, targetHeight) {
  const type = String(cover?.type || cover?.contentType || "image/png").split(";", 1)[0].toLowerCase();
  const bytes = normalizeBytes(cover?.bytes || cover?.data || cover);
  if (type !== "image/png" || !bytes?.length) {
    throw contractError("digital_asset_v2_png_cover_required", "Digital Asset Edition V2 cover derivatives require the approved source cover as a PNG image.");
  }
  const decoded = decodePNG(bytes);
  const scale = Math.min(targetWidth / decoded.width, targetHeight / decoded.height);
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const offsetX = Math.floor((targetWidth - width) / 2);
  const offsetY = Math.floor((targetHeight - height) / 2);
  const background = sampleBackground(decoded.data, decoded.width, decoded.height);
  const output = new Uint8Array(targetWidth * targetHeight * 4);
  for (let index = 0; index < output.length; index += 4) {
    output[index] = background[0];
    output[index + 1] = background[1];
    output[index + 2] = background[2];
    output[index + 3] = 255;
  }
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(decoded.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(decoded.width - 1, Math.floor(x / scale));
      const sourceIndex = (sourceY * decoded.width + sourceX) * 4;
      const outputIndex = ((y + offsetY) * targetWidth + x + offsetX) * 4;
      output[outputIndex] = decoded.data[sourceIndex];
      output[outputIndex + 1] = decoded.data[sourceIndex + 1];
      output[outputIndex + 2] = decoded.data[sourceIndex + 2];
      output[outputIndex + 3] = decoded.data[sourceIndex + 3];
    }
  }
  return encodePNG(targetWidth, targetHeight, output);
}

function decodePNG(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) throw contractError("digital_asset_v2_cover_invalid", "The approved cover is not a valid PNG image.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    const type = ascii(bytes.slice(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = readU32(data, 0);
      height = readU32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw contractError("digital_asset_v2_cover_png_unsupported", "The approved PNG cover must be non-interlaced, 8-bit RGB or RGBA.");
  }
  const compressed = concatBytes(...idat);
  const raw = unzlibSync(compressed);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const expected = height * (stride + 1);
  if (raw.length !== expected) throw contractError("digital_asset_v2_cover_png_corrupt", "The approved PNG cover could not be decoded consistently.");
  const scanlines = new Uint8Array(height * stride);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset++];
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[sourceOffset++];
      const left = x >= bpp ? scanlines[rowOffset + x - bpp] : 0;
      const up = y > 0 ? scanlines[rowOffset - stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? scanlines[rowOffset - stride + x - bpp] : 0;
      if (filter === 0) scanlines[rowOffset + x] = value;
      else if (filter === 1) scanlines[rowOffset + x] = (value + left) & 255;
      else if (filter === 2) scanlines[rowOffset + x] = (value + up) & 255;
      else if (filter === 3) scanlines[rowOffset + x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) scanlines[rowOffset + x] = (value + paeth(left, up, upLeft)) & 255;
      else throw contractError("digital_asset_v2_cover_png_filter", "The approved PNG cover uses an unsupported scanline filter.");
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0, source = 0; pixel < width * height; pixel += 1) {
    const target = pixel * 4;
    rgba[target] = scanlines[source++];
    rgba[target + 1] = scanlines[source++];
    rgba[target + 2] = scanlines[source++];
    rgba[target + 3] = colorType === 6 ? scanlines[source++] : 255;
  }
  return { width, height, data: rgba };
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    raw.set(rgba.slice(y * stride, (y + 1) * stride), row + 1);
  }
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return concatBytes(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlibSync(raw, { level: 6 })),
    pngChunk("IEND", new Uint8Array()),
  );
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const output = new Uint8Array(data.length + 12);
  writeU32(output, 0, data.length);
  output.set(typeBytes, 4);
  output.set(data, 8);
  writeU32(output, data.length + 8, crc32(concatBytes(typeBytes, data)));
  return output;
}

function sampleBackground(data, width, height) {
  const points = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  const sum = [0, 0, 0];
  for (const [x, y] of points) {
    const index = (y * width + x) * 4;
    sum[0] += data[index];
    sum[1] += data[index + 1];
    sum[2] += data[index + 2];
  }
  return sum.map((value) => Math.round((value / points.length) * 0.72));
}

function repeatedParagraphRatio(text) {
  const paragraphs = String(text || "").split(/\n{2,}/).map((value) => value.trim().replace(/\s+/g, " ").toLowerCase()).filter((value) => value.length >= 80);
  if (paragraphs.length < 10) return 0;
  const seen = new Set();
  let duplicates = 0;
  for (const paragraph of paragraphs) {
    if (seen.has(paragraph)) duplicates += 1;
    else seen.add(paragraph);
  }
  return duplicates / paragraphs.length;
}

function summaryFor(publication) {
  const source = String(publication.description || publication.summary || publication.promise || publication.backCoverCopy || "").trim();
  return sanitizeCustomerText(source || `${publication.title} converts the subject into a structured system that customers can study, apply, and reuse.`);
}

function audienceFor(publication) {
  const source = publication.audience;
  if (Array.isArray(source)) return sanitizeCustomerText(source.join(", "));
  if (source) return sanitizeCustomerText(source);
  return "Readers, creators, entrepreneurs, and professionals who want a structured, practical system they can apply directly.";
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function safeBaseName(value) {
  return String(value || "Digital Asset")
    .normalize("NFKD")
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-") || "Digital-Asset";
}

function countWords(value) { return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length; }
function normalizeBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}
function ascii(value) { return String.fromCharCode(...value); }
function readU32(bytes, offset) { return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0; }
function writeU32(bytes, offset, value) { bytes[offset] = (value >>> 24) & 255; bytes[offset + 1] = (value >>> 16) & 255; bytes[offset + 2] = (value >>> 8) & 255; bytes[offset + 3] = value & 255; }
function concatBytes(...parts) { const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }
function paeth(a, b, c) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function contractError(code, message) { const error = new Error(message); error.code = code; error.status = 409; return error; }
