const BUILD = "kairos-homepage-session-reset-20260717-1";
const MARKER = "kairos.homepage.session-migration.v5";

try {
  if (sessionStorage.getItem(MARKER) !== BUILD) {
    for (const key of [
      "kairos.homepage.quick-action.v4",
      "kairos.homepage.quick-action.v3",
      "kairos.homepage.quick-action.v2",
    ]) sessionStorage.removeItem(key);
    sessionStorage.setItem(MARKER, BUILD);
  }
} catch {}

window.KairosHomepageSessionReset = { build: BUILD };
