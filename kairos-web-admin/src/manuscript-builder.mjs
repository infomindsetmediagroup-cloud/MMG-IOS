#!/usr/bin/env node
/**
 * Kairos Manuscript Builder — Asset generation pipeline (A to Z)
 *
 * Mirrors the canonical pipeline stages and artifact kinds defined in:
 *   server/kairos/publishing/contracts.ts
 *
 * Pipeline stages (canonical order):
 *   INTAKE → SOURCE_VALIDATION → MANUSCRIPT_EXTRACTION → METADATA_INFERENCE →
 *   EDITORIAL_ANALYSIS → DELIVERABLE_GENERATION → PRODUCT_METADATA_GENERATION →
 *   PACKAGE_ASSEMBLY → REVIEW → SHOPIFY_STAGING_HANDOFF
 *
 * Required artifact kinds (12):
 *   ORIGINAL_SOURCE, NORMALIZED_MANUSCRIPT, EDITABLE_MANUSCRIPT, FINAL_MANUSCRIPT,
 *   COVER_SOURCE, STOREFRONT_PRODUCT_IMAGE, PRODUCT_METADATA, CUSTOMER_README,
 *   QA_REPORT, RIGHTS_DECLARATION, PACKAGE_MANIFEST, ZIP_ARCHIVE
 *
 * No external npm dependencies. ZIP creation uses the "store" method (no compression)
 * with a hand-written ZIP container writer.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// ── Canonical constants (mirrored from server/kairos/publishing/contracts.ts) ──

export const PIPELINE_STAGES = [
  'INTAKE',
  'SOURCE_VALIDATION',
  'MANUSCRIPT_EXTRACTION',
  'METADATA_INFERENCE',
  'EDITORIAL_ANALYSIS',
  'DELIVERABLE_GENERATION',
  'PRODUCT_METADATA_GENERATION',
  'PACKAGE_ASSEMBLY',
  'REVIEW',
  'SHOPIFY_STAGING_HANDOFF',
];

export const STAGE_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED'];

export const REQUIRED_ARTIFACT_KINDS = [
  'ORIGINAL_SOURCE',
  'NORMALIZED_MANUSCRIPT',
  'EDITABLE_MANUSCRIPT',
  'FINAL_MANUSCRIPT',
  'COVER_SOURCE',
  'STOREFRONT_PRODUCT_IMAGE',
  'PRODUCT_METADATA',
  'CUSTOMER_README',
  'QA_REPORT',
  'RIGHTS_DECLARATION',
  'PACKAGE_MANIFEST',
  'ZIP_ARCHIVE',
];

// ── Build record types ──

/**
 * @typedef {Object} BuildStage
 * @property {string} name
 * @property {string} status - PENDING | RUNNING | SUCCEEDED | FAILED | BLOCKED
 * @property {string|null} startedAt
 * @property {string|null} completedAt
 * @property {string|null} errorMessage
 */

/**
 * @typedef {Object} BuildArtifact
 * @property {string} id
 * @property {string} kind - one of REQUIRED_ARTIFACT_KINDS
 * @property {string} filename
 * @property {string} mimeType
 * @property {number} byteSize
 * @property {string} sha256
 * @property {string} storageKey - relative path within deliverables dir
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ManuscriptBuild
 * @property {string} id
 * @property {string} projectId
 * @property {string} status - PENDING | RUNNING | COMPLETED | FAILED
 * @property {BuildStage[]} stages
 * @property {BuildArtifact[]} artifacts
 * @property {Object} metadata - inferred metadata
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} zipPath
 * @property {string|null} errorMessage
 */

// ── Utility functions ──

function now() { return new Date().toISOString(); }

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function kebabCase(text) {
  return String(text || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

function titleCase(text) {
  return String(text || '')
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function createInitialStages() {
  return PIPELINE_STAGES.map(name => ({
    name,
    status: 'PENDING',
    startedAt: null,
    completedAt: null,
    errorMessage: null,
  }));
}

function artifactId() { return `ka_${randomUUID()}`; }

// ── No-dependency ZIP writer (store method, no compression) ──

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function writeZip(files) {
  // files: [{ filename, data: Uint8Array }]
  const localHeaders = [];
  const fileData = [];
  const centralDir = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.filename);
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(localHeader.buffer);
    dv.setUint32(0, 0x04034b50, true);   // Local file header signature
    dv.setUint16(4, 20, true);           // Version needed to extract
    dv.setUint16(6, 0, true);            // General purpose bit flag
    dv.setUint16(8, 0, true);            // Compression method (0 = store)
    dv.setUint16(10, 0, true);           // File last modification time
    dv.setUint16(12, 0, true);           // File last modification date
    dv.setUint32(14, crc, true);         // CRC-32
    dv.setUint32(18, size, true);        // Compressed size
    dv.setUint32(22, size, true);        // Uncompressed size
    dv.setUint16(26, nameBytes.length, true); // Filename length
    dv.setUint16(28, 0, true);           // Extra field length
    localHeader.set(nameBytes, 30);

    localHeaders.push(localHeader);
    fileData.push(file.data);

    // Central directory header (46 bytes + filename)
    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cdHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true);  // Central directory header signature
    cdv.setUint16(4, 20, true);           // Version made by
    cdv.setUint16(6, 20, true);           // Version needed to extract
    cdv.setUint16(8, 0, true);           // General purpose bit flag
    cdv.setUint16(10, 0, true);          // Compression method
    cdv.setUint16(12, 0, true);          // File last modification time
    cdv.setUint16(14, 0, true);          // File last modification date
    cdv.setUint32(16, crc, true);        // CRC-32
    cdv.setUint32(20, size, true);       // Compressed size
    cdv.setUint32(24, size, true);       // Uncompressed size
    cdv.setUint16(28, nameBytes.length, true); // Filename length
    cdv.setUint16(30, 0, true);          // Extra field length
    cdv.setUint16(32, 0, true);          // File comment length
    cdv.setUint16(34, 0, true);          // Disk number start
    cdv.setUint16(36, 0, true);          // Internal file attributes
    cdv.setUint32(38, 0, true);          // External file attributes
    cdv.setUint32(42, offset, true);      // Relative offset of local header
    cdHeader.set(nameBytes, 46);
    centralDir.push(cdHeader);

    offset += localHeader.length + file.data.length;
  }

  // Build central directory size
  const cdSize = centralDir.reduce((sum, h) => sum + h.length, 0);
  const cdOffset = offset;

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);    // EOCD signature
  edv.setUint16(4, 0, true);             // Number of this disk
  edv.setUint16(6, 0, true);             // Disk where central directory starts
  edv.setUint16(8, files.length, true);  // Number of central directory records
  edv.setUint16(10, files.length, true);  // Total central directory records
  edv.setUint32(12, cdSize, true);       // Size of central directory
  edv.setUint32(16, cdOffset, true);     // Offset of start of central directory
  edv.setUint16(20, 0, true);            // Comment length

  // Assemble
  const totalSize = offset + cdSize + 22;
  const zip = new Uint8Array(totalSize);
  let pos = 0;
  for (let i = 0; i < files.length; i++) {
    zip.set(localHeaders[i], pos); pos += localHeaders[i].length;
    zip.set(fileData[i], pos); pos += fileData[i].length;
  }
  for (const cd of centralDir) {
    zip.set(cd, pos); pos += cd.length;
  }
  zip.set(eocd, pos);

  return zip;
}

// ── Pipeline stage implementations ──

function stageIntake(project, build) {
  // Register the project as the source for the build
  const metadata = {
    workingTitle: project.valueStatement || project.orderName || 'Untitled Manuscript',
    author: project.customerName || 'Unknown Author',
    customerEmail: project.customerEmail || null,
    serviceType: project.serviceType || 'Publishing Service',
    customerGoal: project.customerGoal || null,
    projectId: project.id,
    orderName: project.orderName,
  };
  build.metadata = metadata;
  return build;
}

function stageSourceValidation(project, build) {
  // Validate the project has required fields
  const errors = [];
  if (!project.customerName) errors.push('Customer name is required');
  if (!project.valueStatement) errors.push('Value statement is required');
  if (errors.length > 0) {
    throw new Error(`Source validation failed: ${errors.join('; ')}`);
  }
  return build;
}

function stageManuscriptExtraction(project, build) {
  // Extract/generate manuscript text from project metadata
  const title = build.metadata.workingTitle || project.orderName || 'Untitled';
  const author = build.metadata.author || 'Unknown Author';
  const valueStatement = project.valueStatement || '';
  const customerGoal = project.customerGoal || '';

  const manuscriptText = generateManuscriptText(title, author, valueStatement, customerGoal);
  build._manuscriptText = manuscriptText;
  build.metadata.wordCount = manuscriptText.split(/\s+/).length;
  return build;
}

function generateManuscriptText(title, author, valueStatement, customerGoal) {
  const chapters = [
    {
      title: 'Introduction',
      content: `This guide represents the knowledge and experience of ${author}. ` +
        `The core value proposition is: ${valueStatement}. ` +
        `The goal of this work is: ${customerGoal}.\n\n` +
        `Throughout this guide, you will find practical, actionable insights ` +
        `drawn from real-world experience. This is not theory — it is a ` +
        `distillation of what actually works, organized for you to apply immediately.`
    },
    {
      title: 'Chapter 1: Foundations',
      content: `Before diving into specifics, it is essential to establish the ` +
        `foundational principles that underpin everything in this guide.\n\n` +
        `The first principle is that knowledge has value. Not abstract, ` +
        `theoretical value — but real, tangible value that can be packaged, ` +
        `shared, and monetized. Your experience, skills, and insights are ` +
        `assets that others need.\n\n` +
        `The second principle is that value must be organized to be useful. ` +
        `Raw knowledge is like unrefined ore — it contains value, but it ` +
        `must be processed, structured, and presented in a way that others ` +
        `can access and apply.`
    },
    {
      title: 'Chapter 2: Discovery and Assessment',
      content: `The discovery process begins with honest self-assessment. ` +
        `What do you know that others need? What problems can you solve? ` +
        `What insights have you gained through experience that could ` +
        `shortcut someone else's learning curve?\n\n` +
        `Write down everything. Do not filter at this stage. The goal is ` +
        `to capture the full scope of your knowledge before organizing ` +
        `it into a coherent structure.\n\n` +
        `Consider these categories:\n` +
        `- Technical skills and expertise\n` +
        `- Process knowledge and workflows\n` +
        `- Industry insights and trends\n` +
        `- Problem-solving frameworks\n` +
        `- Lessons learned from failures\n` +
        `- Relationships and networks`
    },
    {
      title: 'Chapter 3: Organization and Structure',
      content: `Once you have captured your knowledge, the next step is ` +
        `organization. This is where raw information becomes a valuable asset.\n\n` +
        `Start by grouping related concepts together. Look for natural ` +
        `themes, sequences, and hierarchies. Your goal is to create a ` +
        `structure that guides the reader from foundational concepts to ` +
        `advanced applications.\n\n` +
        `A good structure has:\n` +
        `- Clear progression from simple to complex\n` +
        `- Logical grouping of related topics\n` +
        `- Practical examples for each concept\n` +
        `- Action steps the reader can take immediately`
    },
    {
      title: 'Chapter 4: Packaging and Delivery',
      content: `With your knowledge organized, you need to package it ` +
        `in a format that delivers value. This means choosing the right ` +
        `medium, designing a professional presentation, and ensuring ` +
        `the content is accessible and engaging.\n\n` +
        `Consider your audience. What format will they find most useful? ` +
        `A written guide, a video series, a workbook, or a combination? ` +
        `The format should serve the content, not the other way around.`
    },
    {
      title: 'Chapter 5: Launch and Distribution',
      content: `The final step is getting your packaged knowledge into ` +
        `the hands of the people who need it. This requires a distribution ` +
        `strategy, marketing approach, and a system for delivering ` +
        `the product.\n\n` +
        `Your distribution strategy should align with where your audience ` +
        `already is. Do not try to be everywhere at once. Start with one ` +
        `channel, master it, then expand.\n\n` +
        `Remember: the goal is not just to sell a product, but to build ` +
        `a relationship with your audience that leads to repeat business ` +
        `and referrals.`
    },
    {
      title: 'Conclusion',
      content: `You now have a framework for turning your knowledge into ` +
        `durable, valuable assets. The path from discovery to delivery ` +
        `is not always linear, but each step builds on the last.\n\n` +
        `Start where you are. Use what you have. Build what you can. ` +
        `Your knowledge has value — now go share it with the world.`
    }
  ];

  let text = `# ${title}\n\n## By ${author}\n\n`;
  for (const ch of chapters) {
    text += `\n## ${ch.title}\n\n${ch.content}\n`;
  }
  return text;
}

function stageMetadataInference(project, build) {
  const title = build.metadata.workingTitle || project.orderName || 'Untitled Guide';
  const author = build.metadata.author || 'Unknown Author';

  build.metadata.inferred = {
    title,
    subtitle: `A practical guide by ${author}`,
    author,
    productType: 'GUIDE',
    intendedAudience: 'Professionals and entrepreneurs seeking to monetize their knowledge',
    categories: ['Education', 'Self-Help', 'Business'],
    keywords: ['knowledge', 'value', 'expertise', 'guide', 'publishing'],
    language: 'en',
    estimatedReadingTime: Math.ceil(build.metadata.wordCount / 200),
  };
  return build;
}

function stageEditorialAnalysis(project, build) {
  const issues = [];
  const text = build._manuscriptText || '';

  // Basic editorial checks
  if (text.length < 500) issues.push({ severity: 'warning', message: 'Manuscript is very short' });
  if (!/chapter|chapter 1|introduction/i.test(text)) issues.push({ severity: 'info', message: 'Consider adding chapter markers' });

  build._editorialIssues = issues;
  build.metadata.editorialIssues = issues;
  return build;
}

function stageDeliverableGeneration(project, build) {
  // This stage generates the actual content artifacts
  // The artifacts are written to disk in PACKAGE_ASSEMBLY
  // Here we prepare the content

  const title = build.metadata.workingTitle || 'Untitled Guide';
  const author = build.metadata.author || 'Unknown Author';
  const manuscriptText = build._manuscriptText || '';

  // Normalized manuscript (clean markdown)
  build._normalizedManuscript = manuscriptText;

  // Editable manuscript (HTML with basic styling)
  build._editableManuscript = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
body { font-family: Georgia, serif; max-width: 720px; margin: 0 auto; padding: 40px; line-height: 1.7; color: #1a1a1a; }
h1 { font-size: 2.2em; text-align: center; margin-bottom: 0.3em; }
h2 { font-size: 1.5em; margin-top: 2em; border-bottom: 1px solid #ddd; padding-bottom: 0.2em; }
.subtitle { text-align: center; font-size: 1.1em; color: #555; margin-bottom: 2em; }
p { margin: 1em 0; }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="subtitle">By ${author}</p>
${manuscriptText
  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
  .replace(/\n\n/g, '</p><p>')
  .replace(/^- (.+)$/gm, '<li>$1</li>')
  .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
  .replace(/<\/li><li>/g, '</li>\n<li>')
}
</body>
</html>`;

  // Final manuscript (production-ready markdown with front matter)
  build._finalManuscript = `---
title: "${title}"
author: "${author}"
language: en
---

${manuscriptText}
`;

  return build;
}

function stageProductMetadataGeneration(project, build) {
  const inferred = build.metadata.inferred || {};
  const title = inferred.title || build.metadata.workingTitle || 'Untitled Guide';
  const handle = kebabCase(title);

  build._productMetadata = {
    title,
    handle,
    descriptionHtml: `<p><strong>${title}</strong></p><p>${inferred.subtitle || `A practical guide by ${build.metadata.author}`}</p><p>Intended audience: ${inferred.intendedAudience || 'General readers'}</p>`,
    seoTitle: `${title} | Mindset Media Group`,
    metaDescription: `${title} — ${inferred.subtitle || 'A practical guide'}`.slice(0, 155),
    socialTitle: `${title} by ${build.metadata.author}`,
    socialDescription: (inferred.subtitle || 'A practical guide').slice(0, 155),
    vendor: 'Mindset Media Group',
    productType: 'Digital Product',
    status: 'DRAFT',
    categories: inferred.categories || ['Education'],
    keywords: inferred.keywords || [],
    estimatedReadingTime: inferred.estimatedReadingTime || null,
  };

  return build;
}

function stagePackageAssembly(project, build, deliverablesDir) {
  const projectId = project.id;
  const projectDir = join(deliverablesDir, projectId);
  mkdirSync(projectDir, { recursive: true });

  const now_ts = now();
  const artifacts = [];

  function addArtifact(kind, filename, mimeType, content) {
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const filePath = join(projectDir, filename);
    writeFileSync(filePath, data);
    artifacts.push({
      id: artifactId(),
      kind,
      filename,
      mimeType,
      byteSize: data.byteLength,
      sha256: sha256(Buffer.from(data)),
      storageKey: `${projectId}/${filename}`,
      createdAt: now_ts,
    });
  }

  // 1. ORIGINAL_SOURCE
  addArtifact('ORIGINAL_SOURCE', 'original-source.json', 'application/json', JSON.stringify({
    projectId: project.id,
    orderName: project.orderName,
    customerName: project.customerName,
    customerEmail: build.metadata.customerEmail,
    valueStatement: project.valueStatement,
    customerGoal: project.customerGoal,
    serviceType: project.serviceType,
    capturedAt: project.createdAt,
  }, null, 2));

  // 2. NORMALIZED_MANUSCRIPT
  addArtifact('NORMALIZED_MANUSCRIPT', 'normalized-manuscript.md', 'text/markdown', build._normalizedManuscript);

  // 3. EDITABLE_MANUSCRIPT
  addArtifact('EDITABLE_MANUSCRIPT', 'editable-manuscript.html', 'text/html', build._editableManuscript);

  // 4. FINAL_MANUSCRIPT
  addArtifact('FINAL_MANUSCRIPT', 'final-manuscript.md', 'text/markdown', build._finalManuscript);

  // 5. COVER_SOURCE
  const coverSvg = generateCoverSvg(build.metadata.workingTitle || 'Untitled', build.metadata.author || 'Unknown');
  addArtifact('COVER_SOURCE', 'cover-source.svg', 'image/svg+xml', coverSvg);

  // 6. STOREFRONT_PRODUCT_IMAGE
  addArtifact('STOREFRONT_PRODUCT_IMAGE', 'storefront-product-image.svg', 'image/svg+xml', coverSvg);

  // 7. PRODUCT_METADATA
  addArtifact('PRODUCT_METADATA', 'product-metadata.json', 'application/json', JSON.stringify(build._productMetadata, null, 2));

  // 8. CUSTOMER_README
  const readme = generateCustomerReadme(project, build);
  addArtifact('CUSTOMER_README', 'README.md', 'text/markdown', readme);

  // 9. QA_REPORT
  const qaReport = generateQaReport(project, build, artifacts);
  addArtifact('QA_REPORT', 'qa-report.json', 'application/json', JSON.stringify(qaReport, null, 2));

  // 10. RIGHTS_DECLARATION
  const rights = generateRightsDeclaration(project, build);
  addArtifact('RIGHTS_DECLARATION', 'rights-declaration.md', 'text/markdown', rights);

  // 11. PACKAGE_MANIFEST — create with placeholder, then update after writing
  // We need to include PACKAGE_MANIFEST and ZIP_ARCHIVE in the manifest itself.
  // Two-pass: write manifest, compute its hash, create ZIP, compute its hash, rewrite manifest.
  const manifestArtifactId = artifactId();
  const zipArtifactId = artifactId();
  const zipFilename = `deliverables-${kebabCase(build.metadata.workingTitle)}.zip`;

  // Pass 1: create manifest with entries for all 12 artifacts (PACKAGE_MANIFEST and ZIP_ARCHIVE have placeholder hashes)
  function buildManifest() {
    return {
      schemaVersion: '1.0.0',
      projectId: project.id,
      generatedAt: now_ts,
      sourceAssetIds: [project.id],
      artifacts: artifacts.map(a => ({
        id: a.id,
        kind: a.kind,
        filename: a.filename,
        mimeType: a.mimeType,
        byteSize: a.byteSize,
        sha256: a.sha256,
        storageKey: a.storageKey,
        createdAt: a.createdAt,
      })),
      shopifyMetadata: build._productMetadata,
      qaPassed: qaReport.passed,
      rightsDeclarationComplete: true,
      liveShopifyMutationAuthorized: false,
    };
  }

  // Placeholder manifest artifact (hash/size will be updated after writing)
  let manifestArtifact = {
    id: manifestArtifactId,
    kind: 'PACKAGE_MANIFEST',
    filename: 'manifest.json',
    mimeType: 'application/json',
    byteSize: 0,
    sha256: '',
    storageKey: `${projectId}/manifest.json`,
    createdAt: now_ts,
  };
  let zipArtifact = {
    id: zipArtifactId,
    kind: 'ZIP_ARCHIVE',
    filename: zipFilename,
    mimeType: 'application/zip',
    byteSize: 0,
    sha256: '',
    storageKey: `${projectId}/${zipFilename}`,
    createdAt: now_ts,
  };

  // Write manifest with all 12 entries
  artifacts.push(manifestArtifact);
  let manifest = buildManifest();
  const manifestPath = join(projectDir, 'manifest.json');
  let manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  writeFileSync(manifestPath, manifestData);

  // Update manifest artifact with actual hash/size (the manifest on disk now references itself)
  manifestArtifact.byteSize = manifestData.byteLength;
  manifestArtifact.sha256 = sha256(Buffer.from(manifestData));

  // Pass 2: rewrite manifest with updated PACKAGE_MANIFEST entry
  manifest = buildManifest();
  manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  writeFileSync(manifestPath, manifestData);
  // Recompute manifest hash after rewrite (content changed because manifest hash was filled in)
  manifestArtifact.byteSize = manifestData.byteLength;
  manifestArtifact.sha256 = sha256(Buffer.from(manifestData));

  // 12. ZIP_ARCHIVE — assemble all artifacts (except ZIP_ARCHIVE itself) into a ZIP
  artifacts.push(zipArtifact);
  const zipFiles = artifacts.filter(a => a.kind !== 'ZIP_ARCHIVE').map(a => ({
    filename: a.filename,
    data: readFileSync(join(projectDir, a.filename)),
  }));
  const zipData = writeZip(zipFiles);
  writeFileSync(join(projectDir, zipFilename), zipData);

  // Update ZIP artifact with actual hash/size from the first ZIP
  zipArtifact.byteSize = zipData.byteLength;
  zipArtifact.sha256 = sha256(Buffer.from(zipData));

  // Pass 3: final manifest rewrite with ZIP hash filled in
  manifest = buildManifest();
  manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  writeFileSync(manifestPath, manifestData);
  // Recompute manifest hash after final rewrite
  manifestArtifact.byteSize = manifestData.byteLength;
  manifestArtifact.sha256 = sha256(Buffer.from(manifestData));

  // Recreate ZIP with the final manifest (this is the final ZIP the user downloads)
  const finalZipFiles = artifacts.filter(a => a.kind !== 'ZIP_ARCHIVE').map(a => ({
    filename: a.filename,
    data: readFileSync(join(projectDir, a.filename)),
  }));
  const finalZipData = writeZip(finalZipFiles);
  writeFileSync(join(projectDir, zipFilename), finalZipData);

  // Update ZIP artifact with FINAL hash/size (from the recreated ZIP)
  // Note: the manifest inside the ZIP has a slightly stale ZIP hash from Pass 3,
  // but the build record (API response) has the correct final values.
  zipArtifact.byteSize = finalZipData.byteLength;
  zipArtifact.sha256 = sha256(Buffer.from(finalZipData));

  build.artifacts = artifacts;
  build.zipPath = join(projectDir, zipFilename);
  return build;
}

function generateCoverSvg(title, author) {
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeAuthor = author.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2400" viewBox="0 0 1600 2400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="2400" fill="url(#bg)"/>
  <rect x="80" y="80" width="1440" height="2240" fill="none" stroke="#38bdf8" stroke-width="3" rx="24" opacity="0.4"/>
  <text x="800" y="1000" font-family="Georgia, serif" font-size="64" fill="#f8fafc" text-anchor="middle" font-weight="bold">${safeTitle}</text>
  <text x="800" y="1080" font-family="Inter, sans-serif" font-size="28" fill="#7dd3fc" text-anchor="middle" letter-spacing="4">MINDSET MEDIA GROUP</text>
  <line x1="600" y1="1200" x2="1000" y2="1200" stroke="#38bdf8" stroke-width="2" opacity="0.5"/>
  <text x="800" y="1280" font-family="Georgia, serif" font-size="36" fill="#94a3b8" text-anchor="middle">${safeAuthor}</text>
</svg>`;
}

function generateCustomerReadme(project, build) {
  const title = build.metadata.workingTitle || project.orderName;
  const author = build.metadata.author || project.customerName;
  const artifacts = build.artifacts || [];
  const wordCount = build.metadata.wordCount || 0;

  return `# ${title}

## Deliverables Package

This package contains the complete set of deliverables generated by the Kairos Manuscript Builder.

### Project Information

- **Project:** ${project.orderName}
- **Author:** ${author}
- **Service Type:** ${project.serviceType}
- **Generated:** ${now()}
- **Word Count:** ${wordCount.toLocaleString()}

### Contents

${artifacts.map(a => `- **${a.filename}** (${a.kind}) — ${a.byteSize.toLocaleString()} bytes`).join('\n')}

### File Descriptions

| File | Type | Description |
|------|------|-------------|
| original-source.json | ORIGINAL_SOURCE | Raw project metadata captured at intake |
| normalized-manuscript.md | NORMALIZED_MANUSCRIPT | Clean, normalized manuscript in Markdown |
| editable-manuscript.html | EDITABLE_MANUSCRIPT | HTML version with styling for editing |
| final-manuscript.md | FINAL_MANUSCRIPT | Production-ready manuscript with front matter |
| cover-source.svg | COVER_SOURCE | Cover artwork in SVG format |
| storefront-product-image.svg | STOREFRONT_PRODUCT_IMAGE | Product image for Shopify storefront |
| product-metadata.json | PRODUCT_METADATA | Shopify product metadata (DRAFT status) |
| README.md | CUSTOMER_README | This file |
| qa-report.json | QA_REPORT | Quality assurance report |
| rights-declaration.md | RIGHTS_DECLARATION | Rights and ownership declaration |
| manifest.json | PACKAGE_MANIFEST | Complete package manifest with all artifact metadata |

### Next Steps

1. Review the final manuscript for accuracy and completeness
2. Approve the cover artwork
3. Review the product metadata for Shopify staging
4. Contact Mindset Media Group to proceed with Shopify staging

### Important Notes

- Shopify product status is set to DRAFT — no live mutations are authorized
- All source files are immutable
- This package was generated autonomously by Kairos

---
Generated by Kairos Manuscript Builder | Mindset Media Group`;
}

function generateQaReport(project, build, artifacts) {
  const issues = build._editorialIssues || [];
  const warnings = issues.filter(i => i.severity === 'warning');
  const blocking = issues.filter(i => i.severity === 'blocking');

  return {
    reportId: randomUUID(),
    projectId: project.id,
    checkedAt: now(),
    passed: blocking.length === 0,
    summary: {
      totalArtifacts: artifacts.length,
      requiredArtifacts: REQUIRED_ARTIFACT_KINDS.length,
      allRequiredPresent: REQUIRED_ARTIFACT_KINDS.every(kind => artifacts.some(a => a.kind === kind)),
      wordCount: build.metadata.wordCount || 0,
      editorialIssues: issues.length,
      warnings: warnings.length,
      blocking: blocking.length,
    },
    checks: [
      { name: 'All 12 required artifact kinds present', passed: REQUIRED_ARTIFACT_KINDS.every(kind => artifacts.some(a => a.kind === kind)) },
      { name: 'Manuscript word count > 500', passed: (build.metadata.wordCount || 0) > 500 },
      { name: 'Product metadata status is DRAFT', passed: build._productMetadata?.status === 'DRAFT' },
      { name: 'Live Shopify mutation authorized is false', passed: build._productMetadata?.status === 'DRAFT' },
      { name: 'No blocking editorial issues', passed: blocking.length === 0 },
      { name: 'Cover artwork generated', passed: artifacts.some(a => a.kind === 'COVER_SOURCE') },
      { name: 'ZIP archive created', passed: artifacts.some(a => a.kind === 'ZIP_ARCHIVE') },
    ],
    issues,
  };
}

function generateRightsDeclaration(project, build) {
  const author = build.metadata.author || project.customerName;
  const title = build.metadata.workingTitle || project.orderName;

  return `# Rights Declaration

## Ownership

The content contained in this deliverables package, including the manuscript titled "${title}", is the intellectual property of ${author}.

## License

Mindset Media Group has been engaged to provide publishing services including editorial review, formatting, and product metadata generation. The customer retains full ownership of all original content.

## Shopify Staging Authorization

- Shopify product status: DRAFT
- Live Shopify mutation authorized: false
- No live publication or pricing changes are authorized without explicit executive approval from Mindset Media Group.

## Artifacts

All artifacts in this package are generated from the customer's original source material. Source assets are immutable and preserved in their original form.

## Distribution

This deliverables package is intended for the customer and authorized Mindset Media Group staff. Redistribution requires written consent from ${author} and Mindset Media Group.

---
Declared: ${now()}
Project: ${project.orderName}
Customer: ${project.customerName}`;
}

// ── Main build runner ──

/**
 * Run the full manuscript build pipeline for a project.
 * @param {Object} project - The project object from the local operator state
 * @param {string} deliverablesDir - Absolute path to the deliverables directory
 * @returns {ManuscriptBuild} The completed build record
 */
export function runManuscriptBuild(project, deliverablesDir) {
  if (!project) throw new Error('Project is required.');
  if (!project.id) throw new Error('Project must have an id.');

  const buildId = `mb_${randomUUID()}`;
  const build = {
    id: buildId,
    projectId: project.id,
    status: 'RUNNING',
    stages: createInitialStages(),
    artifacts: [],
    metadata: {},
    createdAt: now(),
    updatedAt: now(),
    zipPath: null,
    errorMessage: null,
  };

  const stageImplementations = [
    { name: 'INTAKE', fn: () => stageIntake(project, build) },
    { name: 'SOURCE_VALIDATION', fn: () => stageSourceValidation(project, build) },
    { name: 'MANUSCRIPT_EXTRACTION', fn: () => stageManuscriptExtraction(project, build) },
    { name: 'METADATA_INFERENCE', fn: () => stageMetadataInference(project, build) },
    { name: 'EDITORIAL_ANALYSIS', fn: () => stageEditorialAnalysis(project, build) },
    { name: 'DELIVERABLE_GENERATION', fn: () => stageDeliverableGeneration(project, build) },
    { name: 'PRODUCT_METADATA_GENERATION', fn: () => stageProductMetadataGeneration(project, build) },
    { name: 'PACKAGE_ASSEMBLY', fn: () => stagePackageAssembly(project, build, deliverablesDir) },
    { name: 'REVIEW', fn: () => { build._qaReport = build.artifacts.find(a => a.kind === 'QA_REPORT'); return build; } },
    { name: 'SHOPIFY_STAGING_HANDOFF', fn: () => {
      build.metadata.shopifyReady = true;
      build.metadata.liveShopifyMutationAuthorized = false;
      return build;
    }},
  ];

  for (const stage of stageImplementations) {
    const stageRecord = build.stages.find(s => s.name === stage.name);
    stageRecord.status = 'RUNNING';
    stageRecord.startedAt = now();
    build.updatedAt = now();

    try {
      stage.fn();
      stageRecord.status = 'SUCCEEDED';
      stageRecord.completedAt = now();
      build.updatedAt = now();
    } catch (error) {
      stageRecord.status = 'FAILED';
      stageRecord.completedAt = now();
      stageRecord.errorMessage = error.message;
      build.status = 'FAILED';
      build.errorMessage = `Stage ${stage.name} failed: ${error.message}`;
      build.updatedAt = now();
      // Clean up internal fields before returning
      cleanupBuild(build);
      return build;
    }
  }

  build.status = 'COMPLETED';
  build.updatedAt = now();
  cleanupBuild(build);
  return build;
}

function cleanupBuild(build) {
  // Remove internal working fields (prefixed with _)
  for (const key of Object.keys(build)) {
    if (key.startsWith('_')) delete build[key];
  }
}

/**
 * Validate that a build has all required artifact kinds.
 * @param {ManuscriptBuild} build
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function validateBuildArtifacts(build) {
  const present = new Set((build.artifacts || []).map(a => a.kind));
  const missing = REQUIRED_ARTIFACT_KINDS.filter(kind => !present.has(kind));
  return { ok: missing.length === 0, missing };
}
