import { strToU8, zipSync } from "fflate";
import { ARTIFACT_NAMES, artifactContentType, buildArtifact } from "./kairos-native-publishing-artifacts-v1.js";
import { PRODUCT_ASSET_NAMES, buildProductAssetSVG, buildShopifyProductHTML } from "./kairos-product-page-package-v1.js";
import {
  DIGITAL_ASSET_V2_LABEL,
  KAIROS_DIGITAL_ASSET_V2_BUILD,
  assertCustomerFacingText,
  buildCustomerREADME,
  buildCustomerSpecSheetPDF,
  buildPortraitCoverPNG,
  buildThumbnailCoverPNG,
  customerReleaseNames,
  normalizeDigitalAssetV2Publication,
} from "./kairos-digital-asset-edition-v2-contract-v1.js";

export const KAIROS_CREATION_ARTIFACTS_VERSION = "kairos-creation-artifacts-v2-customer-release";

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

  if (name === "customer-spec-sheet.pdf") return buildCustomerSpecSheetPDF(normalized);
  if (name === "kdp-interior-6x9.pdf") return buildArtifact("kdp-interior.pdf", normalized, options);
  if (name === "digital-asset-edition-v2.pdf") return buildArtifact("digital-asset.pdf", normalized, options);
  if (name === "cover-portrait-2048x3072.png") return buildPortraitCoverPNG(cover);
  if (name === "cover-thumbnail-2048x2048.png") return buildThumbnailCoverPNG(cover);
  if (name === "README.txt") return buildCustomerREADME(normalized);

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
  const files = {
    [names.specSheet]: await buildCustomerSpecSheetPDF(publication, names),
    [names.kdpInterior]: await buildArtifact("kdp-interior.pdf", publication),
    [names.digitalEdition]: await buildArtifact("digital-asset.pdf", publication, { coverBytes: cover?.bytes || null, coverMime: cover?.type || "image/png" }),
    [names.portraitCover]: buildPortraitCoverPNG(cover),
    [names.thumbnailCover]: buildThumbnailCoverPNG(cover),
    [names.readme]: buildCustomerREADME(publication, names),
  };

  if (Object.keys(files).length !== 6) throw artifactError("digital_asset_v2_package_count_invalid", "The customer release package must contain exactly six deliverables.", 500);
  assertCustomerFacingText(new TextDecoder().decode(files[names.readme]), "README");
  return zipSync(files, { level: 6 });
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
  files["OEBPS/content.opf"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${escapeXML(identifier)}</dc:identifier><dc:title>${escapeXML(publication.title)}</dc:title><dc:creator>Mindset Media Group™</dc:creator><dc:publisher>Mindset Media Group™</dc:publisher><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="styles.css" media-type="text/css"/><item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="cover-image" href="${escapeXML(coverName)}" media-type="${coverMime}" properties="cover-image"/>${manifestItems}</manifest><spine><itemref idref="cover-page"/>${spineItems}</spine></package>`);
  return zipSync(files, { level: 0 });
}

function normalizeProduct(product, publication) {
  const clean = JSON.parse(JSON.stringify(product || {}));
  clean.title = publication.title;
  clean.author = "Mindset Media Group™";
  clean.publisher = "Mindset Media Group™";
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

function approvedCoverName(cover) {
  return cover?.type === "image/jpeg" ? "approved-cover.jpg" : "approved-cover.png";
}

function jsonBytes(value) { return strToU8(JSON.stringify(value, null, 2)); }
function escapeXML(value) { return String(value == null ? "" : value).replace(/[<>&"']/g, character => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;" })[character]); }
function artifactError(code, message, status) { const error = new Error(message); error.code = code; error.status = status; return error; }
