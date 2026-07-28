import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { strToU8, zipSync } from "fflate";

export const KAIROS_REVENUE_DOCUMENT_RENDERER_BUILD = "kairos-revenue-document-renderer-20260727-1";

export async function renderKairosRevenueDocument(input = {}) {
  const format = clean(input.format, 20).toLowerCase();
  const title = clean(input.title || "Mindset Media Group Digital Asset", 240);
  const content = String(input.content || "").trim();
  if (!content) throw renderError("REVENUE_RENDER_CONTENT_REQUIRED", "Document content is required.");
  if (format === "pdf") return renderPDF(title, content);
  if (format === "docx") return renderDOCX(title, content);
  throw renderError("REVENUE_RENDER_FORMAT_UNSUPPORTED", "Use pdf or docx.");
}

export function assembleKairosRevenueZip(input = {}) {
  const files = Array.isArray(input.files) ? input.files : [];
  if (!files.length) throw renderError("REVENUE_PACKAGE_FILES_REQUIRED", "At least one package file is required.");
  const entries = {};
  for (const file of files.slice(0, 100)) {
    const filename = safeFilename(file.filename);
    if (!filename) throw renderError("REVENUE_PACKAGE_FILENAME_REQUIRED", "Every package file requires a filename.");
    entries[filename] = toBytes(file.content);
  }
  const bytes = zipSync(entries, { level: 6 });
  return Object.freeze({ filename: safeFilename(input.filename) || "kairos-revenue-package.zip", mimeType: "application/zip", bytes, byteSize: bytes.byteLength, checksum: fnv1aBytes(bytes), build: KAIROS_REVENUE_DOCUMENT_RENDERER_BUILD });
}

async function renderPDF(title, content) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines = wrap(content.replace(/\r/g, ""), 92);
  let page = pdf.addPage([612, 792]);
  let y = 744;
  page.drawText(title, { x: 54, y, size: 18, font: bold, color: rgb(0.04, 0.05, 0.07) });
  y -= 34;
  for (const line of lines) {
    if (y < 54) { page = pdf.addPage([612, 792]); y = 744; }
    page.drawText(line || " ", { x: 54, y, size: 10.5, font, color: rgb(0.08, 0.09, 0.11) });
    y -= 15;
  }
  const bytes = await pdf.save();
  return Object.freeze({ filename: `${slug(title)}.pdf`, mimeType: "application/pdf", bytes, byteSize: bytes.byteLength, checksum: fnv1aBytes(bytes), build: KAIROS_REVENUE_DOCUMENT_RENDERER_BUILD });
}

function renderDOCX(title, content) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${xml(title)}</w:t></w:r></w:p>${content.split(/\n+/).map(p => `<w:p><w:r><w:t xml:space="preserve">${xml(p)}</w:t></w:r></w:p>`).join("")}<w:sectPr/></w:body></w:document>`;
  const bytes = zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(documentXml),
  }, { level: 6 });
  return Object.freeze({ filename: `${slug(title)}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes, byteSize: bytes.byteLength, checksum: fnv1aBytes(bytes), build: KAIROS_REVENUE_DOCUMENT_RENDERER_BUILD });
}

function wrap(value, width) { const out=[]; for (const paragraph of String(value).split("\n")) { const words=paragraph.split(/\s+/).filter(Boolean); let line=""; for (const word of words) { const next=line?`${line} ${word}`:word; if(next.length>width&&line){out.push(line);line=word;}else line=next;} out.push(line); } return out; }
function toBytes(value) { if (value instanceof Uint8Array) return value; if (value instanceof ArrayBuffer) return new Uint8Array(value); return strToU8(String(value ?? "")); }
function xml(value) { return String(value).replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&apos;"})[c]); }
function safeFilename(value) { return clean(value, 240).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, ""); }
function slug(value) { return safeFilename(String(value).toLowerCase()) || "kairos-revenue-asset"; }
function fnv1aBytes(bytes) { let hash=2166136261; for (const byte of bytes) hash=Math.imul(hash^byte,16777619); return (hash>>>0).toString(16).padStart(8,"0"); }
function clean(value,max){return String(value||"").replace(/\u0000/g,"").trim().slice(0,max);}
function renderError(code,message,status=400){const error=new Error(message);error.code=code;error.status=status;return error;}
