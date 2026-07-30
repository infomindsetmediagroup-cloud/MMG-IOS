const BUILD = "manuscript-runtime-cache-guard-20260730-1";
const MANUSCRIPT_RELEASE = "manuscript-upload-retention-20260730-1";
const advancedMode = new URLSearchParams(window.location.search).get("mode") === "advanced";

let installed = false;

if (advancedMode) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
  if (descriptor?.configurable && descriptor.get && descriptor.set) {
    installed = true;
    const restore = () => {
      try {
        Object.defineProperty(HTMLScriptElement.prototype, "src", descriptor);
      } catch {
        // The cache guard is best effort after the manuscript module URL is rewritten.
      }
    };

    Object.defineProperty(HTMLScriptElement.prototype, "src", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        let nextValue = value;
        let matched = false;
        try {
          const url = new URL(String(value), window.location.href);
          if (url.pathname.endsWith("/scripts/manuscript-studio.js")) {
            url.searchParams.set("v", MANUSCRIPT_RELEASE);
            nextValue = url.href;
            matched = true;
          }
        } catch {
          // Preserve the browser-native URL assignment for unrelated script values.
        }
        descriptor.set.call(this, nextValue);
        if (matched) queueMicrotask(restore);
      },
    });
  }
}

window.KairosManuscriptRuntimeCacheGuard = Object.freeze({
  build: BUILD,
  release: MANUSCRIPT_RELEASE,
  advancedMode,
  installed,
});
