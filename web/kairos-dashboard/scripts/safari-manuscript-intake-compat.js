const BUILD = "safari-manuscript-intake-compat-20260730-11-docx";
const API_GET_TIMEOUT_MS = 12000;
const API_MUTATION_TIMEOUT_MS = 45000;
const ADVANCED_MODE = new URLSearchParams(globalThis.location?.search || "").get("mode") === "advanced";

installRandomUUIDFallback();
installSyntheticFileFallback();
installDigestIdentifierFallback();
installGovernedFetchTimeout();

if (ADVANCED_MODE) {
  document.documentElement.dataset.kairosMode = "advanced";
  try {
    await import("./manuscript-docx-upload-hotfix.js?v=docx-export-resolver-20260730-1");
  } catch (error) {
    console.error("Kairos DOCX upload compatibility failed to activate.", error);
    window.dispatchEvent(new CustomEvent("kairos:manuscript-docx:error", {
      detail: { message: String(error?.message || "DOCX upload compatibility failed to activate.") },
    }));
  }
} else {
  document.documentElement.dataset.kairosMode = "executive";
  activateExecutiveOperatingSystem();
}

window.KairosSafariManuscriptIntakeCompat = Object.freeze({
  ready: true,
  build: BUILD,
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
