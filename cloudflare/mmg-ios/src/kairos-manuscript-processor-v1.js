import { unzipSync, strFromU8 } from "fflate";

const BUILD = "kairos-manuscript-processor-20260722-1";
const MAX_NORMALIZED_CHARACTERS = 8_000_000;

export class ManuscriptProcessingError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "ManuscriptProcessingError";
    this.code = code;
    this.requiresHumanReview = options.requiresHumanReview === true;
    this.retryable = options.retryable !== false;
  }
}

export async function processManuscriptSource(state, project) {
  const source = project.sourceAssets.find((asset) => asset.role === "MANUSCRIPT_SOURCE");
  if (!source) {
    throw new ManuscriptProcessingError("manuscript_source_missing", "A manuscript source asset is required.");
  }

  const stored = await state.storage.get(source.storageKey);
  if (!stored) {
    throw new ManuscriptProcessingError(
      "manuscript_bytes_missing",
      "The manuscript source record exists, but its immutable bytes are unavailable.",
      { retryable: false },
    );
  }

  const bytes = toUint8Array(stored);
  const extracted = await extractManuscript(bytes, source.mimeType);
  const normalized = normalizeManuscript(extracted.text);

  if (!normalized.text) {
    throw new ManuscriptProcessingError(
      "manuscript_text_empty",
      "No usable manuscript text was extracted.",
      { requiresHumanReview: true },
    );
  }

  const encoded = new TextEncoder().encode(normalized.text);
  const sha256 = await digestHex(encoded);
  const artifactId = crypto.randomUUID();
  const storageKey = `publishing:artifact:${artifactId}`;
  const createdAt = new Date().toISOString();
  const filename = normalizedFilename(source.filename);
  const artifact = {
    id: artifactId,
    projectId: project.id,
    kind: "NORMALIZED_MANUSCRIPT",
    filename,
    mimeType: "text/markdown",
    byteSize: encoded.byteLength,
    sha256,
    storageKey,
    createdAt,
    sourceAssetId: source.id,
    extraction: {
      processorBuild: BUILD,
      sourceMimeType: source.mimeType,
      method: extracted.method,
      characterCount: normalized.text.length,
      wordCount: normalized.wordCount,
      paragraphCount: normalized.paragraphCount,
      headingCount: normalized.headingCount,
      warnings: extracted.warnings,
    },
  };

  await state.storage.put(storageKey, encoded);
  return { artifact, normalizedText: normalized.text, report: artifact.extraction };
}

export async function extractManuscript(bytes, mimeType) {
  switch (mimeType) {
    case "text/plain":
      return { text: decodeUTF8(bytes), method: "utf8-text", warnings: [] };
    case "text/markdown":
      return { text: decodeUTF8(bytes), method: "markdown-source", warnings: [] };
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDOCX(bytes);
    case "application/pdf":
      return extractPDF(bytes);
    default:
      throw new ManuscriptProcessingError("unsupported_manuscript_type", `Unsupported manuscript MIME type: ${mimeType}.`, {
        retryable: false,
      });
  }
}

export function normalizeManuscript(value) {
  let text = String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .normalize("NFC")
    .replace(/[\u0000\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  if (text.length > MAX_NORMALIZED_CHARACTERS) {
    throw new ManuscriptProcessingError(
      "manuscript_text_too_large",
      `Normalized manuscript exceeds ${MAX_NORMALIZED_CHARACTERS.toLocaleString()} characters.`,
      { requiresHumanReview: true },
    );
  }

  const paragraphs = text ? text.split(/\n\s*\n/).filter(Boolean) : [];
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) || [];
  const headings = text.match(/^#{1,6}\s+.+$/gm) || [];

  return {
    text,
    wordCount: words.length,
    paragraphCount: paragraphs.length,
    headingCount: headings.length,
  };
}

function extractDOCX(bytes) {
  let archive;
  try {
    archive = unzipSync(bytes);
  } catch {
    throw new ManuscriptProcessingError("docx_archive_invalid", "The DOCX file is not a readable Open XML archive.", {
      requiresHumanReview: true,
    });
  }

  const document = archive["word/document.xml"];
  if (!document) {
    throw new ManuscriptProcessingError("docx_document_missing", "The DOCX archive does not contain word/document.xml.", {
      requiresHumanReview: true,
      retryable: false,
    });
  }

  let xml = strFromU8(document);
  xml = xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, "")
    .replace(/<[^>]+>/g, "");

  const text = decodeXMLEntities(xml);
  const warnings = [];
  if (archive["word/comments.xml"]) warnings.push("DOCX comments were not included in normalized manuscript text.");
  if (archive["word/footnotes.xml"]) warnings.push("DOCX footnotes require a later structured-content pass.");
  if (archive["word/endnotes.xml"]) warnings.push("DOCX endnotes require a later structured-content pass.");

  return { text, method: "docx-openxml", warnings };
}

function extractPDF(bytes) {
  const source = new TextDecoder("latin1").decode(bytes);
  if (!source.startsWith("%PDF-")) {
    throw new ManuscriptProcessingError("pdf_signature_invalid", "The uploaded file does not have a valid PDF signature.", {
      requiresHumanReview: true,
    });
  }
  if (/\/Encrypt\b/.test(source)) {
    throw new ManuscriptProcessingError("pdf_encrypted", "Encrypted PDF manuscripts must be unlocked before processing.", {
      requiresHumanReview: true,
      retryable: false,
    });
  }

  const blocks = source.match(/BT[\s\S]*?ET/g) || [];
  const lines = [];
  for (const block of blocks) {
    const fragments = [];
    const tokenPattern = /\((?:\\.|[^\\)])*\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj|\[(.*?)\]\s*TJ|\bT\*\b|[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+\s+Td\b/gs;
    let match;
    while ((match = tokenPattern.exec(block))) {
      const token = match[0];
      if (/\bT\*\b|\bTd\b/.test(token)) {
        fragments.push("\n");
      } else if (token.startsWith("(")) {
        fragments.push(decodePDFLiteral(token.slice(1, token.lastIndexOf(")"))));
      } else if (token.startsWith("<")) {
        fragments.push(decodePDFHex(match[1] || ""));
      } else if (token.startsWith("[")) {
        const array = match[2] || "";
        const parts = array.match(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>|-?\d+(?:\.\d+)?/g) || [];
        for (const part of parts) {
          if (part.startsWith("(")) fragments.push(decodePDFLiteral(part.slice(1, -1)));
          else if (part.startsWith("<")) fragments.push(decodePDFHex(part.slice(1, -1)));
          else if (Number(part) < -120) fragments.push(" ");
        }
      }
    }
    const line = fragments.join("").replace(/[ \t]+\n/g, "\n").trim();
    if (line) lines.push(line);
  }

  if (!lines.length) {
    throw new ManuscriptProcessingError(
      "pdf_text_unavailable",
      "No extractable PDF text was found. The PDF may be scanned, image-only, font-encoded, or stream-compressed and requires human review or OCR.",
      { requiresHumanReview: true },
    );
  }

  return {
    text: lines.join("\n\n"),
    method: "pdf-text-operators",
    warnings: ["PDF extraction preserves readable text but may not preserve complex page layout."],
  };
}

function decodePDFLiteral(value) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, code) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" })[code])
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\\r?\n/g, "");
}

function decodePDFHex(value) {
  const clean = value.replace(/\s+/g, "");
  const padded = clean.length % 2 ? `${clean}0` : clean;
  const bytes = new Uint8Array(padded.length / 2);
  for (let index = 0; index < padded.length; index += 2) bytes[index / 2] = parseInt(padded.slice(index, index + 2), 16);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let output = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) output += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    return output;
  }
  return new TextDecoder("latin1").decode(bytes);
}

function decodeXMLEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function decodeUTF8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ManuscriptProcessingError("text_encoding_invalid", "Text manuscripts must use valid UTF-8 encoding.", {
      requiresHumanReview: true,
    });
  }
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return new Uint8Array(value);
  throw new ManuscriptProcessingError("manuscript_storage_invalid", "Stored manuscript bytes are invalid.", {
    retryable: false,
  });
}

function normalizedFilename(sourceFilename) {
  const stem = String(sourceFilename || "manuscript").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${stem || "manuscript"}-normalized.md`;
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
