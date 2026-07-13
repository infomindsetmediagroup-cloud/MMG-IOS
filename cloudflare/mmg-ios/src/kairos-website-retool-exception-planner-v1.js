import { inspectWebsiteRetoolSchema } from "./kairos-website-retool-schema-inspector-v1.js";

const BUILD = "kairos-website-retool-exception-planner-20260713-1";
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
      const decision = classifyCandidate(file.filename, setting);
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

function classifyCandidate(filename, setting) {
  const key = String(setting.key || "").toLowerCase();
  const file = String(filename || "").toLowerCase();
  const valueType = setting.valueType;

  if (/payment/.test(key) && valueType === "boolean") {
    return decision("hide payment icons", false, 0.99, "Boolean payment visibility control matches the authorized footer exception.");
  }
  if (/(show|enable|display).*(logo|brand|store|shop.*name)|(^|_)(logo|brand|store_name|shop_name).*(show|enable|display)/.test(key) && valueType === "boolean") {
    return decision("hide visible logo or store-name branding", false, 0.98, "Boolean header-branding visibility control matches the authorized native-header simplification.");
  }
  if (/logo/.test(key) && valueType === "string" && /header|settings_data/.test(file)) {
    return decision("remove visible header logo assignment", "", 0.96, "Header logo assignment can be cleared without replacing the native header system.");
  }
  if (/copyright|powered/.test(key) && valueType === "string") {
    return decision("set footer attribution", "© 2026 Mindset Media Group. Powered by Kairos.", 0.97, "Existing footer attribution field matches the authorized footer text change.");
  }
  if (/(color_scheme|background)/.test(key) && /header/.test(file)) {
    return decision("use existing approved dark MMG blue scheme", null, 0.72, "The exact existing approved scheme value must be selected from verified theme settings before execution.");
  }
  if (/(center|alignment|spacing)/.test(key) && /header/.test(file)) {
    return decision("remove unused center header spacing", null, 0.65, "Layout exception is authorized, but the exact theme-specific value requires executive review and rendered verification.");
  }
  return null;
}

function decision(authorizedChange, proposedValue, confidence, rationale) {
  return { authorizedChange, proposedValue, confidence, rationale };
}
