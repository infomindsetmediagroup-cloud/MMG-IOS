import { inspectStagingSource, parseShopifyJson } from "./kairos-compact-homepage-utils-v1.js";

const BUILD = "kairos-website-retool-schema-inspector-20260713-1";
const CANDIDATE_FILES = [
  "templates/index.json",
  "sections/header-group.json",
  "sections/footer-group.json",
  "config/settings_data.json",
  "sections/header.liquid",
  "sections/footer.liquid",
];

export async function inspectWebsiteRetoolSchema(request, env) {
  const inspection = await inspectStagingSource(null, request, env, BUILD, CANDIDATE_FILES);
  const files = Array.isArray(inspection?.evidence?.files) ? inspection.evidence.files : [];
  const inventory = files.map(file => inspectFile(file));
  const homepage = inventory.find(file => file.filename === "templates/index.json") || null;
  const header = inventory.filter(file => /(^|\/)header([-.]|\/|$)/i.test(file.filename));
  const footer = inventory.filter(file => /(^|\/)footer([-.]|\/|$)/i.test(file.filename));
  const settings = inventory.find(file => file.filename === "config/settings_data.json") || null;

  return {
    status: "completed",
    build: BUILD,
    inspectedAt: new Date().toISOString(),
    stagingTheme: inspection?.evidence?.stagingTheme || null,
    publishedTheme: inspection?.evidence?.mainTheme || null,
    homepage,
    header,
    footer,
    settings,
    inventory,
    authorizedExceptions: {
      header: ["hide visible logo", "hide store-name text", "remove unused center spacing", "use existing approved dark MMG blue"],
      footer: ["hide payment icons", "remove empty payment container spacing", "set MMG/Kairos attribution"],
    },
    safeguards: {
      readOnly: true,
      stagingOnlyInspection: true,
      liveThemeMutation: false,
      guessedThemeKeys: false,
      structuralReplacement: false,
    },
  };
}

function inspectFile(file) {
  const base = {
    filename: String(file?.filename || ""),
    readable: Boolean(file?.readable),
    sha256: file?.sha256 || null,
    contentType: file?.contentType || null,
    exists: Boolean(file?.content),
    format: "unknown",
    candidateSettings: [],
    sectionTypes: [],
    liquidSignals: [],
  };
  if (!file?.content) return base;

  if (/\.json$/i.test(base.filename)) {
    try {
      const document = parseShopifyJson(file.content, base.filename);
      return {
        ...base,
        format: "json",
        candidateSettings: collectCandidates(document),
        sectionTypes: collectSectionTypes(document),
      };
    } catch (error) {
      return { ...base, format: "invalid-json", parseError: error instanceof Error ? error.message : "Invalid JSON" };
    }
  }

  if (/\.liquid$/i.test(base.filename)) {
    return {
      ...base,
      format: "liquid",
      liquidSignals: inspectLiquid(file.content),
    };
  }
  return base;
}

function collectSectionTypes(document) {
  const sections = document?.sections && typeof document.sections === "object" ? document.sections : {};
  return [...new Set(Object.values(sections).map(section => String(section?.type || "")).filter(Boolean))];
}

function collectCandidates(value, path = [], output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCandidates(item, [...path, index], output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key];
    if (isRelevantKey(key) && ["string", "boolean", "number"].includes(typeof child)) {
      output.push({ path: next, key, valueType: typeof child, valuePreview: preview(child), category: categorize(key) });
    }
    collectCandidates(child, next, output);
  }
  return output.slice(0, 250);
}

function isRelevantKey(key) {
  return /(logo|shop|store|name|brand|header|footer|payment|copyright|powered|color|scheme|background|align|center|spacing|show|hide|enable|disable)/i.test(String(key || ""));
}

function categorize(key) {
  const text = String(key || "").toLowerCase();
  if (/payment/.test(text)) return "footer-payment";
  if (/copyright|powered/.test(text)) return "footer-attribution";
  if (/logo|brand|store|shop.*name|name.*shop/.test(text)) return "header-branding";
  if (/color|scheme|background/.test(text)) return "visual-color";
  if (/align|center|spacing/.test(text)) return "layout-exception-candidate";
  return "visibility-or-content";
}

function inspectLiquid(content) {
  const signals = [];
  const patterns = [
    ["logo", /logo|header__heading-logo/i],
    ["store-name", /shop\.name|store[-_ ]?name/i],
    ["payment-icons", /payment|enabled_payment_types/i],
    ["copyright", /copyright|powered_by_link/i],
    ["color", /color_scheme|background|--color/i],
    ["center-container", /header__heading|header__inline-menu|justify-content|grid-template-columns/i],
  ];
  for (const [name, pattern] of patterns) if (pattern.test(content)) signals.push(name);
  return signals;
}

function preview(value) {
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
