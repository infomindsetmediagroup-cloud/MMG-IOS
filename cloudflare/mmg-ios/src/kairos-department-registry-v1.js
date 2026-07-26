export const KAIROS_DEPARTMENT_REGISTRY_BUILD = "kairos-department-registry-20260725-1";

const DEPARTMENTS = Object.freeze({
  executive: Object.freeze({
    id: "executive",
    label: "Executive Command",
    aliases: ["command", "strategy", "executive command", "chief of staff"],
    instruction: "Frame the objective as an executive decision. Identify the outcome, governing constraints, dependencies, risks, decision points, and the next controlled action.",
    capabilities: ["strategy", "prioritization", "cross-department coordination", "decision support"],
  }),
  publishing: Object.freeze({
    id: "publishing",
    label: "Publishing Operations",
    aliases: ["publishing studio", "publishing operations", "manuscript", "book", "digital asset"],
    instruction: "Apply the canonical MMG publishing pipeline. Preserve source authority, editorial integrity, customer-delivery requirements, Digital Asset Edition standards, and approval boundaries.",
    capabilities: ["manuscript production", "editorial operations", "digital asset packaging", "customer delivery"],
  }),
  commerce: Object.freeze({
    id: "commerce",
    label: "Commerce Operations",
    aliases: ["shopify", "store", "commerce", "product", "subscription"],
    instruction: "Treat Shopify and commerce state as governed production infrastructure. Generate and validate safely; require explicit approval for product, pricing, inventory, subscription, customer-data, theme, navigation, or publication mutations.",
    capabilities: ["Shopify planning", "product architecture", "offer design", "commerce governance"],
  }),
  website: Object.freeze({
    id: "website",
    label: "Website Production",
    aliases: ["website builder", "web", "site", "landing page", "homepage"],
    instruction: "Preserve the approved MMG website system, information architecture, accessibility, responsive behavior, Shopify compatibility, and verified-link requirements. Separate drafts from production changes.",
    capabilities: ["website architecture", "page production", "responsive QA", "Shopify integration"],
  }),
  creative: Object.freeze({
    id: "creative",
    label: "Creative Production",
    aliases: ["creative studio", "design", "image", "video", "social"],
    instruction: "Translate the objective into a production-ready creative brief with explicit format, dimensions, message hierarchy, brand constraints, source assets, quality checks, and delivery requirements.",
    capabilities: ["creative direction", "asset briefing", "social production", "visual QA"],
  }),
  growth: Object.freeze({
    id: "growth",
    label: "Growth Intelligence",
    aliases: ["growth", "marketing", "campaign", "audience", "analytics"],
    instruction: "Prioritize measurable growth, evidence quality, audience fit, channel constraints, experiment design, and durable learning. Do not invent performance data or attribution.",
    capabilities: ["growth strategy", "campaign planning", "measurement", "experimentation"],
  }),
  customer: Object.freeze({
    id: "customer",
    label: "Customer Experience",
    aliases: ["customer portal", "customer", "support", "delivery", "onboarding"],
    instruction: "Minimize customer friction while preserving clarity, privacy, delivery integrity, authenticated boundaries, and visible progress through the MMG experience.",
    capabilities: ["customer journeys", "onboarding", "delivery experience", "support design"],
  }),
});

export function resolveKairosDepartment(value, objective = "") {
  const requested = normalize(value);
  if (requested) {
    for (const department of Object.values(DEPARTMENTS)) {
      if (department.id === requested || department.aliases.some((alias) => normalize(alias) === requested)) return publicDepartment(department);
    }
  }

  const haystack = normalize(objective);
  let best = DEPARTMENTS.executive;
  let bestScore = 0;
  for (const department of Object.values(DEPARTMENTS)) {
    const terms = [department.id, department.label, ...department.aliases].map(normalize);
    const score = terms.reduce((total, term) => total + (term && haystack.includes(term) ? term.length : 0), 0);
    if (score > bestScore) {
      best = department;
      bestScore = score;
    }
  }
  return publicDepartment(best);
}

export function listKairosDepartments() {
  return Object.values(DEPARTMENTS).map(publicDepartment);
}

function publicDepartment(department) {
  return {
    id: department.id,
    label: department.label,
    instruction: department.instruction,
    capabilities: [...department.capabilities],
    build: KAIROS_DEPARTMENT_REGISTRY_BUILD,
  };
}

function normalize(value) {
  return String(value || "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}
