import { inspectWebsiteRetoolSchema } from "./kairos-website-retool-schema-inspector-v1.js";

const BUILD = "kairos-website-retool-exception-planner-20260717-4";
const LOGO_ASSET_KEYS = new Set(["logo", "logo_image", "header_logo", "custom_logo"]);
const ALLOWED_CATEGORIES = new Set([
  "header-branding",
  "footer-payment",
  "footer-attribution",
  "visual-color",
  "layout-exception-candidate",
  "visibility-or-content",
]);

export async function prepareWebsiteRetoolExceptions(request, env) {
  const report = await inspectWebsiteRetoolSchema(request, env);
  const verifiedThemeSchemes = collectVerifiedThemeSchemes(report);
  const candidates = [];
  for (const file of report.inventory || []) {
    for (const setting of file.candidateSettings || []) {
      if (!ALLOWED_CATEGORIES.has(setting.category)) continue;
      const decision = classifyWebsiteRetoolCandidate(file.filename, setting);
      if (!decision) continue;
      const allowedValues = decision.requiresVerifiedThemeScheme
        ? verifiedThemeSchemes.map(scheme => ({ ...scheme }))
        : undefined;
      const verifiedSelection = decision.requiresVerifiedThemeScheme
        ? resolveVerifiedScheme(decision, verifiedThemeSchemes)
        : null;
      const proposedValue = verifiedSelection?.value ?? decision.proposedValue;
      const confidence = verifiedSelection ? Math.max(decision.confidence, 0.96) : decision.confidence;
      const rationale = verifiedSelection
        ? `${decision.rationale} Verified selection: ${verifiedSelection.value} uses ${verifiedSelection.background}.`
        : decision.rationale;
      candidates.push({
        filename: file.filename,
        sourceSha256: file.sha256,
        path: setting.path,
        key: setting.key,
        valueType: setting.valueType,
        currentValuePreview: setting.valuePreview,
        category: setting.category,
        authorizedChange: decision.authorizedChange,
        proposedValue,
        confidence,
        requiresExecutiveApproval: decision.requiresExecutiveApproval === true || confidence < 0.95,
        rationale,
        ...(verifiedSelection ? { verifiedSelection } : {}),
        ...(allowedValues?.length ? { allowedValues } : {}),
      });
    }
  }

  const highConfidence = candidates.filter(item => item.confidence >= 0.95);
  const executiveReview = candidates.filter(item => item.confidence < 0.95);
  return {
    status: candidates.length ? "ready-for-review" : "needs-schema-review",
    build: BUILD,
    preparedAt: new Date().toISOString(),
    stagingTheme: report.stagingTheme,
    publishedTheme: report.publishedTheme,
    highConfidence,
    executiveReview,
    verifiedThemeSchemes,
    verifiedColorRecommendations: {
      headerDarkestBlue: pickDarkestVerifiedBlue(verifiedThemeSchemes),
      footerBlack: verifiedThemeSchemes.find(scheme => scheme.background === "#000000") || null,
    },
    liquidEvidence: [...(report.header || []), ...(report.footer || [])]
      .filter(file => file.format === "liquid")
      .map(file => ({ filename: file.filename, sha256: file.sha256, signals: file.liquidSignals })),
    safeguards: {
      stagingOnly: true,
      mutationPerformed: false,
      sourceHashBound: true,
      guessedThemeKeys: false,
      guessedSchemeNames: false,
      verifiedSchemeBackgroundsRequired: true,
      bodyVisualStructureLocked: true,
      liveThemeMutation: false,
    },
  };
}

export function classifyWebsiteRetoolCandidate(filename, setting) {
  const key = String(setting.key || "").toLowerCase();
  const file = String(filename || "").toLowerCase();
  const valueType = setting.valueType;
  const path = Array.isArray(setting.path) ? setting.path : [];
  const settingsDataCurrent = /(^|\/)config\/settings_data\.json$/.test(file) && path[0] === "current";
  const headerGroupSetting = /(^|\/)sections\/header[^/]*\.json$/.test(file) && path.includes("settings");
  const footerGroupSetting = /(^|\/)sections\/footer[^/]*\.json$/.test(file) && path.includes("settings");

  if (/payment/.test(key) && valueType === "boolean" && (footerGroupSetting || settingsDataCurrent)) {
    return decision("hide payment icons", false, 0.99, "Boolean payment visibility control matches the authorized footer exception.");
  }
  if (/(show|enable|display).*(logo|brand|store|shop.*name)|(^|_)(logo|brand|store_name|shop_name).*(show|enable|display)/.test(key) && valueType === "boolean" && (headerGroupSetting || settingsDataCurrent)) {
    return decision("hide visible logo or store-name branding", false, 0.98, "Boolean header-branding visibility control matches the authorized native-header simplification.");
  }
  if (LOGO_ASSET_KEYS.has(key) && valueType === "string" && (headerGroupSetting || settingsDataCurrent)) {
    return decision("clear verified theme logo asset assignment", "", 0.90, "This exact active logo asset key can be cleared only after executive review; the rendered preview must confirm that the theme does not fall back to visible shop-name branding.", { requiresExecutiveApproval: true });
  }
  if (/copyright|powered/.test(key) && valueType === "string" && (footerGroupSetting || settingsDataCurrent)) {
    return decision("set footer attribution", "© 2026 Mindset Media Group. Powered by Kairos.", 0.97, "Existing footer attribution field matches the authorized footer text change.");
  }
  if (/(color_scheme|background)/.test(key) && footerGroupSetting) {
    return decision("set the native footer to the verified solid-black theme scheme", null, 0.82, "The footer color must resolve to a verified active theme scheme whose actual background is exactly #000000.", {
      requiresVerifiedThemeScheme: true,
      preferredBackground: "#000000",
      requiresExecutiveApproval: true,
    });
  }
  if (/(color_scheme|background)/.test(key) && headerGroupSetting) {
    return decision("set the native header to the darkest verified blue theme scheme", null, 0.82, "The header color must resolve from verified background values; Kairos will not infer color from a scheme name.", {
      requiresVerifiedThemeScheme: true,
      preferredPalette: "darkest-blue",
      requiresExecutiveApproval: true,
    });
  }
  if (/(center|alignment|spacing)/.test(key) && headerGroupSetting) {
    return decision("remove unused center header spacing", null, 0.65, "Layout exception is authorized, but the exact theme-specific value requires executive review and rendered verification.", { requiresExecutiveApproval: true });
  }
  return null;
}

export function collectVerifiedThemeSchemes(report) {
  const candidates = Array.isArray(report?.settings?.candidateSettings) ? report.settings.candidateSettings : [];
  const schemes = candidates
    .filter(item => Array.isArray(item?.path)
      && item.path.length === 5
      && item.path[0] === "current"
      && item.path[1] === "color_schemes"
      && item.path[3] === "settings"
      && item.path[4] === "background"
      && /^scheme-[a-z0-9_-]+$/i.test(String(item.path[2] || ""))
      && /^#[0-9a-f]{6}$/i.test(String(item.valuePreview || "")))
    .map(item => ({
      value: String(item.path[2]),
      background: String(item.valuePreview).toLowerCase(),
      source: "config/settings_data.json/current/color_schemes",
    }));
  return [...new Map(schemes.map(scheme => [scheme.value, scheme])).values()];
}

function resolveVerifiedScheme(decisionValue, schemes) {
  if (decisionValue.preferredBackground) {
    return schemes.find(scheme => scheme.background === decisionValue.preferredBackground) || null;
  }
  if (decisionValue.preferredPalette === "darkest-blue") return pickDarkestVerifiedBlue(schemes);
  return null;
}

function pickDarkestVerifiedBlue(schemes) {
  const blues = schemes.map(scheme => ({ ...scheme, rgb: hexToRgb(scheme.background) }))
    .filter(scheme => scheme.rgb && isBlue(scheme.rgb))
    .map(scheme => ({ ...scheme, luminance: relativeLuminance(scheme.rgb) }))
    .sort((a, b) => a.luminance - b.luminance);
  if (!blues.length) return null;
  const { rgb, luminance, ...selection } = blues[0];
  return selection;
}

function isBlue({ r, g, b }) {
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  return b > r && b >= g && chroma >= 20;
}

function relativeLuminance({ r, g, b }) {
  const channel = value => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function hexToRgb(value) {
  const match = String(value || "").match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return match ? { r: Number.parseInt(match[1], 16), g: Number.parseInt(match[2], 16), b: Number.parseInt(match[3], 16) } : null;
}

function decision(authorizedChange, proposedValue, confidence, rationale, additional = {}) {
  return { authorizedChange, proposedValue, confidence, rationale, ...additional };
}
