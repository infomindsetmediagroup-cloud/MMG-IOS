import { strToU8, zipSync } from "fflate";
import { ARTIFACT_NAMES, artifactContentType, buildArtifact } from "./kairos-native-publishing-artifacts-v1.js";
import { PRODUCT_ASSET_NAMES, buildProductAssetSVG, buildShopifyProductHTML } from "./kairos-product-page-package-v1.js";

export const KAIROS_CREATION_ARTIFACTS_VERSION = "kairos-creation-artifacts-v1";

const CORE_ARTIFACTS = Object.freeze([
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
  return [...CORE_ARTIFACTS, approvedCoverName(cover), "complete-production-package.zip"];
}

export async function buildCreationArtifact(name, publication, product, cover = null) {
  const names = creationArtifactNames(cover);
  if (!names.includes(name) && ![...ARTIFACT_NAMES, "cover-preview.png", "cover-preview.jpg", "cover-preview.svg"].includes(name)) {
    throw artifactError("creation_artifact_not_found", "Unknown creation artifact.", 404);
  }

  const options = { coverBytes: cover?.bytes || null, coverMime: cover?.type || "image/png" };
  if (["gold-master.docx", "digital-asset.pdf", "kdp-interior.pdf", "kdp-full-wrap-cover.pdf", "production-package.zip", "ebook-cover.png", "cover-preview.png", "cover-preview.svg"].includes(name)) {
    return buildArtifact(name, publication, options);
  }
  if (name === "cover-preview.jpg" || name === approvedCoverName(cover)) return cover?.bytes || buildArtifact("ebook-cover.png", publication);
  if (name === "ebook.epub") return buildEPUB(publication, cover);
  if (name === "shopify-product-page.html") return strToU8(buildShopifyProductHTML(product));
  if (name === "product-package.json") return jsonBytes(product);
  if (name === "research-record.json") return jsonBytes(buildResearchRecord(publication));
  if (PRODUCT_ASSET_NAMES.includes(name)) return strToU8(buildProductAssetSVG(name, publication, product, approvedCoverName(cover)));
  if (name === "complete-production-package.zip") return buildCompletePackage(publication, product, cover);
  throw artifactError("creation_artifact_not_found", "Unknown creation artifact.", 404);
}

export function creationArtifactContentType(name) {
  if (name.endsWith(".epub")) return "application/epub+zip";
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return artifactContentType(name);
}

async function buildCompletePackage(publication, product, cover) {
  const files = {};
  for (const name of creationArtifactNames(cover).filter(entry => entry !== "complete-production-package.zip")) {
    files[name] = await buildCreationArtifact(name, publication, product, cover);
  }
  const manifest = {
    version: KAIROS_CREATION_ARTIFACTS_VERSION,
    engine: publication.engineVersion,
    projectId: publication.projectId,
    title: publication.title,
    author: publication.author,
    generatedAt: new Date().toISOString(),
    externalInferenceAPI: false,
    cover: { supplied: Boolean(cover?.bytes), filename: approvedCoverName(cover), type: cover?.type || "image/png" },
    files: Object.keys(files),
    publishingDecisionsRequired: ["final price", "ISBN assignment", "platform account submission"],
  };
  files["production-manifest.json"] = jsonBytes(manifest);
  files["README.txt"] = strToU8([
    publication.title,
    "",
    "Kairos Complete Creation Package",
    "",
    "This package contains the edited Gold Master, digital PDF, KDP interior and wrap files, EPUB, approved cover, Shopify product-page HTML, research record, structured product copy, and cover-derived product/social assets.",
    "",
    "Final price, ISBN assignment, and submission through the publisher's platform accounts remain controlled publishing decisions.",
    "Amazon KDP and Shopify perform their own final platform validation.",
  ].join("\n"));
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
  const spineItems = chapterNames.map((_, index) => `<itemref idref="chapter-${index + 1}"/>`).join("");
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
  files["OEBPS/content.opf"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${escapeXML(identifier)}</dc:identifier><dc:title>${escapeXML(publication.title)}</dc:title><dc:creator>${escapeXML(publication.author)}</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="styles.css" media-type="text/css"/><item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="cover-image" href="${escapeXML(coverName)}" media-type="${coverMime}" properties="cover-image"/>${manifestItems}</manifest><spine><itemref idref="cover-page"/>${spineItems}</spine></package>`);
  return zipSync(files, { level: 0 });
}

function buildResearchRecord(publication) {
  const research = publication.research || {};
  return {
    projectId: publication.projectId,
    title: publication.title,
    generatedAt: research.researchedAt || null,
    evidenceStandard: research.evidenceStandard || "Direct public records and clearly marked native synthesis.",
    synthesis: research.synthesis || "",
    sources: research.sources || [],
    diagnostics: research.diagnostics || [],
    externalInferenceAPI: false,
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
