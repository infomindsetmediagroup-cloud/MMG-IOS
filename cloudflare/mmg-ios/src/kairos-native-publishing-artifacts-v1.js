import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { strToU8, zipSync, zlibSync } from "fflate";

const POINTS_PER_INCH = 72;
const TRIM_WIDTH = 6 * POINTS_PER_INCH;
const TRIM_HEIGHT = 9 * POINTS_PER_INCH;
const DIGITAL_WIDTH = 8.5 * POINTS_PER_INCH;
const DIGITAL_HEIGHT = 11 * POINTS_PER_INCH;
const KDP_WHITE_PAPER_SPINE_PER_PAGE = 0.002252;

export const ARTIFACT_NAMES = Object.freeze([
  "gold-master.docx",
  "digital-asset.pdf",
  "kdp-interior.pdf",
  "kdp-full-wrap-cover.pdf",
  "ebook-cover.png",
  "production-package.zip",
]);

export async function buildArtifact(name, publication, options = {}) {
  const coverBytes = options.coverBytes || null;
  const coverMime = options.coverMime || "image/png";
  switch (name) {
    case "gold-master.docx": return buildGoldMasterDocx(publication);
    case "digital-asset.pdf": return buildDigitalPDF(publication, coverBytes, coverMime);
    case "kdp-interior.pdf": return buildInteriorPDF(publication);
    case "kdp-full-wrap-cover.pdf": return buildWrapCoverPDF(publication, coverBytes, coverMime);
    case "ebook-cover.png": return coverBytes && coverMime === "image/png" ? coverBytes : buildCoverPNG(publication);
    case "cover-preview.png": return coverBytes && coverMime === "image/png" ? coverBytes : buildCoverPNG(publication);
    case "cover-preview.svg": return strToU8(buildCoverSVG(publication));
    case "production-package.zip": return buildProductionZip(publication, { coverBytes, coverMime });
    default: throw Object.assign(new Error("Unknown publication artifact."), { status: 404, code: "artifact_not_found" });
  }
}

export function artifactContentType(name) {
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (name.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

export function buildCoverSVG(publication) {
  const palette = coverPalette(publication);
  const title = escapeXML(publication.title || "Untitled Publication");
  const subtitle = escapeXML(publication.subtitle || "");
  const author = escapeXML(publication.author || "Michael King");
  const titleLines = wrapWords(publication.title || "Untitled Publication", 20).slice(0, 5);
  const titleMarkup = titleLines.map((line, index) => `<text x="96" y="${410 + index * 92}" class="title">${escapeXML(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="2700" viewBox="0 0 1200 1800" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title><desc id="desc">Book cover preview for ${title}</desc>
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hex(palette.base)}"/><stop offset="0.55" stop-color="${hex(palette.middle)}"/><stop offset="1" stop-color="${hex(palette.edge)}"/></linearGradient><radialGradient id="glow"><stop offset="0" stop-color="${hex(palette.glow)}" stop-opacity=".6"/><stop offset="1" stop-color="${hex(palette.glow)}" stop-opacity="0"/></radialGradient></defs>
  <rect width="1200" height="1800" fill="url(#bg)"/><circle cx="1040" cy="340" r="520" fill="url(#glow)"/><path d="M0 1460 L1200 940 L1200 1800 L0 1800Z" fill="${hex(palette.base)}" opacity=".72"/><path d="M72 72 H1128 V1728 H72Z" fill="none" stroke="${hex(palette.accent)}" stroke-width="3" opacity=".62"/>
  <text x="96" y="170" class="kicker">MINDSET MEDIA GROUP™</text>${titleMarkup}
  <text x="96" y="${890 + titleLines.length * 32}" class="subtitle">${subtitle}</text><line x1="96" x2="420" y1="1490" y2="1490" stroke="${hex(palette.accent)}" stroke-width="8"/><text x="96" y="1580" class="author">${author}</text>
  <style>.kicker{fill:${hex(palette.light)};font:700 30px Arial,sans-serif;letter-spacing:7px}.title{fill:white;font:800 78px Arial,sans-serif;letter-spacing:-2px}.subtitle{fill:#d8e2e8;font:400 31px Arial,sans-serif}.author{fill:white;font:700 34px Arial,sans-serif;letter-spacing:5px}</style></svg>`;
}

async function buildInteriorPDF(publication) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const marginInner = 68;
  const marginOuter = 54;
  const marginTop = 58;
  const marginBottom = 54;
  const fontSize = 10.2;
  const lineHeight = 14.6;
  let pageNumber = 0;

  const newPage = () => {
    const page = pdf.addPage([TRIM_WIDTH, TRIM_HEIGHT]);
    pageNumber += 1;
    return { page, y: TRIM_HEIGHT - marginTop, left: pageNumber % 2 === 0 ? marginOuter : marginInner, right: pageNumber % 2 === 0 ? marginInner : marginOuter };
  };

  let cursor = newPage();
  cursor.page.drawText(publication.title, { x: cursor.left, y: 410, size: 22, font: bold, color: rgb(0.02, 0.08, 0.13), maxWidth: TRIM_WIDTH - cursor.left - cursor.right });
  if (publication.subtitle) cursor.page.drawText(publication.subtitle, { x: cursor.left, y: 360, size: 12, font: italic, color: rgb(0.15, 0.25, 0.32), maxWidth: TRIM_WIDTH - cursor.left - cursor.right });
  cursor.page.drawText(publication.author, { x: cursor.left, y: 205, size: 13, font: bold });
  cursor.page.drawText("Mindset Media Group™", { x: cursor.left, y: 176, size: 10, font: regular });

  cursor = newPage();
  const copyright = `Copyright © ${new Date().getUTCFullYear()} ${publication.author}. All rights reserved. Published by Mindset Media Group™.`;
  cursor.y = drawParagraph(cursor, copyright, regular, 9.5, 14, marginBottom);
  cursor.y -= 18;
  cursor.y = drawParagraph(cursor, "This publication is educational and informational. Readers are responsible for evaluating how the material applies to their circumstances.", regular, 9.5, 14, marginBottom);

  cursor = newPage();
  cursor.page.drawText("Contents", { x: cursor.left, y: cursor.y, size: 20, font: bold });
  cursor.y -= 38;
  for (const [index, chapter] of publication.chapters.entries()) {
    cursor.page.drawText(`${index + 1}. ${chapter.title}`, { x: cursor.left, y: cursor.y, size: 10.5, font: regular, maxWidth: TRIM_WIDTH - cursor.left - cursor.right });
    cursor.y -= 22;
    if (cursor.y < marginBottom + 30) cursor = newPage();
  }

  for (const [chapterIndex, chapter] of publication.chapters.entries()) {
    cursor = newPage();
    cursor.page.drawText(`CHAPTER ${chapterIndex + 1}`, { x: cursor.left, y: cursor.y, size: 9, font: bold, color: rgb(0.05, 0.46, 0.72) });
    cursor.y -= 34;
    const titleLines = wrapText(chapter.title, bold, 20, TRIM_WIDTH - cursor.left - cursor.right);
    for (const line of titleLines) {
      cursor.page.drawText(line, { x: cursor.left, y: cursor.y, size: 20, font: bold, color: rgb(0.02, 0.08, 0.13) });
      cursor.y -= 26;
    }
    cursor.y -= 20;
    for (const block of parseBlocks(chapter.content)) {
      if (block.kind === "heading") {
        if (cursor.y < marginBottom + 56) cursor = newPage();
        cursor.y -= 8;
        cursor.page.drawText(block.text, { x: cursor.left, y: cursor.y, size: 12.5, font: bold, color: rgb(0.03, 0.29, 0.46), maxWidth: TRIM_WIDTH - cursor.left - cursor.right });
        cursor.y -= 24;
      } else {
        const width = TRIM_WIDTH - cursor.left - cursor.right;
        const lines = wrapText(block.text, regular, fontSize, width);
        for (const line of lines) {
          if (cursor.y < marginBottom + 24) cursor = newPage();
          cursor.page.drawText(line, { x: cursor.left, y: cursor.y, size: fontSize, font: regular, color: rgb(0.07, 0.07, 0.07) });
          cursor.y -= lineHeight;
        }
        cursor.y -= 9;
      }
    }
  }

  if (pdf.getPageCount() % 2 !== 0) pdf.addPage([TRIM_WIDTH, TRIM_HEIGHT]);
  for (let index = 0; index < pdf.getPageCount(); index += 1) {
    const page = pdf.getPage(index);
    page.drawText(String(index + 1), { x: TRIM_WIDTH / 2 - 4, y: 28, size: 8.5, font: regular, color: rgb(0.35, 0.35, 0.35) });
  }
  pdf.setTitle(publication.title);
  pdf.setAuthor(publication.author);
  pdf.setCreator("Kairos Native Intelligence Engine");
  pdf.setProducer("Mindset Media Group™");
  return pdf.save();
}

async function buildDigitalPDF(publication, coverBytes, coverMime = "image/png") {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const first = pdf.addPage([DIGITAL_WIDTH, DIGITAL_HEIGHT]);
  const cover = await embedCoverImage(pdf, coverBytes || buildCoverPNG(publication), coverBytes ? coverMime : "image/png");
  const coverWidth = DIGITAL_HEIGHT * (2 / 3);
  first.drawRectangle({ x: 0, y: 0, width: DIGITAL_WIDTH, height: DIGITAL_HEIGHT, color: rgb(0.01, 0.03, 0.05) });
  first.drawImage(cover, { x: (DIGITAL_WIDTH - coverWidth) / 2, y: 0, width: coverWidth, height: DIGITAL_HEIGHT });
  let pageNumber = 1;
  const margin = 58;
  const newPage = () => ({ page: pdf.addPage([DIGITAL_WIDTH, DIGITAL_HEIGHT]), y: DIGITAL_HEIGHT - 60, left: margin, right: margin });
  for (const [chapterIndex, chapter] of publication.chapters.entries()) {
    let cursor = newPage();
    pageNumber += 1;
    cursor.page.drawText(`CHAPTER ${chapterIndex + 1}`, { x: margin, y: cursor.y, size: 9, font: bold, color: rgb(0.03, 0.55, 0.82) });
    cursor.y -= 32;
    cursor.page.drawText(chapter.title, { x: margin, y: cursor.y, size: 22, font: bold, color: rgb(0.02, 0.08, 0.13), maxWidth: DIGITAL_WIDTH - margin * 2 });
    cursor.y -= 42;
    for (const block of parseBlocks(chapter.content)) {
      if (block.kind === "heading") {
        if (cursor.y < 85) { cursor = newPage(); pageNumber += 1; }
        cursor.page.drawText(block.text, { x: margin, y: cursor.y, size: 13, font: bold, color: rgb(0.02, 0.36, 0.58) });
        cursor.y -= 26;
      } else {
        for (const line of wrapText(block.text, regular, 10.5, DIGITAL_WIDTH - margin * 2)) {
          if (cursor.y < 70) { cursor = newPage(); pageNumber += 1; }
          cursor.page.drawText(line, { x: margin, y: cursor.y, size: 10.5, font: regular, color: rgb(0.08, 0.09, 0.11) });
          cursor.y -= 15;
        }
        cursor.y -= 9;
      }
    }
  }
  pdf.setTitle(`${publication.title} — Digital Edition`);
  pdf.setAuthor(publication.author);
  pdf.setCreator("Kairos Native Intelligence Engine");
  return pdf.save();
}

async function buildWrapCoverPDF(publication, coverBytes, coverMime = "image/png") {
  const palette = coverPalette(publication);
  const pageCount = publication.pageCount || estimatePageCount(publication.wordCount);
  const spineInches = Math.max(0.06, pageCount * KDP_WHITE_PAPER_SPINE_PER_PAGE);
  const width = (12.25 + spineInches) * POINTS_PER_INCH;
  const height = 9.25 * POINTS_PER_INCH;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([width, height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bleed = 0.125 * POINTS_PER_INCH;
  const backWidth = 6 * POINTS_PER_INCH;
  const spineWidth = spineInches * POINTS_PER_INCH;
  const frontX = bleed + backWidth + spineWidth;
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb8(palette.base) });
  page.drawRectangle({ x: frontX, y: 0, width: 6.125 * POINTS_PER_INCH, height, color: rgb8(palette.edge) });
  page.drawRectangle({ x: bleed + backWidth, y: 0, width: spineWidth, height, color: rgb8(palette.accent) });
  const cover = await embedCoverImage(pdf, coverBytes || buildCoverPNG(publication), coverBytes ? coverMime : "image/png");
  page.drawImage(cover, { x: frontX, y: bleed, width: 6 * POINTS_PER_INCH, height: 9 * POINTS_PER_INCH });
  const backCopy = publication.backCoverCopy || `A practical, structured guide to ${publication.topic}. Build clarity, convert insight into action, and create durable progress through a repeatable system.`;
  let y = height - 88;
  page.drawText(publication.title, { x: 42, y, size: 15, font: bold, color: rgb8(palette.light), maxWidth: backWidth - 70 });
  y -= 44;
  for (const line of wrapText(backCopy, regular, 10, backWidth - 74)) {
    page.drawText(line, { x: 42, y, size: 10, font: regular, color: rgb(0.9, 0.94, 0.97) });
    y -= 15;
  }
  page.drawText("Mindset Media Group™", { x: 42, y: 40, size: 9, font: bold, color: rgb8(palette.light) });
  if (spineWidth >= 24) {
    page.drawText(publication.title.slice(0, 55), { x: bleed + backWidth + spineWidth / 2 - 5, y: 92, size: Math.min(11, spineWidth * 0.42), font: bold, rotate: degrees(90), color: rgb(1, 1, 1), maxWidth: height - 160 });
  }
  page.drawRectangle({ x: 0, y: 0, width, height, borderColor: rgb8(palette.accent), borderWidth: 0.75 });
  pdf.setTitle(`${publication.title} — KDP Full-Wrap Cover`);
  pdf.setAuthor(publication.author);
  return pdf.save();
}

async function buildGoldMasterDocx(publication) {
  const body = [];
  body.push(docxParagraph(publication.title, "Title"));
  if (publication.subtitle) body.push(docxParagraph(publication.subtitle, "Subtitle"));
  body.push(docxParagraph(publication.author, "Author"));
  body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
  body.push(docxParagraph("Copyright", "Heading1"));
  body.push(docxParagraph(`Copyright © ${new Date().getUTCFullYear()} ${publication.author}. All rights reserved. Published by Mindset Media Group™.`));
  body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
  body.push(docxParagraph("Contents", "Heading1"));
  publication.chapters.forEach((chapter, index) => body.push(docxParagraph(`${index + 1}. ${chapter.title}`)));
  for (const [index, chapter] of publication.chapters.entries()) {
    body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    body.push(docxParagraph(`Chapter ${index + 1}`, "Heading2"));
    body.push(docxParagraph(chapter.title, "Heading1"));
    for (const block of parseBlocks(chapter.content)) body.push(docxParagraph(block.text, block.kind === "heading" ? "Heading2" : undefined));
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="8640" w:h="12960"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="900" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    "word/document.xml": strToU8(document),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "word/styles.xml": strToU8(docxStyles()),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>${escapeXML(publication.title)}</dc:title><dc:creator>${escapeXML(publication.author)}</dc:creator><dc:subject>MMG Gold Master</dc:subject></cp:coreProperties>`),
  };
  return zipSync(files, { level: 6 });
}

async function buildProductionZip(publication, options = {}) {
  const suppliedCover = options.coverBytes || null;
  const coverMime = options.coverMime || "image/png";
  const cover = suppliedCover || buildCoverPNG(publication);
  const coverExtension = suppliedCover && coverMime === "image/jpeg" ? "jpg" : "png";
  const docx = await buildGoldMasterDocx(publication);
  const digital = await buildDigitalPDF(publication, cover, suppliedCover ? coverMime : "image/png");
  const interior = await buildInteriorPDF(publication);
  const wrap = await buildWrapCoverPDF(publication, cover, suppliedCover ? coverMime : "image/png");
  const manifest = {
    engine: "Kairos Native Intelligence Engine",
    engineVersion: publication.engineVersion,
    projectId: publication.projectId,
    title: publication.title,
    author: publication.author,
    wordCount: publication.wordCount,
    pageCount: publication.pageCount,
    generatedAt: new Date().toISOString(),
    approval: publication.approval,
    intelligence: publication.intelligence || { mode: "deterministic-fallback", externalProvider: false },
    coverBrief: publication.coverBrief || null,
    files: ARTIFACT_NAMES.filter(name => name !== "production-package.zip"),
  };
  const readme = `${publication.title}\n\nKairos Native Publishing Production Package\n\nContents:\n- Gold Master DOCX\n- MMG Digital Asset PDF\n- KDP 6x9 Interior PDF\n- KDP Full-Wrap Cover PDF\n- Standalone eBook Cover PNG\n- Production manifest\n\nAmazon KDP performs final platform acceptance. Review the supplied preview and specifications before upload.\n`;
  return zipSync({
    [`${safeFilename(publication.title)}-Gold-Master.docx`]: docx,
    [`${safeFilename(publication.title)}-Digital-Asset.pdf`]: digital,
    [`${safeFilename(publication.title)}-KDP-Interior.pdf`]: interior,
    [`${safeFilename(publication.title)}-KDP-Full-Wrap-Cover.pdf`]: wrap,
    [`${safeFilename(publication.title)}-${coverExtension === "png" ? "eBook-Cover" : "Approved-Cover"}.${coverExtension}`]: cover,
    "README.txt": strToU8(readme),
    "production-manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
  }, { level: 6 });
}

async function embedCoverImage(pdf, bytes, mime) {
  if (mime === "image/jpeg") return pdf.embedJpg(bytes);
  return pdf.embedPng(bytes);
}

function buildCoverPNG(publication) {
  const palette = coverPalette(publication);
  const width = 1800;
  const height = 2700;
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const index = row + 1 + x * 3;
      const glow = Math.max(0, 1 - Math.hypot(x - 1520, y - 420) / 1000);
      const diagonal = Math.max(0, Math.min(1, (x + y * 0.34) / 2200));
      raw[index] = channel(palette.base[0], palette.edge[0], palette.glow[0], diagonal, glow);
      raw[index + 1] = channel(palette.base[1], palette.edge[1], palette.glow[1], diagonal, glow);
      raw[index + 2] = channel(palette.base[2], palette.edge[2], palette.glow[2], diagonal, glow);
    }
  }
  drawRect(raw, width, height, 90, 90, width - 180, 5, palette.accent);
  drawRect(raw, width, height, 90, height - 95, width - 180, 5, palette.accent);
  drawRect(raw, width, height, 90, 90, 5, height - 180, palette.accent);
  drawRect(raw, width, height, width - 95, 90, 5, height - 180, palette.accent);
  drawBitmapText(raw, width, height, "MINDSET MEDIA GROUP", 150, 210, 8, palette.light, 4);
  const titleLines = wrapWords(String(publication.title || "UNTITLED PUBLICATION").toUpperCase(), 14).slice(0, 6);
  titleLines.forEach((line, index) => drawBitmapText(raw, width, height, line, 150, 590 + index * 165, 19, [248, 251, 255], 8));
  if (publication.subtitle) wrapWords(String(publication.subtitle).toUpperCase(), 29).slice(0, 4).forEach((line, index) => drawBitmapText(raw, width, height, line, 150, 1770 + index * 76, 8, [197, 222, 238], 4));
  drawRect(raw, width, height, 150, 2370, 460, 14, palette.accent);
  drawBitmapText(raw, width, height, String(publication.author || "MICHAEL KING").toUpperCase(), 150, 2460, 10, [255, 255, 255], 5);
  const compressed = zlibSync(raw, { level: 5 });
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width); writeU32(ihdr, 4, height); ihdr[8] = 8; ihdr[9] = 2;
  return concatBytes(signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", compressed), pngChunk("IEND", new Uint8Array()));
}

function drawVectorCover(page, publication, x, y, width, height, bold, regular) {
  const palette = coverPalette(publication);
  page.drawRectangle({ x, y, width, height, color: rgb8(palette.base) });
  page.drawRectangle({ x: x + width * 0.73, y, width: width * 0.27, height, color: rgb8(palette.edge), opacity: 0.82 });
  page.drawRectangle({ x: x + 28, y: y + 28, width: width - 56, height: height - 56, borderColor: rgb8(palette.accent), borderWidth: 1.2 });
  page.drawText("MINDSET MEDIA GROUP™", { x: x + 42, y: y + height - 72, size: 9, font: bold, color: rgb8(palette.light) });
  let titleY = y + height - 180;
  for (const line of wrapText(publication.title, bold, 25, width - 92).slice(0, 6)) {
    page.drawText(line, { x: x + 42, y: titleY, size: 25, font: bold, color: rgb(1, 1, 1) });
    titleY -= 34;
  }
  if (publication.subtitle) page.drawText(publication.subtitle, { x: x + 42, y: Math.max(y + 170, titleY - 24), size: 10.5, font: regular, color: rgb(0.78, 0.88, 0.94), maxWidth: width - 92 });
  page.drawRectangle({ x: x + 42, y: y + 88, width: 115, height: 4, color: rgb8(palette.accent) });
  page.drawText(publication.author, { x: x + 42, y: y + 56, size: 11, font: bold, color: rgb(1, 1, 1) });
}

function coverPalette(publication) {
  const direction = `${publication?.title || ""} ${publication?.coverBrief?.content || ""}`.toLowerCase();
  if (/\b(amber|gold|orange|copper|warm)\b/.test(direction)) return { base: [17, 9, 4], middle: [53, 24, 8], edge: [137, 60, 10], glow: [238, 146, 50], accent: [238, 139, 39], light: [255, 211, 139] };
  if (/\b(violet|purple|magenta|plum)\b/.test(direction)) return { base: [10, 5, 18], middle: [31, 14, 55], edge: [83, 34, 128], glow: [187, 95, 238], accent: [174, 92, 230], light: [225, 185, 255] };
  if (/\b(emerald|green|jade|forest)\b/.test(direction)) return { base: [3, 13, 10], middle: [8, 39, 29], edge: [10, 101, 72], glow: [60, 214, 154], accent: [42, 195, 137], light: [156, 244, 207] };
  if (/\b(red|crimson|scarlet|coral)\b/.test(direction)) return { base: [17, 5, 7], middle: [51, 12, 17], edge: [131, 27, 38], glow: [239, 83, 91], accent: [225, 67, 79], light: [255, 180, 184] };
  return { base: [3, 9, 15], middle: [7, 24, 39], edge: [13, 100, 165], glow: [54, 189, 245], accent: [40, 177, 235], light: [120, 216, 255] };
}

function channel(base, edge, glowColor, diagonal, glow) { return Math.max(0, Math.min(255, Math.round(base + (edge - base) * diagonal * 0.52 + (glowColor - base) * glow * 0.56))); }
function rgb8(color) { return rgb(color[0] / 255, color[1] / 255, color[2] / 255); }
function hex(color) { return `#${color.map(channelValue => channelValue.toString(16).padStart(2, "0")).join("")}`; }

function drawParagraph(cursor, text, font, size, lineHeight, marginBottom) {
  for (const line of wrapText(text, font, size, TRIM_WIDTH - cursor.left - cursor.right)) {
    if (cursor.y < marginBottom + lineHeight) break;
    cursor.page.drawText(line, { x: cursor.left, y: cursor.y, size, font });
    cursor.y -= lineHeight;
  }
  return cursor.y;
}

function parseBlocks(content) {
  const blocks = [];
  const lines = String(content || "").split(/\n+/).map(line => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) blocks.push({ kind: "heading", text: line.replace(/^#{1,3}\s+/, "") });
    else blocks.push({ kind: "paragraph", text: line.replace(/^[-*]\s+/, "• ") });
  }
  return blocks;
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function wrapWords(text, maxChars) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function docxParagraph(text, style) {
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${escapeXML(text)}</w:t></w:r></w:p>`;
}

function docxStyles() {
  return `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="22"/></w:rPr><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Author"><w:name w:val="Author"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="086DA1"/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="1596C7"/><w:sz w:val="25"/></w:rPr></w:style></w:styles>`;
}

function drawRect(raw, width, height, x, y, w, h, color) {
  const x0 = Math.max(0, Math.floor(x)); const x1 = Math.min(width, Math.ceil(x + w));
  const y0 = Math.max(0, Math.floor(y)); const y1 = Math.min(height, Math.ceil(y + h));
  const stride = width * 3 + 1;
  for (let py = y0; py < y1; py += 1) for (let px = x0; px < x1; px += 1) {
    const index = py * stride + 1 + px * 3; raw[index] = color[0]; raw[index + 1] = color[1]; raw[index + 2] = color[2];
  }
}

const FONT_5X7 = {
  A:["01110","10001","10001","11111","10001","10001","10001"],B:["11110","10001","10001","11110","10001","10001","11110"],C:["01111","10000","10000","10000","10000","10000","01111"],D:["11110","10001","10001","10001","10001","10001","11110"],E:["11111","10000","10000","11110","10000","10000","11111"],F:["11111","10000","10000","11110","10000","10000","10000"],G:["01111","10000","10000","10111","10001","10001","01111"],H:["10001","10001","10001","11111","10001","10001","10001"],I:["11111","00100","00100","00100","00100","00100","11111"],J:["00111","00010","00010","00010","10010","10010","01100"],K:["10001","10010","10100","11000","10100","10010","10001"],L:["10000","10000","10000","10000","10000","10000","11111"],M:["10001","11011","10101","10101","10001","10001","10001"],N:["10001","11001","10101","10011","10001","10001","10001"],O:["01110","10001","10001","10001","10001","10001","01110"],P:["11110","10001","10001","11110","10000","10000","10000"],Q:["01110","10001","10001","10001","10101","10010","01101"],R:["11110","10001","10001","11110","10100","10010","10001"],S:["01111","10000","10000","01110","00001","00001","11110"],T:["11111","00100","00100","00100","00100","00100","00100"],U:["10001","10001","10001","10001","10001","10001","01110"],V:["10001","10001","10001","10001","10001","01010","00100"],W:["10001","10001","10001","10101","10101","10101","01010"],X:["10001","10001","01010","00100","01010","10001","10001"],Y:["10001","10001","01010","00100","00100","00100","00100"],Z:["11111","00001","00010","00100","01000","10000","11111"],
  "0":["01110","10001","10011","10101","11001","10001","01110"],"1":["00100","01100","00100","00100","00100","00100","01110"],"2":["01110","10001","00001","00010","00100","01000","11111"],"3":["11110","00001","00001","01110","00001","00001","11110"],"4":["00010","00110","01010","10010","11111","00010","00010"],"5":["11111","10000","10000","11110","00001","00001","11110"],"6":["01110","10000","10000","11110","10001","10001","01110"],"7":["11111","00001","00010","00100","01000","01000","01000"],"8":["01110","10001","10001","01110","10001","10001","01110"],"9":["01110","10001","10001","01111","00001","00001","01110"],
  " ":["00000","00000","00000","00000","00000","00000","00000"],"-":["00000","00000","00000","11111","00000","00000","00000"],".":["00000","00000","00000","00000","00000","00110","00110"],"&":["01100","10010","10100","01000","10101","10010","01101"],":":["00000","00110","00110","00000","00110","00110","00000"],"' ":["00100","00100","00000","00000","00000","00000","00000"]
};

function drawBitmapText(raw, width, height, text, x, y, scale, color, spacing) {
  let cursor = x;
  for (const character of text) {
    const glyph = FONT_5X7[character] || FONT_5X7[" "];
    for (let row = 0; row < 7; row += 1) for (let column = 0; column < 5; column += 1) if (glyph[row][column] === "1") drawRect(raw, width, height, cursor + column * scale, y + row * scale, scale, scale, color);
    cursor += 5 * scale + spacing;
  }
}

function pngChunk(type, data) {
  const typeBytes = strToU8(type); const output = new Uint8Array(12 + data.length);
  writeU32(output, 0, data.length); output.set(typeBytes, 4); output.set(data, 8); writeU32(output, 8 + data.length, crc32(concatBytes(typeBytes, data))); return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU32(target, offset, value) { target[offset] = value >>> 24; target[offset + 1] = value >>> 16; target[offset + 2] = value >>> 8; target[offset + 3] = value; }
function concatBytes(...arrays) { const output = new Uint8Array(arrays.reduce((sum, value) => sum + value.length, 0)); let offset = 0; for (const value of arrays) { output.set(value, offset); offset += value.length; } return output; }
function escapeXML(value) { return String(value ?? "").replace(/[<>&"']/g, character => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;" })[character]); }
function safeFilename(value) { return String(value || "publication").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "publication"; }
function estimatePageCount(wordCount) { const estimated = Math.max(24, Math.ceil(Number(wordCount || 0) / 250)); return estimated % 2 === 0 ? estimated : estimated + 1; }
