export function buildDeterministicHomepagePackage(document, objective) {
  const sections = document?.sections && typeof document.sections === "object" ? document.sections : {};
  const order = Array.isArray(document?.order) ? [...document.order] : Object.keys(sections);
  const operations = [];
  const notes = [];

  const sectionEntries = order
    .map((sectionId, index) => ({ sectionId, index, section: sections[sectionId] }))
    .filter(item => item.section && typeof item.section === "object" && item.section.disabled !== true);

  const hero = findSection(sectionEntries, ["hero", "banner", "slideshow", "image-banner", "image_banner"])
    || sectionEntries.find(item => hasAnyEditableText(item.section));

  if (hero) {
    addFirstMatchingSetting(operations, hero.sectionId, hero.section?.settings, ["heading", "title", "headline"], "Your Knowledge Has Value.");
    addFirstMatchingSetting(operations, hero.sectionId, hero.section?.settings, ["subheading", "subtitle", "text", "description", "content"], "Mindset Media Group helps you discover, organize, build, and share your knowledge through books, AI, business, creator education, and guided execution.");
    addFirstMatchingSetting(operations, hero.sectionId, hero.section?.settings, ["button_label", "button_text", "primary_button_label"], "Explore the MMG Ecosystem");
    addFirstMatchingSetting(operations, hero.sectionId, hero.section?.settings, ["second_button_label", "secondary_button_label", "button_label_2"], "Meet Kairos");
    notes.push(`Primary homepage introduction grounded in existing section ${hero.sectionId}.`);
  }

  const pathway = findSection(sectionEntries.filter(item => item.sectionId !== hero?.sectionId), ["multicolumn", "collection-list", "collection_list", "featured-collection", "featured_collection", "rich-text", "rich_text"])
    || sectionEntries.find(item => item.sectionId !== hero?.sectionId && hasAnyEditableText(item.section));

  if (pathway) {
    addFirstMatchingSetting(operations, pathway.sectionId, pathway.section?.settings, ["heading", "title", "headline"], "Choose What You Want to Build");
    addFirstMatchingSetting(operations, pathway.sectionId, pathway.section?.settings, ["subheading", "subtitle", "text", "description", "content"], "Publish knowledge, build a brand, grow as a creator, learn AI, develop products, or access practical tools—then follow the MMG path designed for that objective.");
    notes.push(`Guided objective pathway grounded in existing section ${pathway.sectionId}.`);
  }

  const kairos = findSection(sectionEntries.filter(item => ![hero?.sectionId, pathway?.sectionId].includes(item.sectionId)), ["rich-text", "rich_text", "image-with-text", "image_with_text", "collapsible-content", "collapsible_content"])
    || sectionEntries.find(item => ![hero?.sectionId, pathway?.sectionId].includes(item.sectionId) && hasAnyEditableText(item.section));

  if (kairos) {
    addFirstMatchingSetting(operations, kairos.sectionId, kairos.section?.settings, ["heading", "title", "headline"], "Kairos Turns Objectives Into Guided Execution");
    addFirstMatchingSetting(operations, kairos.sectionId, kairos.section?.settings, ["subheading", "subtitle", "text", "description", "content"], "Kairos is the intelligence operating system inside MMG—organizing context, recommending the next action, and helping users move from idea to verified progress.");
    notes.push(`Kairos positioning grounded in existing section ${kairos.sectionId}.`);
  }

  const blockUpdates = buildBlockUpdates(sectionEntries, new Set([hero?.sectionId, pathway?.sectionId, kairos?.sectionId].filter(Boolean)));
  operations.push(...blockUpdates.operations);
  notes.push(...blockUpdates.notes);

  const deduped = dedupeOperations(operations).slice(0, 18);
  if (!deduped.length) {
    const error = new Error("The approved homepage baseline does not expose any safe editable text settings. Kairos will not replace or visually restructure the page.");
    error.code = "approved_homepage_has_no_safe_text_settings";
    throw error;
  }

  return {
    mode: "existing-text-settings",
    patch: { order: [], operations: deduped },
    summary: "Retool the existing homepage into a clearer MMG guided ecosystem journey without changing the approved visual identity.",
    strategy: "Preserve the current Shopify section structure, styling, products, links, and integrations. Update only existing text-oriented settings on the non-live Kairos Staging homepage.",
    changes: [{ filename: "templates/index.json", purpose: "Update only verified text settings while preserving the rendered homepage.", changeType: "modify", instructions: ["Update only safe existing text settings.", "Preserve section IDs, block IDs, types, links, products, imagery, colors, typography, spacing, and integrations.", "Do not create or replace sections, blocks, stylesheets, or Liquid structures."], expectedOutcome: "A content-only homepage update with no visual redesign." }],
    risks: ["Custom setting names are accepted only when both the field key and current value pass the strict non-visual content classifier."],
    acceptanceCriteria: ["Section IDs, block IDs, section types, block types, order, imagery, links, and visual settings remain intact.", "Only approved string content fields change.", "The resulting templates/index.json is valid and semantically verified after Shopify read-back.", "The live theme remains unchanged."],
    rollbackPlan: ["Preserve the exact pre-change templates/index.json from Kairos Staging.", "Rollback requires separate approval and restores only that file on staging."],
    evidenceNotes: notes,
    objective,
  };
}

function buildBlockUpdates(sectionEntries, excluded) {
  const operations = [];
  const notes = [];
  const target = sectionEntries.find(item => !excluded.has(item.sectionId) && item.section?.blocks && typeof item.section.blocks === "object" && Object.values(item.section.blocks).some(block => hasEditableSettings(block?.settings)));
  if (!target) return { operations, notes };
  const blocks = Object.entries(target.section.blocks || {}).filter(([, block]) => hasEditableSettings(block?.settings));
  const copy = [["Publish Your Knowledge", "Turn expertise and lived experience into books, resources, and durable intellectual property."], ["Build Your Brand", "Create a coherent business and creator presence supported by practical MMG systems."], ["Grow With AI", "Learn and apply AI tools through clear education, responsible workflows, and guided execution."]];
  for (let index = 0; index < Math.min(blocks.length, copy.length); index += 1) {
    const [blockId, block] = blocks[index];
    const [heading, text] = copy[index];
    addFirstMatchingBlockSetting(operations, target.sectionId, blockId, block?.settings, ["heading", "title", "headline"], heading);
    addFirstMatchingBlockSetting(operations, target.sectionId, blockId, block?.settings, ["text", "description", "content", "subheading"], text);
  }
  if (operations.length) notes.push(`Objective-path messaging grounded in existing blocks within section ${target.sectionId}.`);
  return { operations, notes };
}

function findSection(entries, typeHints) { return entries.find(({ section }) => { const type = String(section?.type || "").toLowerCase(); return typeHints.some(hint => type.includes(hint)); }); }

function hasAnyEditableText(section) {
  if (hasEditableSettings(section?.settings)) return true;
  const blocks = section?.blocks && typeof section.blocks === "object" ? Object.values(section.blocks) : [];
  return blocks.some(block => hasEditableSettings(block?.settings));
}

function hasEditableSettings(settings) {
  return Boolean(findSafeTextSettingKey(settings, ["heading", "title", "headline", "subheading", "subtitle", "text", "description", "content", "button_label", "button_text"]));
}

function findSafeTextSettingKey(settings, preferredKeys) {
  const stringKeys = Object.keys(settings || {}).filter(key => typeof settings[key] === "string");
  for (const candidate of preferredKeys) if (stringKeys.includes(candidate) && isSafeTextField(candidate, settings[candidate])) return candidate;
  for (const existing of stringKeys) {
    const normalized = existing.toLowerCase();
    if (!isSafeTextField(normalized, settings[existing])) continue;
    if (preferredKeys.some(candidate => normalized.startsWith(`${candidate.toLowerCase()}_`) || normalized.endsWith(`_${candidate.toLowerCase()}`))) return existing;
  }
  const candidates = stringKeys
    .filter(key => isSafeTextField(key, settings[key]))
    .map(key => ({ key, score: contentScore(key, settings[key]) }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.key || "";
}

function isSafeTextField(key, value) {
  const normalized = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  if (!normalized || !text || text.length > 1600) return false;
  if (/(^|_)(position|alignment|color|colour|scheme|opacity|height|width|behavior|behaviour|image|video|media|icon|logo|ratio|padding|margin|spacing|columns?|rows?|layout|style|font|size|weight|border|radius|shadow|animation|effect|desktop|mobile|enable|disable|show|hide|url|link|href|product|collection|menu|handle|id|class|template|liquid|css|html|asset|file|src|target|rel|aria|tabindex)(_|$)/.test(normalized)) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(text)) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return false;
  if (/^(shopify:\/\/|gid:\/\/|file:|data:)/i.test(text)) return false;
  if (/\{[{%]|[%}]\}|<\/?[a-z][\s\S]*>|[{};][\s\S]*:[\s\S]*[;}]/i.test(text)) return false;
  if (/^[a-z0-9_-]+\.(png|jpe?g|gif|webp|svg|mp4|webm|css|js|json|liquid)$/i.test(text)) return false;
  if (/^[a-z0-9_-]{2,80}$/i.test(text) && !/\s/.test(text) && !/[.!?,:'’&]/.test(text)) return false;
  return /[a-z]/i.test(text) && (text.includes(" ") || /[.!?,:'’&]/.test(text));
}

function contentScore(key, value) {
  const normalized = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  let score = 0;
  if (/(heading|title|headline)/.test(normalized)) score += 50;
  if (/(subheading|subtitle|description|content|copy|message|body|intro|summary|tagline)/.test(normalized)) score += 40;
  if (/(label|caption|eyebrow|kicker)/.test(normalized)) score += 30;
  if (text.length >= 12 && text.length <= 160) score += 20;
  if (text.split(/\s+/).length >= 3) score += 10;
  return score;
}

function addFirstMatchingSetting(operations, sectionId, settings, keys, value) { if (!settings || typeof settings !== "object") return; const key = findSafeTextSettingKey(settings, keys); if (!key || settings[key] === value) return; operations.push({ scope: "section", sectionId, blockId: "", key, valueJson: JSON.stringify(value) }); }
function addFirstMatchingBlockSetting(operations, sectionId, blockId, settings, keys, value) { if (!settings || typeof settings !== "object") return; const key = findSafeTextSettingKey(settings, keys); if (!key || settings[key] === value) return; operations.push({ scope: "block", sectionId, blockId, key, valueJson: JSON.stringify(value) }); }
function dedupeOperations(operations) { const seen = new Set(); return operations.filter(operation => { const key = `${operation.scope}:${operation.sectionId}:${operation.blockId}:${operation.key}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
