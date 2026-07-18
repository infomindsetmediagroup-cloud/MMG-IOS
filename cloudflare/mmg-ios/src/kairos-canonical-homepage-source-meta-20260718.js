export const KAIROS_CANONICAL_HOMEPAGE_BUILD = "kairos-canonical-homepage-builder-20260718-2";

export const BUILD_PATH = "/api/shopify/staging/canonical-homepage/build";
export const STAGING_CONFIRMATION = "BUILD_CANONICAL_MMG_HOMEPAGE_STAGING";
export const PUBLISH_CONFIRMATION = "PUBLISH_CANONICAL_MMG_HOMEPAGE_LIVE";
export const TEMPLATE_FILE = "templates/index.json";
export const SECTION_FILE = "sections/mmg-canonical-homepage.liquid";
export const CSS_FILE = "assets/mmg-canonical-homepage.css";
export const JS_FILE = "assets/mmg-canonical-homepage.js";
export const MANAGED_FILES = [TEMPLATE_FILE, SECTION_FILE, CSS_FILE, JS_FILE];

export const TEMPLATE_SOURCE = JSON.stringify({
  sections: {
    mmg_canonical_homepage: {
      type: "mmg-canonical-homepage",
      settings: {},
    },
  },
  order: ["mmg_canonical_homepage"],
}, null, 2);