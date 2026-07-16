import { inspectWebsiteRetoolSchema } from "./kairos-website-retool-schema-inspector-v1.js";

const BUILD = "kairos-website-retool-exception-planner-20260716-2";
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
  const candidates = [];
  for (const file of report.inventory || []) {
    for (const setting of file.candidateSettings || []) {
      if (!ALLOWED_CATEGORIES.has(setting.category)) continue;
      const decision = classifyWebsiteRetoolCandidate(file.filename, setting);
      if (!decision) continue;
      candidates.push({
        filename: file.filename,
        sourceSha256: file.sha256,
        path: setting.path,
        key: setting.key,
        valueType: setting.valueType,
        currentValuePreview: setting.valuePreview,
        category: setting.category,
        authorizedChange: decision.authorizedChange,
        proposedValue: decision.proposedValue,
        confidence: decision.confidence,
        requiresExecutiveApproval: decision.confidence < 0.95,
        rationale: decision.rationale,
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
    liquidEvidence: [...(report.header || []), ...(report.footer || [])]
      .filter(file => file.format === "liquid")
      .map(file => ({ filename: file.filename, sha256: file.sha256, signals: file.liquidSignals })),
    safeguards: {
      stagingOnly: true,
      mutationPerformed: false,
      sourceHashBound: true,
      guessedThemeKeys: false,
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
    return decision("clear verified theme logo asset assignment", "", 0.90, "This exact active logo asset key can be cleared only after executive review; the rendered preview must confirm that the theme does not fall back to visible shop-name branding.");
  }
  if (/copyright|powered/.test(key) && valueType === "string" && (footerGroupSetting || settingsDataCurrent)) {
    return decision("set footer attribution", "© 2026 Mindset Media Group. Powered by Kairos.", 0.97, "Existing footer attribution field matches the authorized footer text change.");
  }
  if (/(color_scheme|background)/.test(key) && headerGroupSetting) {
    return decision("use existing approved dark MMG blue scheme", null, 0.72, "The exact existing approved scheme value must be selected from verified theme settings before execution.");
  }
  if (/(center|alignment|spacing)/.test(key) && headerGroupSetting) {
    return decision("remove unused center header spacing", null, 0.65, "Layout exception is authorized, but the exact theme-specific value requires executive review and rendered verification.");
  }
  return null;
}

function decision(authorizedChange, proposedValue, confidence, rationale) {
  return { authorizedChange, proposedValue, confidence, rationale };
}
