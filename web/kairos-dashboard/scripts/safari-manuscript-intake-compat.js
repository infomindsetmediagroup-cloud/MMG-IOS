const BUILD = "safari-manuscript-intake-compat-20260725-1";

installRandomUUIDFallback();
installSyntheticFileFallback();
installDigestIdentifierFallback();

window.KairosSafariManuscriptIntakeCompat = Object.freeze({ ready: true, build: BUILD });

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
  if (!subtle || typeof subtle.digest !== "function") return;
  const nativeDigest = subtle.digest.bind(subtle);
  try {
    subtle.digest = (algorithm, data) => {
      const normalized = typeof algorithm === "string" ? { name: algorithm } : algorithm;
      return nativeDigest(normalized, data);
    };
  } catch {}
}
