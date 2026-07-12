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
    addFirstMatchingSetting(
      operations,
      hero.sectionId,
      hero.section?.settings,
      ["subheading", "subtitle", "text", "description", "content"],
      "Mindset Media Group helps you discover, organize, build, and share your knowledge through books, AI, business, creator education, and guided execution."
    );
    addFirstMatchingSetting(operations, hero.sectionId, hero.section?.settings, ["button_label", "button_text", "primary_button_label"], "Explore the MMG Ecosystem");
    addFirstMatchingSetting(operations, hero.sectionId, hero.section?.settings, ["second_button_label", "secondary_button_label", "button_label_2"], "Meet Kairos");
    notes.push(`Primary homepage introduction grounded in existing section ${hero.sectionId}.`);
  }

  const pathway = findSection(sectionEntries.filter(item => item.sectionId !== hero?.sectionId), ["multicolumn", "collection-list", "collection_list", "featured-collection", "featured_collection", "rich-text", "rich_text"])
    || sectionEntries.find(item => item.sectionId !== hero?.sectionId && hasAnyEditableText(item.section));

  if (pathway) {
    addFirstMatchingSetting(operations, pathway.sectionId, pathway.section?.settings, ["heading", "title", "headline"], "Choose What You Want to Build");
    addFirstMatchingSetting(
      operations,
      pathway.sectionId,
      pathway.section?.settings,
      ["subheading", "subtitle", "text", "description", "content"],
      "Publish knowledge, build a brand, grow as a creator, learn AI, develop products, or access practical tools—then follow the MMG path designed for that objective."
    );
    notes.push(`Guided objective pathway grounded in existing section ${pathway.sectionId}.`);
  }

  const kairos = findSection(sectionEntries.filter(item => ![hero?.sectionId, pathway?.sectionId].includes(item.sectionId)), ["rich-text", "rich_text", "image-with-text", "image_with_text", "collapsible-content", "collapsible_content"])
    || sectionEntries.find(item => ![hero?.sectionId, pathway?.sectionId].includes(item.sectionId) && hasAnyEditableText(item.section));

  if (kairos) {
    addFirstMatchingSetting(operations, kairos.sectionId, kairos.section?.settings, ["heading", "title", "headline"], "Kairos Turns Objectives Into Guided Execution");
    addFirstMatchingSetting(
      operations,
      kairos.sectionId,
      kairos.section?.settings,
      ["subheading", "subtitle", "text", "description", "content"],
      "Kairos is the intelligence operating system inside MMG—organizing context, recommending the next action, and helping users move from idea to verified progress."
    );
    notes.push(`Kairos positioning grounded in existing section ${kairos.sectionId}.`);
  }

  const blockUpdates = buildBlockUpdates(sectionEntries, new Set([hero?.sectionId, pathway?.sectionId, kairos?.sectionId].filter(Boolean)));
  operations.push(...blockUpdates.operations);
  notes.push(...blockUpdates.notes);

  const deduped = dedupeOperations(operations).slice(0, 18);
  if (!deduped.length) {
    throw new Error("The verified homepage source did not expose supported existing text settings for a safe deterministic retool.");
  }

  return {
    patch: { order: [], operations: deduped },
    summary: "Retool the existing homepage into a clearer MMG guided ecosystem journey without changing the approved visual identity.",
    strategy: "Preserve the current Shopify section structure, styling, products, links, and integrations. Update only existing text-oriented settings on the non-live Kairos Staging homepage so the journey clearly introduces MMG, presents objective-based pathways, positions Kairos, and improves calls to action.",
    changes: [{
      filename: "templates/index.json",
      purpose: "Clarify the homepage hierarchy and guided customer journey while preserving existing section types and visual styling.",
      changeType: "modify",
      instructions: [
        "Update only existing homepage section and block settings.",
        "Preserve all section IDs, block IDs, types, links, products, imagery, color settings, typography settings, and integrations.",
        "Establish the core message ‘Your Knowledge Has Value.’",
        "Clarify MMG as the ecosystem and Kairos as the intelligence operating system.",
        "Guide visitors toward publishing, brand building, creator growth, AI learning, product development, and practical tools.",
      ],
      expectedOutcome: "A clearer, mobile-readable homepage journey with stronger semantic messaging and calls to action, without a visual redesign.",
    }],
    risks: [
      "Existing theme settings may use unconventional key names, so only verified supported keys will be changed.",
      "No new Shopify sections or blocks will be created in this deterministic pass.",
    ],
    acceptanceCriteria: [
      "The homepage contains one clear primary value statement.",
      "MMG is presented as the overarching ecosystem and Kairos as the guided execution layer.",
      "Existing section IDs, block IDs, section types, block types, products, links, imagery, and styling settings remain intact.",
      "The resulting templates/index.json is valid and semantically verified after Shopify read-back.",
      "The live Rise theme remains MAIN and unchanged.",
    ],
    rollbackPlan: [
      "Preserve the exact pre-change templates/index.json from Kairos Staging.",
      "Rollback requires separate approval and restores only that file on the non-live staging theme.",
    ],
    evidenceNotes: notes,
    objective,
  };
}

function buildBlockUpdates(sectionEntries, excluded) {
  const operations = [];
  const notes = [];
  const target = sectionEntries.find(item => !excluded.has(item.sectionId) && item.section?.blocks && typeof item.section.blocks === "object");
  if (!target) return { operations, notes };

  const blocks = Object.entries(target.section.blocks || {});
  const copy = [
    ["Publish Your Knowledge", "Turn expertise and lived experience into books, resources, and durable intellectual property."],
    ["Build Your Brand", "Create a coherent business and creator presence supported by practical MMG systems."],
    ["Grow With AI", "Learn and apply AI tools through clear education, responsible workflows, and guided execution."],
  ];

  for (let index = 0; index < Math.min(blocks.length, copy.length); index += 1) {
    const [blockId, block] = blocks[index];
    const [heading, text] = copy[index];
    addFirstMatchingBlockSetting(operations, target.sectionId, blockId, block?.settings, ["heading", "title", "headline"], heading);
    addFirstMatchingBlockSetting(operations, target.sectionId, blockId, block?.settings, ["text", "description", "content", "subheading"], text);
  }
  if (operations.length) notes.push(`Objective-path messaging grounded in existing blocks within section ${target.sectionId}.`);
  return { operations, notes };
}

function findSection(entries, typeHints) {
  return entries.find(({ section }) => {
    const type = String(section?.type || "").toLowerCase();
    return typeHints.some(hint => type.includes(hint));
  });
}

function hasAnyEditableText(section) {
  const settings = section?.settings;
  return settings && typeof settings === "object" && findSafeTextSettingKey(settings, ["heading", "title", "headline", "subheading", "subtitle", "text", "description", "content", "button_label", "button_text"]);
}

function findSafeTextSettingKey(settings, keys) {
  const stringKeys = Object.keys(settings).filter(key => typeof settings[key] === "string");
  for (const candidate of keys) {
    if (stringKeys.includes(candidate)) return candidate;
  }
  for (const existing of stringKeys) {
    const normalized = existing.toLowerCase();
    if (/(^|_)(position|alignment|color|scheme|opacity|height|behavior|image|ratio|padding|columns?|layout|style)(_|$)/.test(normalized)) continue;
    if (keys.some(candidate => normalized.startsWith(`${candidate.toLowerCase()}_`) || normalized.endsWith(`_${candidate.toLowerCase()}`))) return existing;
  }
  return "";
}

function addFirstMatchingSetting(operations, sectionId, settings, keys, value) {
  if (!settings || typeof settings !== "object") return;
  const key = findSafeTextSettingKey(settings, keys);
  if (!key || settings[key] === value) return;
  operations.push({ scope: "section", sectionId, blockId: "", key, valueJson: JSON.stringify(value) });
}

function addFirstMatchingBlockSetting(operations, sectionId, blockId, settings, keys, value) {
  if (!settings || typeof settings !== "object") return;
  const key = findSafeTextSettingKey(settings, keys);
  if (!key || settings[key] === value) return;
  operations.push({ scope: "block", sectionId, blockId, key, valueJson: JSON.stringify(value) });
}

function dedupeOperations(operations) {
  const seen = new Set();
  return operations.filter(operation => {
    const key = `${operation.scope}:${operation.sectionId}:${operation.blockId}:${operation.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
