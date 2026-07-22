const BUILD = "kairos-deliverable-manufacturing-20260722-1";

export class DeliverableManufacturingError extends Error {
  constructor(code, message, requiresHumanReview = false, retryable = true) {
    super(message);
    this.name = "DeliverableManufacturingError";
    this.code = code;
    this.requiresHumanReview = requiresHumanReview;
    this.retryable = retryable;
  }
}

export async function manufactureDeliverables(state, project) {
  const normalizedArtifact = project.artifacts.find((artifact) => artifact.kind === "NORMALIZED_MANUSCRIPT");
  const metadataArtifact = project.artifacts.find((artifact) => artifact.kind === "METADATA_INFERENCE");
  const qaArtifact = project.artifacts.find((artifact) => artifact.kind === "QA_REPORT");
  const coverAsset = project.sourceAssets.find((asset) => asset.role === "COVER_SOURCE");

  if (!normalizedArtifact || !metadataArtifact || !qaArtifact || !coverAsset) {
    throw new DeliverableManufacturingError(
      "deliverable_inputs_incomplete",
      "Normalized manuscript, metadata inference, QA report, and cover source are required.",
      false,
      true,
    );
  }

  const manuscriptBytes = await state.storage.get(normalizedArtifact.storageKey);
  const metadataBytes = await state.storage.get(metadataArtifact.storageKey);
  const qaBytes = await state.storage.get(qaArtifact.storageKey);
  if (!manuscriptBytes || !metadataBytes || !qaBytes) {
    throw new DeliverableManufacturingError(
      "deliverable_inputs_unavailable",
      "One or more required publishing artifacts are unavailable.",
      false,
      true,
    );
  }

  const manuscript = decodeText(manuscriptBytes).trim();
  const metadataRecord = parseJSONBytes(metadataBytes, "metadata_inference_invalid");
  const qaRecord = parseJSONBytes(qaBytes, "qa_report_invalid");
  const metadata = metadataRecord.metadata || project.metadata || {};

  if (!manuscript) {
    throw new DeliverableManufacturingError("normalized_manuscript_empty", "Normalized manuscript is empty.", true, false);
  }
  if (qaRecord.requiresHumanReview || (qaRecord.blockers || []).length > 0) {
    throw new DeliverableManufacturingError(
      "editorial_clearance_missing",
      "Editorial clearance is required before deliverable manufacturing.",
      true,
      true,
    );
  }

  const title = clean(metadata.title || metadata.workingTitle || "Untitled Digital Guide", 180);
  const subtitle = clean(metadata.subtitle || "", 220);
  const author = clean(metadata.author || "Mindset Media Group", 160);
  const handle = slugify(title);
  const generatedAt = new Date().toISOString();

  const editableMarkdown = buildEditableMarkdown({ title, subtitle, author, manuscript });
  const finalHtml = buildFinalHtml({ title, subtitle, author, manuscript });
  const customerReadme = buildCustomerReadme({ title, author, generatedAt });
  const rightsDeclaration = buildRightsDeclaration({ project, title, author, generatedAt });
  const storefrontImageContract = buildStorefrontImageContract({ project, coverAsset, title, generatedAt });
  const shopifyMetadata = buildShopifyMetadata({ title, subtitle, author, metadata, handle });

  const outputs = [
    ["EDITABLE_MANUSCRIPT", `${handle}-editable.md`, "text/markdown", editableMarkdown],
    ["FINAL_MANUSCRIPT", `${handle}-final.html`, "text/html", finalHtml],
    ["CUSTOMER_README", "README.txt", "text/plain", customerReadme],
    ["RIGHTS_DECLARATION", "rights-declaration.json", "application/json", JSON.stringify(rightsDeclaration, null, 2)],
    ["STOREFRONT_PRODUCT_IMAGE", "storefront-image-contract.json", "application/json", JSON.stringify(storefrontImageContract, null, 2)],
    ["PRODUCT_METADATA", "shopify-product-metadata.json", "application/json", JSON.stringify(shopifyMetadata, null, 2)],
  ];

  const artifacts = [];
  for (const [kind, filename, mimeType, content] of outputs) {
    artifacts.push(await storeArtifact(state, project.id, kind, filename, mimeType, content));
  }

  const qa = validateManufacturedArtifacts({ artifacts, shopifyMetadata, storefrontImageContract, rightsDeclaration });
  if (!qa.ok) {
    throw new DeliverableManufacturingError(
      "deliverable_qa_failed",
      `Deliverable QA failed: ${qa.errors.join("; ")}`,
      true,
      true,
    );
  }

  return {
    build: BUILD,
    generatedAt,
    artifacts,
    shopifyMetadata,
    storefrontImageContract,
    rightsDeclaration,
    qa,
  };
}

export function buildShopifyMetadata({ title, subtitle, author, metadata, handle }) {
  const summary = clean(metadata.summary || `A practical digital resource from ${author}.`, 1000);
  const audience = clean(metadata.intendedAudience || "creators, entrepreneurs, and independent builders", 220);
  const keywords = Array.isArray(metadata.keywords) ? metadata.keywords.slice(0, 12).map((value) => clean(value, 60)).filter(Boolean) : [];
  const descriptionHtml = [
    `<p><strong>${escapeHtml(title)}</strong>${subtitle ? ` — ${escapeHtml(subtitle)}` : ""} is a practical digital resource designed for ${escapeHtml(audience)}.</p>`,
    `<p>${escapeHtml(summary)}</p>`,
    "<h2>What’s included</h2>",
    "<ul><li>Final customer-ready digital manuscript</li><li>Clear customer access and usage instructions</li></ul>",
    "<p><strong>Knowledge grows when it’s shared. Opportunity grows when doors are opened.</strong></p>",
  ].join("");
  const seoTitle = truncate(`${title} | Mindset Media Group`, 70);
  const metaDescription = truncate(`${summary} Built for ${audience}.`, 155);

  return {
    schemaVersion: "1.0.0",
    title,
    handle,
    descriptionHtml,
    seoTitle,
    metaDescription,
    socialTitle: truncate(title, 70),
    socialDescription: truncate(metaDescription, 155),
    vendor: "Mindset Media Group",
    productType: "Digital Product",
    status: "DRAFT",
    tags: [
      "Digital Product",
      "Mindset Media Group",
      "Kairos Fulfillment",
      ...keywords,
    ],
    requiresShipping: false,
    taxable: false,
    liveMutationAuthorized: false,
  };
}

export function buildStorefrontImageContract({ project, coverAsset, title, generatedAt }) {
  return {
    schemaVersion: "1.0.0",
    projectId: project.id,
    sourceAssetId: coverAsset.id,
    sourceFilename: coverAsset.filename,
    sourceMimeType: coverAsset.mimeType,
    sourceSha256: coverAsset.sha256,
    generatedAt,
    title,
    transformationAuthorized: false,
    requiredOutputs: [
      {
        role: "PRIMARY_PRODUCT_IMAGE",
        width: 2048,
        height: 3072,
        aspectRatio: "2:3",
        fit: "contain",
        croppingAllowed: false,
        redrawingAllowed: false,
        format: "png",
      },
      {
        role: "SOCIAL_SQUARE",
        width: 2048,
        height: 2048,
        fit: "contain",
        croppingAllowed: false,
        redrawingAllowed: false,
        format: "png",
      },
    ],
    reviewRequiredBeforeTransformation: true,
  };
}

export function validateManufacturedArtifacts({ artifacts, shopifyMetadata, storefrontImageContract, rightsDeclaration }) {
  const errors = [];
  const requiredKinds = [
    "EDITABLE_MANUSCRIPT",
    "FINAL_MANUSCRIPT",
    "CUSTOMER_README",
    "RIGHTS_DECLARATION",
    "STOREFRONT_PRODUCT_IMAGE",
    "PRODUCT_METADATA",
  ];
  const kinds = new Set(artifacts.map((artifact) => artifact.kind));
  for (const kind of requiredKinds) if (!kinds.has(kind)) errors.push(`missing artifact ${kind}`);
  for (const artifact of artifacts) {
    if (!/^[a-f0-9]{64}$/i.test(artifact.sha256)) errors.push(`${artifact.kind} checksum is invalid`);
    if (!artifact.byteSize) errors.push(`${artifact.kind} is empty`);
  }
  if (shopifyMetadata.status !== "DRAFT") errors.push("Shopify status must remain DRAFT");
  if (shopifyMetadata.liveMutationAuthorized !== false) errors.push("live Shopify mutation must remain unauthorized");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shopifyMetadata.handle)) errors.push("Shopify handle is invalid");
  if (storefrontImageContract.transformationAuthorized !== false) errors.push("cover transformation must remain approval-gated");
  if (rightsDeclaration.livePublicationAuthorized !== false) errors.push("rights declaration cannot authorize live publication");
  return { ok: errors.length === 0, errors };
}

function buildEditableMarkdown({ title, subtitle, author, manuscript }) {
  return [`# ${title}`, subtitle ? `## ${subtitle}` : "", `**Author:** ${author}`, "", manuscript, ""].filter((line, index, list) => line || list[index - 1] !== "").join("\n");
}

function buildFinalHtml({ title, subtitle, author, manuscript }) {
  const body = markdownToHtml(manuscript);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body><article><header><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}<p>By ${escapeHtml(author)}</p></header>${body}</article></body></html>`;
}

function buildCustomerReadme({ title, author, generatedAt }) {
  return `${title}\nBy ${author}\n\nYour digital product package was prepared by Kairos for Mindset Media Group.\n\nIncluded files:\n- Editable Markdown manuscript\n- Final HTML manuscript\n- Product metadata\n- Rights declaration\n- Storefront image production contract\n\nGenerated: ${generatedAt}\nSupport: https://themindsetmediagroup.com/pages/customer-service\n`;
}

function buildRightsDeclaration({ project, title, author, generatedAt }) {
  return {
    schemaVersion: "1.0.0",
    projectId: project.id,
    title,
    author,
    generatedAt,
    sourceAssetIds: project.sourceAssets.map((asset) => asset.id),
    declarationStatus: "REQUIRES_OWNER_CONFIRMATION",
    ownerMustConfirm: [
      "The manuscript may be reproduced and sold.",
      "The cover image may be used commercially.",
      "All third-party material is licensed or otherwise authorized.",
    ],
    livePublicationAuthorized: false,
  };
}

function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  const html = [];
  let listOpen = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^[-*+]\s+/.test(line)) {
      if (!listOpen) { html.push("<ul>"); listOpen = true; }
      html.push(`<li>${escapeHtml(line.replace(/^[-*+]\s+/, ""))}</li>`);
      continue;
    }
    if (listOpen) { html.push("</ul>"); listOpen = false; }
    if (!line) continue;
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) html.push(`<h${heading[1].length}>${escapeHtml(heading[2])}</h${heading[1].length}>`);
    else html.push(`<p>${escapeHtml(line)}</p>`);
  }
  if (listOpen) html.push("</ul>");
  return html.join("");
}

async function storeArtifact(state, projectId, kind, filename, mimeType, content) {
  const bytes = new TextEncoder().encode(content);
  const id = crypto.randomUUID();
  const storageKey = `publishing:artifact:${id}`;
  const sha256 = await digestHex(bytes);
  const artifact = {
    id,
    projectId,
    kind,
    filename,
    mimeType,
    byteSize: bytes.byteLength,
    sha256,
    storageKey,
    createdAt: new Date().toISOString(),
    build: BUILD,
  };
  await state.storage.put(storageKey, bytes);
  return artifact;
}

function decodeText(value) {
  if (value instanceof Uint8Array) return new TextDecoder("utf-8", { fatal: true }).decode(value);
  if (value instanceof ArrayBuffer) return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(value));
  return String(value || "");
}

function parseJSONBytes(value, code) {
  try { return JSON.parse(decodeText(value)); }
  catch { throw new DeliverableManufacturingError(code, "Stored publishing JSON is invalid.", true, false); }
}

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function slugify(value) {
  const slug = String(value || "digital-product").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return slug || "digital-product";
}

function truncate(value, max) {
  const text = clean(value, max + 20);
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
