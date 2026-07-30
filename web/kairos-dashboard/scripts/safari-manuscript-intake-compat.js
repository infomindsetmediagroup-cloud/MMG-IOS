const BUILD = "safari-manuscript-intake-compat-20260730-12-five-center";
const DOCX_EXTRACTOR_BUILD = "kairos-native-docx-extractor-20260730-1";
const API_GET_TIMEOUT_MS = 12000;
const API_MUTATION_TIMEOUT_MS = 45000;
const DOCX_MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const DOCX_MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const WORDPROCESSING_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const ROUTE_MODE = new URLSearchParams(globalThis.location?.search || "").get("mode");
const EXECUTIVE_MODE = ROUTE_MODE === "executive";
const ADVANCED_MODE = ROUTE_MODE === "advanced";
const COMMAND_HUB_MODE = !EXECUTIVE_MODE;

installRandomUUIDFallback();
installSyntheticFileFallback();
installDigestIdentifierFallback();
installGovernedFetchTimeout();
installNativeDocxExtractor();

if (EXECUTIVE_MODE) {
  document.documentElement.dataset.kairosMode = "executive";
  activateExecutiveOperatingSystem();
} else {
  document.documentElement.dataset.kairosMode = ADVANCED_MODE ? "advanced" : "command";
}

window.KairosSafariManuscriptIntakeCompat = Object.freeze({
  ready: true,
  build: BUILD,
  docxExtractorBuild: DOCX_EXTRACTOR_BUILD,
  routeMode: ROUTE_MODE || "command",
  commandHubMode: COMMAND_HUB_MODE,
  executiveMode: EXECUTIVE_MODE,
  advancedMode: ADVANCED_MODE,
});

function activateExecutiveOperatingSystem() {
  if (document.querySelector("#kairos-executive-os")) {
    activateBrowserLayers();
    return;
  }
  import("./executive-os.js?v=browser-finish-20260729-5")
    .then(activateBrowserLayers)
    .catch(error => {
      console.error("Kairos Executive OS failed to activate.", error);
      document.body.classList.remove("abos-active");
      window.dispatchEvent(new CustomEvent("kairos:executive-os:error", {
        detail: { message: String(error?.message || "Executive OS activation failed.") },
      }));
    });
}

function activateBrowserLayers() {
  activateLiveExecutionDetails();
  activateSuccessFeedback();
}

function activateLiveExecutionDetails() {
  if (document.querySelector('script[data-kairos-live-details]')) return;
  const script = document.createElement("script");
  script.type = "module";
  script.src = "./scripts/executive-os-live-details.js?v=20260729-4";
  script.dataset.kairosLiveDetails = "true";
  document.body.append(script);
}

function activateSuccessFeedback() {
  if (document.querySelector('script[data-kairos-feedback]')) return;
  const script = document.createElement("script");
  script.type = "module";
  script.src = "./scripts/executive-os-feedback.js?v=20260729-1";
  script.dataset.kairosFeedback = "true";
  document.body.append(script);
}

function installGovernedFetchTimeout() {
  const nativeFetch = globalThis.fetch;
  if (typeof nativeFetch !== "function" || nativeFetch.__kairosGovernedTimeout === true) return;

  const wrappedFetch = function kairosGovernedFetch(input, init = {}) {
    if (!isGovernedAPIRequest(input) || init?.signal) return nativeFetch.call(globalThis, input, init);

    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const timeoutMs = method === "GET" || method === "HEAD" ? API_GET_TIMEOUT_MS : API_MUTATION_TIMEOUT_MS;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timeoutID;

    const request = nativeFetch.call(globalThis, input, controller ? { ...init, signal: controller.signal } : init);
    const deadline = new Promise((_, reject) => {
      timeoutID = setTimeout(() => {
        try { controller?.abort(); } catch {}
        const error = new Error(`Kairos request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
        error.name = "TimeoutError";
        reject(error);
      }, timeoutMs);
    });

    return Promise.race([request, deadline]).finally(() => clearTimeout(timeoutID));
  };

  try { Object.defineProperty(wrappedFetch, "__kairosGovernedTimeout", { value: true }); }
  catch { wrappedFetch.__kairosGovernedTimeout = true; }

  try { globalThis.fetch = wrappedFetch; }
  catch (error) { console.error("Kairos could not install the governed request timeout.", error); }
}

function isGovernedAPIRequest(input) {
  try {
    const raw = typeof input === "string" ? input : input?.url;
    if (!raw) return false;
    const url = new URL(raw, globalThis.location?.href || "https://kairos.invalid/");
    return url.origin === globalThis.location?.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function installRandomUUIDFallback() {
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject) return;
  let usable = false;
  try {
    usable = typeof cryptoObject.randomUUID === "function" && /^[0-9a-f-]{36}$/i.test(cryptoObject.randomUUID());
  } catch {}
  if (usable) return;
  const fallback = () => {
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0,4).join("")}-${hex.slice(4,6).join("")}-${hex.slice(6,8).join("")}-${hex.slice(8,10).join("")}-${hex.slice(10).join("")}`;
  };
  try { Object.defineProperty(cryptoObject, "randomUUID", { configurable: true, value: fallback }); }
  catch { try { cryptoObject.randomUUID = fallback; } catch {} }
}

function installSyntheticFileFallback() {
  let usable = false;
  try {
    const probe = new File(["x"], "kairos-probe.txt", { type: "text/plain" });
    usable = probe.name === "kairos-probe.txt" && probe.size === 1;
  } catch {}
  if (usable) return;
  const NativeBlob = globalThis.Blob;
  if (typeof NativeBlob !== "function") return;
  function SafariSafeFile(parts, name, options = {}) {
    const blob = new NativeBlob(parts, options);
    const filename = String(name || "manuscript.txt").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-");
    try {
      Object.defineProperties(blob, {
        name: { configurable: true, enumerable: true, value: filename },
        lastModified: { configurable: true, enumerable: true, value: Number(options.lastModified || Date.now()) },
      });
    } catch {
      blob.name = filename;
      blob.lastModified = Number(options.lastModified || Date.now());
    }
    return blob;
  }
  SafariSafeFile.prototype = NativeBlob.prototype;
  try { Object.defineProperty(globalThis, "File", { configurable: true, writable: true, value: SafariSafeFile }); }
  catch { try { globalThis.File = SafariSafeFile; } catch {} }
}

function installDigestIdentifierFallback() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function" || subtle.digest.__kairosDigestIdentifierFallback === true) return;
  const nativeDigest = subtle.digest.bind(subtle);

  const wrappedDigest = async (algorithm, data) => {
    try {
      return await nativeDigest(algorithm, data);
    } catch (primaryError) {
      const alternate = typeof algorithm === "string"
        ? { name: algorithm }
        : typeof algorithm?.name === "string"
          ? algorithm.name
          : null;
      if (!alternate) throw primaryError;
      try {
        return await nativeDigest(alternate, data);
      } catch {
        throw primaryError;
      }
    }
  };

  try { Object.defineProperty(wrappedDigest, "__kairosDigestIdentifierFallback", { value: true }); }
  catch { wrappedDigest.__kairosDigestIdentifierFallback = true; }

  try { Object.defineProperty(subtle, "digest", { configurable: true, value: wrappedDigest }); }
  catch { try { subtle.digest = wrappedDigest; } catch {} }
}

function installNativeDocxExtractor() {
  const existing = globalThis.KairosDocxExtractor;
  const extractor = existing?.extractRawText
    ? existing
    : Object.freeze({
        build: DOCX_EXTRACTOR_BUILD,
        ready: true,
        local: true,
        extractRawText: extractDocxRawText,
      });

  if (!existing?.extractRawText) {
    try { Object.defineProperty(globalThis, "KairosDocxExtractor", { configurable: true, value: extractor }); }
    catch { globalThis.KairosDocxExtractor = extractor; }
  }

  if (!globalThis.__KAIROS_MAMMOTH_TEST_MODULE__) {
    try { Object.defineProperty(globalThis, "__KAIROS_MAMMOTH_TEST_MODULE__", { configurable: true, value: extractor }); }
    catch { globalThis.__KAIROS_MAMMOTH_TEST_MODULE__ = extractor; }
  }
}

async function extractDocxRawText(input = {}) {
  const buffer = normalizeArrayBuffer(input.arrayBuffer);
  if (!buffer) throw new Error("The DOCX extractor did not receive a readable file buffer.");
  if (buffer.byteLength > DOCX_MAX_ARCHIVE_BYTES) {
    throw new Error(`The DOCX file is larger than the ${Math.round(DOCX_MAX_ARCHIVE_BYTES / 1024 / 1024)} MB extraction limit.`);
  }

  const archive = new Uint8Array(buffer);
  const directory = readZipDirectory(archive);
  const documentEntry = directory.get("word/document.xml");
  if (!documentEntry) throw new Error("The DOCX package does not contain word/document.xml.");

  const targets = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"];
  const sections = [];
  for (const name of targets) {
    const entry = directory.get(name);
    if (!entry) continue;
    const xmlBytes = await readZipEntry(archive, entry);
    const xml = new TextDecoder("utf-8").decode(xmlBytes);
    const text = extractWordprocessingText(xml);
    if (text) sections.push(text);
  }

  return {
    value: sections.join("\n\n").trim(),
    messages: [],
    build: DOCX_EXTRACTOR_BUILD,
    local: true,
  };
}

function normalizeArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  return null;
}

function readZipDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const directorySize = view.getUint32(eocdOffset + 12, true);
  const directoryOffset = view.getUint32(eocdOffset + 16, true);

  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error("ZIP64 DOCX files are not supported by the mobile extractor.");
  }
  if (directoryOffset + directorySize > bytes.byteLength) {
    throw new Error("The DOCX central directory is incomplete.");
  }

  const entries = new Map();
  const decoder = new TextDecoder("utf-8");
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("The DOCX central directory contains an invalid file header.");
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const filenameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const filenameStart = cursor + 46;
    const filenameEnd = filenameStart + filenameLength;
    if (filenameEnd > bytes.byteLength) throw new Error("The DOCX filename table is incomplete.");

    const filename = decoder.decode(bytes.subarray(filenameStart, filenameEnd)).replace(/\\/g, "/");
    if (uncompressedSize > DOCX_MAX_ENTRY_BYTES) {
      throw new Error(`The DOCX entry ${filename || "(unnamed)"} exceeds the safe extraction limit.`);
    }

    entries.set(filename, {
      filename,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor = filenameEnd + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(view) {
  const minimumOffset = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("The selected file is not a complete DOCX ZIP package.");
}

async function readZipEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.byteLength || view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error(`The DOCX entry ${entry.filename} has an invalid local header.`);
  }

  const filenameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + filenameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.byteLength) throw new Error(`The DOCX entry ${entry.filename} is incomplete.`);

  const compressed = bytes.slice(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod !== 8) {
    throw new Error(`The DOCX entry ${entry.filename} uses unsupported ZIP compression method ${entry.compressionMethod}.`);
  }
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser does not provide the local DEFLATE decoder required for DOCX extraction.");
  }

  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const output = new Uint8Array(await new Response(stream).arrayBuffer());
  if (output.byteLength > DOCX_MAX_ENTRY_BYTES) {
    throw new Error(`The DOCX entry ${entry.filename} expanded beyond the safe extraction limit.`);
  }
  if (entry.uncompressedSize && output.byteLength !== entry.uncompressedSize) {
    throw new Error(`The DOCX entry ${entry.filename} did not decompress to its declared size.`);
  }
  return output;
}

function extractWordprocessingText(xml) {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  if (documentNode.querySelector("parsererror")) {
    throw new Error("The DOCX document XML could not be parsed.");
  }

  const paragraphs = documentNode.getElementsByTagNameNS(WORDPROCESSING_NAMESPACE, "p");
  const lines = [];
  for (const paragraph of paragraphs) {
    const text = collectWordprocessingText(paragraph)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd();
    if (text.trim()) lines.push(text);
  }
  return lines.join("\n\n").trim();
}

function collectWordprocessingText(node) {
  let output = "";
  for (const child of node.childNodes) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const name = child.localName;
    if (name === "t" || name === "instrText") output += child.textContent || "";
    else if (name === "tab" || name === "ptab") output += "\t";
    else if (name === "br" || name === "cr") output += "\n";
    else if (name === "noBreakHyphen") output += "\u2011";
    else if (name === "softHyphen") output += "\u00ad";
    else output += collectWordprocessingText(child);
  }
  return output;
}
