export const KAIROS_MANUSCRIPT_DELIVERABLES_BUILDER_BUILD =
  "kairos-manuscript-deliverables-builder-20260805-3-locked-five-asset-package";

export const PACKAGE_CONTRACT = "mmg-locked-five-asset-kdp-delivery-package-v1";

export const REQUIRED_DELIVERABLE_KINDS = [
  "GOLD_MASTER_DOCX",
  "DIGITAL_ASSET_PDF",
  "KDP_INTERIOR_PDF",
  "KDP_FULL_WRAP_COVER_PDF",
  "STANDALONE_COVER_IMAGE",
];

const BUILD_KEY_PREFIX = "manuscript-deliverables-build:";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";
const TRIM_WIDTH_IN = 6;
const TRIM_HEIGHT_IN = 9;
const BLEED_IN = 0.125;
const KDP_WHITE_PAPER_SPINE_PER_PAGE_IN = 0.002252;

export async function runManuscriptDeliverablesBuild(state, projectId, handlers) {
  if (!projectId) throw fail(400, "project_id_required", "A manuscript project id is required.");

  const project = await resolveProject(state, projectId, handlers);
  if (!project.cover) {
    throw fail(409, "uploaded_cover_required", "The saved customer cover is required before final deliverables can be manufactured.");
  }

  const title = project.setup?.publicationTitle || project.source?.title || "Untitled Manuscript";
  const author = project.setup?.authorName || "Unknown Author";
  const manuscript = String(project.manuscript || "").trim();
  if (manuscript.length < 50) {
    throw fail(409, "final_manuscript_required", "The approved final manuscript is incomplete.");
  }

  const stem = filenameStem(title);
  const coverExtension = project.cover.contentType === "image/jpeg" ? "jpg" : "png";
  const coverImage = await decodeCoverImage(project.cover.bytes, project.cover.contentType);
  const interiorLayout = layoutInterior(title, author, manuscript);

  const filenames = {
    goldMaster: `${stem}_Gold_Master.docx`,
    digitalAsset: `${stem}_Digital_Asset.pdf`,
    interior: `${stem}_Interior.pdf`,
    fullWrap: `${stem}_Full_Wrap.pdf`,
    cover: `${stem}_Cover.${coverExtension}`,
    zip: `${stem}_Complete_Delivery_Package.zip`,
  };

  const goldMasterDocx = buildGoldMasterDocx(title, author, manuscript);
  const interiorPdf = await buildInteriorPdf(interiorLayout);
  const digitalAssetPdf = await buildDigitalAssetPdf(interiorLayout, coverImage);
  const fullWrapPdf = await buildFullWrapPdf({
    title,
    author,
    pageCount: interiorLayout.pages.length,
    coverImage,
  });

  const packageFiles = [
    { kind: "GOLD_MASTER_DOCX", filename: filenames.goldMaster, mimeType: DOCX_MIME, data: goldMasterDocx, role: "Editable Gold Master manuscript" },
    { kind: "DIGITAL_ASSET_PDF", filename: filenames.digitalAsset, mimeType: PDF_MIME, data: digitalAssetPdf, role: "Customer-facing digital edition with the saved cover" },
    { kind: "KDP_INTERIOR_PDF", filename: filenames.interior, mimeType: PDF_MIME, data: interiorPdf, role: "KDP-ready 6 x 9 inch interior" },
    { kind: "KDP_FULL_WRAP_COVER_PDF", filename: filenames.fullWrap, mimeType: PDF_MIME, data: fullWrapPdf, role: "KDP paperback full-wrap cover using the saved cover image" },
    { kind: "STANDALONE_COVER_IMAGE", filename: filenames.cover, mimeType: project.cover.contentType, data: project.cover.bytes, role: "Exact saved customer cover image" },
  ];

  const zipBytes = writeZip(packageFiles.map(({ filename, data }) => ({ filename, data })));
  const createdAt = new Date().toISOString();
  const artifacts = [];
  for (const item of packageFiles) artifacts.push(await artifact(projectId, createdAt, item));
  artifacts.push(await artifact(projectId, createdAt, {
    kind: "ZIP_ARCHIVE",
    filename: filenames.zip,
    mimeType: "application/zip",
    data: zipBytes,
    role: "Complete locked five-file customer delivery package",
  }));

  const build = {
    id: `mb_${crypto.randomUUID()}`,
    projectId,
    status: "COMPLETED",
    artifacts,
    metadata: {
      workingTitle: title,
      author,
      service: project.setup?.service || "Publishing Service",
      trimSize: project.setup?.trimSize || "6x9",
      wordCount: countWords(manuscript),
      pageCount: interiorLayout.pages.length,
      packageContract: PACKAGE_CONTRACT,
      packageFileCount: 5,
      packageContentsVerified: validatePackageFiles(packageFiles),
      uploadedCoverIncluded: true,
      coverUsedInDigitalAsset: true,
      coverUsedInFullWrap: true,
      goldMasterFormat: "DOCX",
      kdpInteriorFormat: "PDF",
      kdpFullWrapFormat: "PDF",
      originalCoverChecksum: await sha256Hex(project.cover.bytes),
      sourceFilename: project.source?.filename || null,
      manuscriptAuthority: project.manuscriptAuthority || "stored-intake-source",
      liveShopifyMutationAuthorized: false,
    },
    createdAt,
    updatedAt: createdAt,
    errorMessage: null,
  };

  await state.storage.put(`${BUILD_KEY_PREFIX}${projectId}`, build);
  await state.storage.put(`${BUILD_KEY_PREFIX}${projectId}:zip`, zipBytes);
  return { build, files: Object.fromEntries(packageFiles.map((item) => [item.filename, item.data])), zipFilename: filenames.zip };
}

export async function getStoredManuscriptDeliverablesBuild(state, projectId) {
  return state.storage.get(`${BUILD_KEY_PREFIX}${projectId}`);
}

export async function getStoredManuscriptDeliverablesZip(state, projectId) {
  return state.storage.get(`${BUILD_KEY_PREFIX}${projectId}:zip`);
}

export function validateBuildArtifacts(build) {
  const present = new Set((build?.artifacts || []).map((item) => item.kind));
  const missing = REQUIRED_DELIVERABLE_KINDS.filter((kind) => !present.has(kind));
  if (!present.has("ZIP_ARCHIVE")) missing.push("ZIP_ARCHIVE");
  return { ok: missing.length === 0, missing };
}

async function resolveProject(state, projectId, handlers) {
  const sourceHandler = handlers?.handleManuscriptSourceObjectRequest;
  const setupHandler = handlers?.handleManuscriptProjectSetupObjectRequest;
  if (typeof sourceHandler !== "function" || typeof setupHandler !== "function") {
    throw fail(500, "deliverable_handlers_unavailable", "The manuscript source and setup handlers are required.");
  }

  const metadataResponse = await sourceHandler(state, new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source`));
  const metadataBody = await readJson(metadataResponse);
  if (!metadataResponse?.ok || !metadataBody?.source) {
    throw fail(404, "manuscript_source_required", "The saved manuscript source was not found.");
  }

  const textResponse = await sourceHandler(state, new Request(`https://kairos.internal/registry/manuscripts/${projectId}/source/text`));
  const textBody = await readJson(textResponse);
  if (!textResponse?.ok) {
    throw fail(textResponse?.status || 502, "final_manuscript_unavailable", textBody?.error?.message || "The final manuscript could not be loaded.");
  }

  const setupResponse = await setupHandler(state, new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup`));
  const setupBody = await readJson(setupResponse);
  if (!setupResponse?.ok || !setupBody?.setup) {
    throw fail(409, "manuscript_setup_required", "Project setup must be completed before final manufacturing.");
  }

  const coverResponse = await setupHandler(state, new Request(`https://kairos.internal/registry/manuscripts/${projectId}/setup/cover`));
  const cover = coverResponse?.ok
    ? {
        bytes: new Uint8Array(await coverResponse.arrayBuffer()),
        contentType: normalizeCoverMime(coverResponse.headers.get("Content-Type")),
        filename: dispositionFilename(coverResponse.headers.get("Content-Disposition")) || setupBody.setup.cover?.filename || "customer-cover.png",
      }
    : null;

  return {
    source: metadataBody.source,
    setup: setupBody.setup,
    manuscript: String(textBody?.manuscript || ""),
    manuscriptAuthority: textBody?.manuscriptAuthority || null,
    cover,
  };
}

function buildGoldMasterDocx(title, author, manuscript) {
  const paragraphs = manuscriptBlocks(manuscript);
  const documentBody = [];
  documentBody.push(docxParagraph(title, { style: "Title", align: "center" }));
  documentBody.push(docxParagraph(author, { style: "Subtitle", align: "center" }));
  documentBody.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  for (const block of paragraphs) {
    if (block.heading) documentBody.push(docxParagraph(block.text, { style: "Heading1", pageBreakBefore: block.pageBreakBefore }));
    else documentBody.push(docxParagraph(block.text, { style: "BodyText", firstLine: 360 }));
  }
  documentBody.push(`
    <w:sectPr>
      <w:pgSz w:w="8640" w:h="12960"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="810" w:header="360" w:footer="360" w:gutter="180"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>`);

  const files = [
    { filename: "[Content_Types].xml", data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`) },
    { filename: "_rels/.rels", data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`) },
    { filename: "word/_rels/document.xml.rels", data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`) },
    { filename: "word/document.xml", data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${documentBody.join("")}</w:body></w:document>`) },
    { filename: "word/styles.xml", data: encode(docxStyles()) },
    { filename: "word/settings.xml", data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:evenAndOddHeaders/></w:settings>`) },
    { filename: "docProps/core.xml", data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>${xml(author)}</dc:creator><cp:lastModifiedBy>Mindset Media Group</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`) },
    { filename: "docProps/app.xml", data: encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Kairos Manuscript Builder</Application><Company>Mindset Media Group</Company></Properties>`) },
  ];
  return writeZip(files);
}

function docxStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="2400" w:after="360"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="360"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="240"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/><w:widowControl/></w:pPr></w:style>
</w:styles>`;
}

function docxParagraph(text, options = {}) {
  const pPr = [];
  if (options.style) pPr.push(`<w:pStyle w:val="${options.style}"/>`);
  if (options.align) pPr.push(`<w:jc w:val="${options.align}"/>`);
  if (options.firstLine) pPr.push(`<w:ind w:firstLine="${options.firstLine}"/>`);
  if (options.pageBreakBefore) pPr.push("<w:pageBreakBefore/>");
  const runs = String(text || "").split(/\n/).map((line, index) => `${index ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r>`).join("");
  return `<w:p>${pPr.length ? `<w:pPr>${pPr.join("")}</w:pPr>` : ""}${runs}</w:p>`;
}

function layoutInterior(title, author, manuscript) {
  const width = 432;
  const height = 648;
  const marginX = 54;
  const top = 54;
  const bottom = 48;
  const pages = [];
  pages.push({ width, height, commands: titlePageCommands(title, author, width, height) });

  let commands = [];
  let y = height - top;
  const pushPage = () => {
    pages.push({ width, height, commands: [...commands] });
    commands = [];
    y = height - top;
  };

  for (const block of manuscriptBlocks(manuscript)) {
    if (block.heading) {
      if (commands.length && (block.pageBreakBefore || y < 120)) pushPage();
      const lines = wrapText(block.text, 32);
      if (y - lines.length * 22 < bottom) pushPage();
      for (const line of lines) {
        commands.push(textCommand(line, marginX, y, 16, "F2"));
        y -= 22;
      }
      y -= 8;
      continue;
    }

    const lines = wrapText(block.text, 54);
    if (!lines.length) continue;
    for (let index = 0; index < lines.length; index += 1) {
      if (y < bottom + 18) pushPage();
      commands.push(textCommand(lines[index], marginX + (index === 0 ? 18 : 0), y, 11, "F1"));
      y -= 15;
    }
    y -= 6;
  }
  if (commands.length || pages.length === 1) pushPage();

  for (let index = 1; index < pages.length; index += 1) {
    pages[index].commands.push(textCommand(String(index), width / 2 - 3, 24, 9, "F1"));
  }
  return { pages, title, author };
}

function titlePageCommands(title, author, width, height) {
  const commands = [];
  let y = height * 0.65;
  for (const line of wrapText(title, 28)) {
    commands.push(textCommand(line, centeredX(line, 22, width), y, 22, "F2"));
    y -= 30;
  }
  y -= 24;
  commands.push(textCommand(author, centeredX(author, 12, width), y, 12, "F1"));
  return commands;
}

async function buildInteriorPdf(layout) {
  return buildPdf(layout.pages.map((page) => ({ ...page, type: "text" })));
}

async function buildDigitalAssetPdf(layout, coverImage) {
  const pages = [
    { type: "image", width: 432, height: 648, image: coverImage, mode: "cover" },
    ...layout.pages.map((page) => ({ ...page, type: "text" })),
  ];
  return buildPdf(pages);
}

async function buildFullWrapPdf({ title, author, pageCount, coverImage }) {
  const spineIn = Math.max(0, pageCount * KDP_WHITE_PAPER_SPINE_PER_PAGE_IN);
  const width = (TRIM_WIDTH_IN * 2 + spineIn + BLEED_IN * 2) * 72;
  const height = (TRIM_HEIGHT_IN + BLEED_IN * 2) * 72;
  const wideCover = coverImage.width / coverImage.height > 1.1;
  const frontX = (BLEED_IN + TRIM_WIDTH_IN + spineIn) * 72;
  const frontWidth = (TRIM_WIDTH_IN + BLEED_IN) * 72;
  const page = {
    type: "full-wrap",
    width,
    height,
    image: coverImage,
    wideCover,
    frontRegion: { x: frontX, y: 0, width: frontWidth, height },
    title,
    author,
    spineWidth: spineIn * 72,
  };
  return buildPdf([page]);
}

async function buildPdf(pages) {
  const objects = [null, null];
  const addObject = (value) => { objects.push(value); return objects.length; };
  const timesId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>");
  const boldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const imageMap = new Map();

  async function imageObject(image) {
    const key = image.checksum;
    if (imageMap.has(key)) return imageMap.get(key);
    let smaskId = null;
    if (image.alphaData) {
      smaskId = addObject({
        dict: `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.alphaData.byteLength} >>`,
        data: image.alphaData,
      });
    }
    const colorSpace = image.colorSpace || "/DeviceRGB";
    const extras = smaskId ? ` /SMask ${smaskId} 0 R` : "";
    const id = addObject({
      dict: `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter ${image.filter}${extras} /Length ${image.data.byteLength} >>`,
      data: image.data,
    });
    imageMap.set(key, id);
    return id;
  }

  const pageIds = [];
  for (const page of pages) {
    let xObject = "";
    let stream = "";
    if (page.type === "text") {
      stream = page.commands.join("\n");
    } else if (page.type === "image") {
      const imageId = await imageObject(page.image);
      xObject = ` /XObject << /Im1 ${imageId} 0 R >>`;
      stream = imagePlacementStream(page.image, { x: 0, y: 0, width: page.width, height: page.height }, "cover");
    } else if (page.type === "full-wrap") {
      const imageId = await imageObject(page.image);
      xObject = ` /XObject << /Im1 ${imageId} 0 R >>`;
      if (page.wideCover) {
        stream = imagePlacementStream(page.image, { x: 0, y: 0, width: page.width, height: page.height }, "cover");
      } else {
        stream = [
          "q 1 1 1 rg 0 0 " + number(page.width) + " " + number(page.height) + " re f Q",
          imagePlacementStream(page.image, page.frontRegion, "cover"),
        ].join("\n");
      }
    }
    const contentBytes = encode(stream);
    const contentId = addObject({ dict: `<< /Length ${contentBytes.byteLength} >>`, data: contentBytes });
    const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(page.width)} ${number(page.height)}] /Resources << /Font << /F1 ${timesId} 0 R /F2 ${boldId} 0 R >>${xObject} >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  return serializePdf(objects);
}

function imagePlacementStream(image, region, mode = "contain") {
  const scale = mode === "cover"
    ? Math.max(region.width / image.width, region.height / image.height)
    : Math.min(region.width / image.width, region.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = region.x + (region.width - width) / 2;
  const y = region.y + (region.height - height) / 2;
  return `q ${number(region.x)} ${number(region.y)} ${number(region.width)} ${number(region.height)} re W n ${number(width)} 0 0 ${number(height)} ${number(x)} ${number(y)} cm /Im1 Do Q`;
}

function serializePdf(objects) {
  const chunks = [encode("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];
  let offset = chunks[0].byteLength;
  for (let index = 0; index < objects.length; index += 1) {
    const id = index + 1;
    offsets[id] = offset;
    const head = encode(`${id} 0 obj\n`);
    const body = typeof objects[index] === "string"
      ? encode(objects[index])
      : concatBytes([encode(`${objects[index].dict}\nstream\n`), objects[index].data, encode("\nendstream")]);
    const tail = encode("\nendobj\n");
    chunks.push(head, body, tail);
    offset += head.byteLength + body.byteLength + tail.byteLength;
  }
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n"];
  for (let id = 1; id <= objects.length; id += 1) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  chunks.push(encode(xref.join("")));
  return concatBytes(chunks);
}

function textCommand(text, x, y, size, font) {
  return `BT /${font} ${number(size)} Tf 1 0 0 1 ${number(x)} ${number(y)} Tm (${pdfText(text)}) Tj ET`;
}

async function decodeCoverImage(bytes, mimeType) {
  if (mimeType === "image/jpeg") return decodeJpeg(bytes);
  if (mimeType === "image/png") return decodePng(bytes);
  throw fail(400, "cover_type_invalid", "The saved cover must be PNG or JPEG.");
}

async function decodeJpeg(bytes) {
  let offset = 2;
  let width = 0;
  let height = 0;
  let components = 3;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      components = bytes[offset + 7];
      break;
    }
    offset += Math.max(2, length);
  }
  if (!width || !height) throw fail(400, "cover_jpeg_invalid", "The saved JPEG cover dimensions could not be read.");
  return {
    width,
    height,
    data: bytes,
    alphaData: null,
    filter: "/DCTDecode",
    colorSpace: components === 1 ? "/DeviceGray" : components === 4 ? "/DeviceCMYK" : "/DeviceRGB",
    checksum: await sha256Hex(bytes),
  };
}

async function decodePng(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) throw fail(400, "cover_png_invalid", "The saved PNG cover signature is invalid.");
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
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0) {
    throw fail(400, "cover_png_unsupported", "The saved PNG cover must be a non-interlaced 8-bit image.");
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[colorType];
  if (!channels) throw fail(400, "cover_png_unsupported", "The saved PNG color format is not supported.");
  const inflated = await inflate(concatBytes(idat));
  const rowBytes = width * channels;
  const raw = new Uint8Array(rowBytes * height);
  let input = 0;
  let output = 0;
  let previous = new Uint8Array(rowBytes);
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[input++];
    const current = inflated.slice(input, input + rowBytes);
    input += rowBytes;
    unfilter(current, previous, channels, filter);
    raw.set(current, output);
    output += rowBytes;
    previous = current;
  }

  const rgb = new Uint8Array(width * height * 3);
  let alpha = null;
  if (colorType === 4 || colorType === 6 || (colorType === 3 && transparency)) alpha = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 3;
    if (colorType === 0) rgb[target] = rgb[target + 1] = rgb[target + 2] = raw[source];
    else if (colorType === 2) { rgb[target] = raw[source]; rgb[target + 1] = raw[source + 1]; rgb[target + 2] = raw[source + 2]; }
    else if (colorType === 3) {
      const index = raw[source];
      rgb[target] = palette?.[index * 3] ?? 0;
      rgb[target + 1] = palette?.[index * 3 + 1] ?? 0;
      rgb[target + 2] = palette?.[index * 3 + 2] ?? 0;
      if (alpha) alpha[pixel] = transparency?.[index] ?? 255;
    } else if (colorType === 4) {
      rgb[target] = rgb[target + 1] = rgb[target + 2] = raw[source];
      alpha[pixel] = raw[source + 1];
    } else if (colorType === 6) {
      rgb[target] = raw[source]; rgb[target + 1] = raw[source + 1]; rgb[target + 2] = raw[source + 2];
      alpha[pixel] = raw[source + 3];
    }
  }
  return {
    width,
    height,
    data: await deflate(rgb),
    alphaData: alpha ? await deflate(alpha) : null,
    filter: "/FlateDecode",
    colorSpace: "/DeviceRGB",
    checksum: await sha256Hex(bytes),
  };
}

function unfilter(row, previous, bpp, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bpp ? row[index - bpp] : 0;
    const up = previous[index] || 0;
    const upperLeft = index >= bpp ? previous[index - bpp] || 0 : 0;
    if (filter === 1) row[index] = (row[index] + left) & 255;
    else if (filter === 2) row[index] = (row[index] + up) & 255;
    else if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) row[index] = (row[index] + paeth(left, up, upperLeft)) & 255;
    else if (filter !== 0) throw fail(400, "cover_png_filter_invalid", "The saved PNG uses an unsupported scanline filter.");
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

function manuscriptBlocks(manuscript) {
  const normalized = String(manuscript || "").replace(/\r\n?/g, "\n").trim();
  const raw = normalized.split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
  return raw.map((text, index) => ({
    text: text.replace(/\n+/g, " ").trim(),
    heading: isHeading(text),
    pageBreakBefore: index > 0 && isMajorHeading(text),
  }));
}

function isHeading(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 100 || text.includes("\n")) return false;
  return /^(chapter\s+([0-9ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b|introduction\b|conclusion\b|preface\b|foreword\b|afterword\b|appendix\b|part\s+([0-9ivxlcdm]+|one|two|three|four|five)\b)/i.test(text)
    || (text.length < 70 && text === text.toUpperCase() && /[A-Z]/.test(text));
}

function isMajorHeading(value) {
  return /^(chapter\b|part\b|introduction\b|conclusion\b|preface\b|foreword\b|afterword\b|appendix\b)/i.test(String(value || "").trim());
}

function wrapText(text, maxChars) {
  const words = pdfPlain(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= maxChars) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function centeredX(text, size, pageWidth) {
  return Math.max(36, (pageWidth - pdfPlain(text).length * size * 0.52) / 2);
}

function pdfText(value) {
  return pdfPlain(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfPlain(value) {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function filenameStem(title) {
  return String(title || "Untitled_Manuscript")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || "Untitled_Manuscript";
}

function validatePackageFiles(files) {
  return files.length === 5
    && new Set(files.map((item) => item.kind)).size === 5
    && REQUIRED_DELIVERABLE_KINDS.every((kind) => files.some((item) => item.kind === kind && item.data instanceof Uint8Array && item.data.byteLength > 0));
}

async function artifact(projectId, createdAt, item) {
  return {
    id: `ka_${crypto.randomUUID()}`,
    kind: item.kind,
    filename: item.filename,
    mimeType: item.mimeType,
    byteSize: item.data.byteLength,
    sha256: await sha256Hex(item.data),
    storageKey: `${projectId}/${item.filename}`,
    createdAt,
    role: item.role,
  };
}

async function readJson(response) {
  if (!response) return {};
  try { return await response.clone().json(); }
  catch { return {}; }
}

function normalizeCoverMime(value) {
  const mime = String(value || "").split(";")[0].trim().toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

function dispositionFilename(value) {
  const match = String(value || "").match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i);
  return match?.[1] ? decodeURIComponent(match[1].replace(/^"|"$/g, "")) : "";
}

function countWords(value) {
  return (String(value || "").match(/\b[\w’'-]+\b/g) || []).length;
}

function xml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function encode(value) { return new TextEncoder().encode(value); }
function number(value) { return Number(value).toFixed(3).replace(/\.000$/, ""); }
function readU32(bytes, offset) { return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0; }

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function concatBytes(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encode(file.filename);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.data.length, true);
    view.setUint32(22, file.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);

    const cd = new Uint8Array(46 + name.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, file.data.length, true);
    cdv.setUint32(24, file.data.length, true);
    cdv.setUint16(28, name.length, true);
    cdv.setUint32(42, offset, true);
    cd.set(name, 46);
    locals.push({ header: local, data: file.data });
    central.push(cd);
    offset += local.length + file.data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const output = new Uint8Array(offset + centralSize + 22);
  let position = 0;
  for (const item of locals) { output.set(item.header, position); position += item.header.length; output.set(item.data, position); position += item.data.length; }
  for (const item of central) { output.set(item, position); position += item.length; }
  const end = new DataView(output.buffer, position, 22);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);
  return output;
}

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
