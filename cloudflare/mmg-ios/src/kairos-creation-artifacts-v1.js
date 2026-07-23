import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ARTIFACT_NAMES, artifactContentType, buildArtifact } from "./kairos-native-publishing-artifacts-v1.js";
import { PRODUCT_ASSET_NAMES, buildProductAssetSVG, buildShopifyProductHTML } from "./kairos-product-page-package-v1.js";
import {
  DIGITAL_ASSET_V2_LABEL,
  KAIROS_DIGITAL_ASSET_V2_BUILD,
  assertCustomerFacingText,
  buildPortraitCoverPNG,
  buildThumbnailCoverPNG,
  customerReleaseNames,
  normalizeDigitalAssetV2Publication,
} from "./kairos-digital-asset-edition-v2-contract-v1.js";
import {
  KAIROS_DIGITAL_ASSET_V2_CUSTOMER_DOCS_BUILD,
  buildCustomerREADMEV2,
  buildCustomerSpecSheetPDFV2,
} from "./kairos-digital-asset-v2-customer-docs-v2.js";

export const KAIROS_CREATION_ARTIFACTS_VERSION = "kairos-creation-artifacts-v2-customer-release-20260723-2";

const PUBLISHER = "Mindset Media Group™";

export const CUSTOMER_DELIVERABLE_NAMES = Object.freeze([
  "customer-spec-sheet.pdf",
  "kdp-interior-6x9.pdf",
  "digital-asset-edition-v2.pdf",
  "cover-portrait-2048x3072.png",
  "cover-thumbnail-2048x2048.png",
  "README.txt",
]);

const INTERNAL_PRODUCTION_ARTIFACTS = Object.freeze([
  "gold-master.docx",
  "digital-asset.pdf",
  "kdp-interior.pdf",
  "kdp-full-wrap-cover.pdf",
  "ebook.epub",
  "shopify-product-page.html",
  "product-package.json",
  "research-record.json",
  ...PRODUCT_ASSET_NAMES,
]);

export function creationArtifactNames(cover = null) {
  return [
    ...CUSTOMER_DELIVERABLE_NAMES,
    ...INTERNAL_PRODUCTION_ARTIFACTS,
    approvedCoverName(cover),
    "complete-production-package.zip",
  ];
}

export async function buildCreationArtifact(name, publication, product, cover = null) {
  const names = creationArtifactNames(cover);
  if (!names.includes(name) && ![...ARTIFACT_NAMES, "cover-preview.png", "cover-preview.jpg", "cover-preview.svg"].includes(name)) {
    throw artifactError("creation_artifact_not_found", "Unknown creation artifact.", 404);
  }

  const normalized = normalizeDigitalAssetV2Publication(publication);
  const normalizedProduct = normalizeProduct(product, normalized);
  const options = { coverBytes: cover?.bytes || null, coverMime: cover?.type || "image/png" };

  if (name === "customer-spec-sheet.pdf") return buildCustomerSpecSheetPDFV2(normalized);
  if (name === "kdp-interior-6x9.pdf") {
    return customerizePDF(await buildArtifact("kdp-interior.pdf", normalized, options), normalized, "KDP Interior");
  }
  if (name === "digital-asset-edition-v2.pdf") {
    return customerizeDigitalPDF(await buildArtifact("digital-asset.pdf", normalized, options), normalized);
  }
  if (name === "cover-portrait-2048x3072.png") return buildPortraitCoverPNG(cover);
  if (name === "cover-thumbnail-2048x2048.png") return buildThumbnailCoverPNG(cover);
  if (name === "README.txt") return buildCustomerREADMEV2(normalized);

  if (["gold-master.docx", "digital-asset.pdf", "kdp-interior.pdf", "kdp-full-wrap-cover.pdf", "production-package.zip", "ebook-cover.png", "cover-preview.png", "cover-preview.svg"].includes(name)) {
    return buildArtifact(name, normalized, options);
  }
  if (name === "cover-preview.jpg" || name === approvedCoverName(cover)) return cover?.bytes || buildArtifact("ebook-cover.png", normalized);
  if (name === "ebook.epub") return buildEPUB(normalized, cover);
  if (name === "shopify-product-page.html") return strToU8(buildShopifyProductHTML(normalizedProduct));
  if (name === "product-package.json") return jsonBytes(normalizedProduct);
  if (name === "research-record.json") return jsonBytes(buildResearchRecord(normalized));
  if (PRODUCT_ASSET_NAMES.includes(name)) return strToU8(buildProductAssetSVG(name, normalized, normalizedProduct, approvedCoverName(cover)));
  if (name === "complete-production-package.zip") return buildCompletePackage(normalized, cover);
  throw artifactError("creation_artifact_not_found", "Unknown creation artifact.", 404);
}

export function creationArtifactContentType(name) {
  if (name.endsWith(".epub")) return "application/epub+zip";
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return artifactContentType(name);
}

async function buildCompletePackage(publication, cover) {
  const names = customerReleaseNames(publication);
  const interior = await customerizePDF(await buildArtifact("kdp-interior.pdf", publication), publication, "KDP Interior");
  const digital = await customerizeDigitalPDF(
    await buildArtifact("digital-asset.pdf", publication, { coverBytes: cover?.bytes || null, coverMime: cover?.type || "image/png" }),
    publication,
  );
  const files = {
    [names.specSheet]: await buildCustomerSpecSheetPDFV2(publication, names),
    [names.kdpInterior]: interior,
    [names.digitalEdition]: digital,
    [names.portraitCover]: buildPortraitCoverPNG(cover),
    [names.thumbnailCover]: buildThumbnailCoverPNG(cover),
    [names.readme]: buildCustomerREADMEV2(publication, names),
  };

  if (Object.keys(files).length !== 6) throw artifactError("digital_asset_v2_package_count_invalid", "The customer release package must contain exactly six deliverables.", 500);
  assertCustomerFacingText(new TextDecoder().decode(files[names.readme]), "README");
  return zipSync(files, { level: 6 });
}

async function customerizePDF(bytes, publication, editionLabel) {
  const pdf = await PDFDocument.load(bytes);
  pdf.setTitle(`${publication.title} - ${editionLabel}`);
  pdf.setSubject(DIGITAL_ASSET_V2_LABEL);
  pdf.setAuthor(PUBLISHER);
  pdf.setCreator(PUBLISHER);
  pdf.setProducer(PUBLISHER);
  pdf.setKeywords([publication.title, DIGITAL_ASSET_V2_LABEL, PUBLISHER]);
  return pdf.save();
}

async function customerizeDigitalPDF(bytes, publication) {
  const pdf = await PDFDocument.load(bytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 612;
  const height = 792;
  const margin = 58;
  const contentWidth = width - margin * 2;

  const titlePage = pdf.insertPage(1, [width, height]);
  titlePage.drawText(PUBLISHER.toUpperCase(), { x: margin, y: 700, size: 10, font: bold, color: rgb(0.02, 0.48, 0.72) });
  let titleY = 590;
  for (const line of wrapPDF(publication.title, bold, 28, contentWidth)) {
    titlePage.drawText(line, { x: margin, y: titleY, size: 28, font: bold, color: rgb(0.02, 0.08, 0.13) });
    titleY -= 36;
  }
  if (publication.subtitle) {
    titleY -= 10;
    for (const line of wrapPDF(publication.subtitle, regular, 13, contentWidth)) {
      titlePage.drawText(line, { x: margin, y: titleY, size: 13, font: regular, color: rgb(0.18, 0.25, 0.31) });
      titleY -= 19;
    }
  }
  titlePage.drawText(DIGITAL_ASSET_V2_LABEL, { x: margin, y: 205, size: 13, font: bold, color: rgb(0.02, 0.48, 0.72) });
  titlePage.drawText(`Published by ${PUBLISHER}`, { x: margin, y: 174, size: 11, font: regular, color: rgb(0.12, 0.12, 0.12) });

  const chapters = Array.isArray(publication.chapters) ? publication.chapters : [];
  let insertAt = 2;
  let contentsPage = null;
  let y = 710;
  const createContentsPage = () => {
    contentsPage = pdf.insertPage(insertAt++, [width, height]);
    contentsPage.drawText("Contents", { x: margin, y: 720, size: 22, font: bold, color: rgb(0.02, 0.08, 0.13) });
    y = 680;
  };
  createContentsPage();
  chapters.forEach((chapter, index) => {
    if (y < 70) createContentsPage();
    const title = cleanCustomerText(chapter?.title || `Section ${index + 1}`);
    const lines = wrapPDF(`${index + 1}. ${title}`, regular, 10.2, contentWidth);
    for (const line of lines) {
      if (y < 70) createContentsPage();
      contentsPage.drawText(line, { x: margin, y, size: 10.2, font: regular, color: rgb(0.10, 0.11, 0.13) });
      y -= 15;
    }
    y -= 4;
  });

  pdf.setTitle(`${publication.title} - Digital Edition V2`);
  pdf.setSubject(DIGITAL_ASSET_V2_LABEL);
  pdf.setAuthor(PUBLISHER);
  pdf.setCreator(PUBLISHER);
  pdf.setProducer(PUBLISHER);
  pdf.setKeywords([publication.title, DIGITAL_ASSET_V2_LABEL, PUBLISHER]);
  return pdf.save();
}

async function buildEPUB(publication, cover) {
  const identifier = `urn:uuid:${publication.projectId}`;
  const coverName = approvedCoverName(cover);
  const coverBytes = cover?.bytes || await buildArtifact("ebook-cover.png", publication);
  const coverMime = cover?.type || "image/png";
  const chapterNames = publication.chapters.map((_, index) => `chapter-${index + 1}.xhtml`);
  const navItems = publication.chapters.map((chapter, index) => `<li><a href="${chapterNames[index]}">${escapeXML(chapter.title)}</a></li>`).join("");
  const manifestItems = chapterNames.map((name, index) => `<item id="chapter-${index + 1}" href="${name}" media-type="application/xhtml+xml"/>`).join("");
  const spineItems = publication.chapters.map((_, index) => `<itemref idref="chapter-${index + 1}"/>`).join("");
  const files = {
    "mimetype": strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    "OEBPS/styles.css": strToU8("body{font-family:serif;line-height:1.55;margin:6%;color:#111}h1{line-height:1.1}h2{margin-top:1.5em;color:#075b83}img{display:block;max-width:100%;height:auto;margin:auto}.kicker{font-family:sans-serif;text-transform:uppercase;letter-spacing:.12em;color:#087cad}"),
    "OEBPS/nav.xhtml": strToU8(xhtmlDocument("Contents", `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems}</ol></nav>`, true)),
    "OEBPS/cover.xhtml": strToU8(xhtmlDocument(publication.title, `<img src="${escapeXML(coverName)}" alt="${escapeXML(publication.title)} cover"/>`)),
    [`OEBPS/${coverName}`]: coverBytes,
  };
  publication.chapters.forEach((chapter, index) => {
    files[`OEBPS/${chapterNames[index]}`] = strToU8(xhtmlDocument(chapter.title, `<p class="kicker">Chapter ${index + 1}</p><h1>${escapeXML(chapter.title)}</h1>${markdownToXHTML(chapter.content)}`));
  });
  files["OEBPS/content.opf"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${escapeXML(identifier)}</dc:identifier><dc:title>${escapeXML(publication.title)}</dc:title><dc:creator>${PUBLISHER}</dc:creator><dc:publisher>${PUBLISHER}</dc:publisher><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="styles.css" media-type="text/css"/><item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="cover-image" href="${escapeXML(coverName)}" media-type="${coverMime}" properties="cover-image"/>${manifestItems}</manifest><spine><itemref idref="cover-page"/>${spineItems}</spine></package>`);
  return zipSync(files, { level: 0 });
}

function normalizeProduct(product, publication) {
  const clean = JSON.parse(JSON.stringify(product || {}));
  clean.title = publication.title;
  clean.author = PUBLISHER;
  clean.publisher = PUBLISHER;
  clean.digitalAssetEdition = publication.digitalAssetEdition;
  return clean;
}

function buildResearchRecord(publication) {
  const research = publication.research || {};
  return {
    projectId: publication.projectId,
    title: publication.title,
    generatedAt: research.researchedAt || null,
    evidenceStandard: research.evidenceStandard || "Customer-supplied authoritative manuscript.",
    synthesis: research.synthesis || "",
    sources: research.sources || [],
    diagnostics: research.diagnostics || [],
    externalInferenceAPI: false,
    digitalAssetEdition: DIGITAL_ASSET_V2_LABEL,
    contractBuild: KAIROS_DIGITAL_ASSET_V2_BUILD,
    customerDocsBuild: KAIROS_DIGITAL_ASSET_V2_CUSTOMER_DOCS_BUILD,
  };
}

function markdownToXHTML(markdown) {
  return String(markdown || "").split(/\n{2,}/).map(block => {
    const value = block.trim();
    if (!value) return "";
    const heading = /^#{1,3}\s+(.+)$/s.exec(value);
    if (heading) return `<h2>${escapeXML(heading[1])}</h2>`;
    if (/^(?:[-*]\s+.+\n?)+$/m.test(value)) {
      const items = value.split("\n").map(line => line.replace(/^[-*]\s+/, "").trim()).filter(Boolean).map(line => `<li>${escapeXML(line)}</li>`).join("");
      return `<ul>${items}</ul>`;
    }
    return `<p>${escapeXML(value).replace(/\n/g, "<br/>")}</p>`;
  }).join("");
}

function xhtmlDocument(title, body, includeEpub = false) {
  return `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"${includeEpub ? ' xmlns:epub="http://www.idpf.org/2007/ops"' : ""}><head><title>${escapeXML(title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body>${body}</body></html>`;
}

function wrapPDF(text, font, size, maxWidth) {
  const words = cleanCustomerText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function cleanCustomerText(value) {
  return String(value == null ? "" : value)
    .replace(/Michael\s+King/gi, PUBLISHER)
    .replace(/\bKairos\b/gi, "the production system")
    .replace(/\bShopify\b/gi, "the customer platform")
    .replace(/^[\s\-–—:]+/, "")
    .replace(/[–—]/g, "-")
    .trim();
}

function approvedCoverName(cover) {
  return cover?.type === "image/jpeg" ? "approved-cover.jpg" : "approved-cover.png";
}

function jsonBytes(value) { return strToU8(JSON.stringify(value, null, 2)); }
function escapeXML(value) { return String(value == null ? "" : value).replace(/[<>&"']/g, character => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;" })[character]); }
function artifactError(code, message, status) { const error = new Error(message); error.code = code; error.status = status; return error; }
