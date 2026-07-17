const BUILD = "kairos-structure-preserving-content-20260715-1";

const SHORT_COPY = [
  "Start Here",
  "Learn",
  "Create",
  "Publish",
  "Grow",
  "Explore Resources",
  "Professional Support",
  "Continue Your Journey",
  "Recommended Next Step",
  "Meet Kairos",
];

const HEADING_COPY = [
  "Your Knowledge Has Value",
  "A Knowledge Ecosystem Built for Progress",
  "Choose What You Want to Build",
  "Turn Ideas Into Finished Work",
  "Learn, Create, Publish, and Grow",
  "Guidance for Every Stage of the Journey",
  "Build Something That Lasts",
  "Move Forward With Clear Next Steps",
];

const PARAGRAPH_COPY = [
  "Mindset Media Group brings learning, publishing, creator resources, and professional support into one connected knowledge ecosystem.",
  "Start with what you want to accomplish. Follow a clear path from learning and planning to creating, publishing, and growing.",
  "Discover practical resources, digital products, and guided support designed to help turn knowledge and experience into finished outcomes.",
  "Kairos helps organize the journey, connect the right resources, and identify the next useful action without adding unnecessary friction.",
  "We’re not gatekeepers. We’re door openers. Knowledge grows when it’s shared, and opportunity grows when doors are opened.",
  "Continue your journey through connected learning paths, creator tools, publishing services, and professional support.",
];

export function buildStructurePreservingContentPackage(document, objective) {
  const operations = [];
  const evidenceNotes = [];
  const counters = { short: 0, heading: 0, paragraph: 0, replacements: 0 };
  const order = Array.isArray(document?.order) ? document.order : Object.keys(document?.sections || {});

  for (const sectionId of order) {
    const section = document?.sections?.[sectionId];
    if (!section || typeof section !== "object" || section.disabled === true) continue;
    inspectSettings(operations, counters, evidenceNotes, "section", sectionId, "", section.settings);
    for (const [blockId, block] of Object.entries(section.blocks || {})) {
      if (!block || typeof block !== "object") continue;
      inspectSettings(operations, counters, evidenceNotes, "block", sectionId, blockId, block.settings);
    }
    if (operations.length >= 24 || counters.replacements >= 24) break;
  }

  if (!operations.length) {
    const error = new Error("The current homepage contains no replaceable visible customer-facing text after structure-preserving inspection.");
    error.code = "content_only_visible_text_unavailable";
    throw error;
  }

  return {
    mode: "structure-preserving-visible-text",
    patch: { order: [], operations },
    summary: "Replace visible homepage copy while preserving the existing design, markup, components, settings, and structure.",
    strategy: "Keep the current Shopify homepage byte-stable outside approved visible text values. Preserve all tags, Liquid expressions, attributes, section IDs, block IDs, settings, links, assets, cards, pills, colors, typography, spacing, and behavior.",
    changes: [{
      filename: "templates/index.json",
      purpose: "Replace only visible customer-facing text inside existing Shopify settings and custom markup.",
      changeType: "modify",
      instructions: [
        "Preserve every existing section, block, setting key, tag, Liquid expression, attribute, class, style rule, script, link, image, and component.",
        "Change only plain text setting values or visible text nodes outside script, style, SVG, template, and Liquid regions.",
        "Reject the write if markup signatures, section structure, block structure, or non-text settings change.",
      ],
      expectedOutcome: "The same homepage design with updated knowledge-ecosystem and customer-journey copy.",
    }],
    risks: ["Copy length may cause natural line wrapping, but no design or structure mutation is authorized."],
    acceptanceCriteria: [
      "Homepage section IDs, block IDs, order, types, settings, links, assets, and visual configuration remain unchanged.",
      "Markup and Liquid token signatures remain identical.",
      "Only visible customer-facing text changes.",
      "Shopify read-back matches the approved deterministic patch.",
      "The live theme remains unchanged until explicit final approval.",
    ],
    rollbackPlan: ["Preserve the exact pre-change templates/index.json source.", "Restore that exact source if rollback is approved."],
    evidenceNotes: [`${BUILD}: ${counters.replacements} visible text replacements across ${operations.length} existing settings.`, ...evidenceNotes],
    objective,
  };
}

function inspectSettings(operations, counters, notes, scope, sectionId, blockId, settings) {
  if (!settings || typeof settings !== "object") return;
  for (const [key, value] of Object.entries(settings)) {
    if (operations.length >= 24 || counters.replacements >= 24) return;
    if (typeof value !== "string" || !value.trim()) continue;
    if (isBlockedSettingKey(key)) continue;

    if (looksLikeMarkup(value)) {
      const result = replaceVisibleMarkupText(value, counters, 24 - counters.replacements);
      if (!result.changed || markupSignature(value) !== markupSignature(result.value)) continue;
      operations.push({
        scope,
        sectionId,
        blockId,
        key,
        valueJson: JSON.stringify(result.value),
        verification: {
          mode: "markup-token-signature",
          beforeSignature: markupSignature(value),
          afterSignature: markupSignature(result.value),
          visibleTextReplacements: result.count,
        },
      });
      counters.replacements += result.count;
      notes.push(`Preserved markup and replaced ${result.count} visible text node(s) in ${sectionId}/${blockId || "section"}/${key}.`);
      continue;
    }

    if (!isHumanText(value)) continue;
    const replacement = nextCopy(key, value, counters);
    if (!replacement || replacement === value) continue;
    operations.push({ scope, sectionId, blockId, key, valueJson: JSON.stringify(replacement), verification: { mode: "plain-string", previousLength: value.length, nextLength: replacement.length } });
    counters.replacements += 1;
    notes.push(`Replaced existing plain text setting ${sectionId}/${blockId || "section"}/${key}.`);
  }
}

function isBlockedSettingKey(key) {
  const normalized = String(key || "").toLowerCase();
  return /(^|_)(color|colour|scheme|font|size|weight|spacing|padding|margin|layout|style|image|video|media|icon|logo|border|shadow|animation|effect|columns?|rows?|width|height|position|alignment|opacity|ratio|enable|disable|show|hide|url|link|href|product|collection|menu|handle|id|class|template|asset|file|src|target|rel|aria|tabindex)(_|$)/.test(normalized);
}

function looksLikeMarkup(value) {
  return /<\/?[a-z][\s\S]*>|{{[\s\S]*?}}|{%[\s\S]*?%}/i.test(String(value || ""));
}

function isHumanText(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 2000) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/|gid:\/\/|data:)/i.test(text)) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return false;
  if (/^[\[{].*[\]}]$/s.test(text)) return false;
  if (/\{[{%]|[%}]}|<\/?[a-z]/i.test(text)) return false;
  if (/^[a-z0-9_-]+\.(png|jpe?g|gif|webp|svg|mp4|webm|css|js|json|liquid)$/i.test(text)) return false;
  return /[a-z]/i.test(text) && (text.includes(" ") || /[.!?,:'’&]/.test(text));
}

function nextCopy(key, previous, counters) {
  const normalized = String(key || "").toLowerCase();
  const length = String(previous || "").trim().length;
  if (/(button|label|cta|eyebrow|kicker|caption)/.test(normalized) || length <= 28) return SHORT_COPY[counters.short++ % SHORT_COPY.length];
  if (/(heading|title|headline|subheading|subtitle)/.test(normalized) || length <= 90) return HEADING_COPY[counters.heading++ % HEADING_COPY.length];
  return PARAGRAPH_COPY[counters.paragraph++ % PARAGRAPH_COPY.length];
}

function replaceVisibleMarkupText(source, counters, limit) {
  const tokens = String(source || "").split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g);
  const blockedStack = [];
  let changed = false;
  let count = 0;

  for (let index = 0; index < tokens.length && count < limit; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token.startsWith("{{") || token.startsWith("{%")) continue;
    if (token.startsWith("<")) {
      updateBlockedStack(blockedStack, token);
      continue;
    }
    if (blockedStack.length || !isVisibleTextToken(token)) continue;
    const leading = token.match(/^\s*/)?.[0] || "";
    const trailing = token.match(/\s*$/)?.[0] || "";
    const core = token.slice(leading.length, token.length - trailing.length);
    const replacement = nextCopy("markup", core, counters);
    if (!replacement || replacement === core) continue;
    tokens[index] = `${leading}${replacement}${trailing}`;
    changed = true;
    count += 1;
  }

  return { changed, count, value: tokens.join("") };
}

function updateBlockedStack(stack, token) {
  const close = token.match(/^<\s*\/\s*([a-z0-9:-]+)/i);
  if (close) {
    const tag = close[1].toLowerCase();
    const last = stack.lastIndexOf(tag);
    if (last !== -1) stack.splice(last, 1);
    return;
  }
  const open = token.match(/^<\s*([a-z0-9:-]+)/i);
  if (!open || /\/\s*>$/.test(token)) return;
  const tag = open[1].toLowerCase();
  if (["script", "style", "svg", "template", "noscript", "code", "pre"].includes(tag)) stack.push(tag);
}

function isVisibleTextToken(token) {
  const text = String(token || "").trim();
  if (!text || text.length < 2 || text.length > 2000) return false;
  if (!/[a-z]/i.test(text)) return false;
  if (/^(&[a-z0-9#]+;|[\s\W])+$/i.test(text)) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(text)) return false;
  if (/\b(var|const|let|function|return|display|position|background|color|padding|margin)\s*[:=(]/i.test(text)) return false;
  return true;
}

function markupSignature(source) {
  return (String(source || "").match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g) || []).join("\u001f");
}
