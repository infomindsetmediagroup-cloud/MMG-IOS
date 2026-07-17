export const KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD = "kairos-internal-doctrine-registry-20260717-1";

const DOCTRINES = Object.freeze([
  Object.freeze({
    id: "mmg-website-experience-objective-v1",
    title: "MMG Website Experience Objective",
    aliases: [
      "mmg website experience objective",
      "website experience objective",
      "website ecosystem objective",
      "homepage ecosystem objective",
      "curated ecosystem",
      "experience first website",
      "website doctrine",
    ],
    status: "canonical",
    version: "1.0",
    owner: "MMG / Kairos",
    scope: ["homepage", "product pages", "landing pages", "services", "subscriptions", "customer journeys"],
    content: `MMG WEBSITE EXPERIENCE OBJECTIVE

Mindset Media Group is not primarily an online store. It is a curated knowledge, publishing, creator-development, and business-growth ecosystem.

The website must guide each visitor from their current objective toward the most relevant next step across:

- Educational products and practical digital resources
- Publishing and editorial services
- Creator and business services
- Kairos-guided execution
- Personalized subscriptions
- Customer workspaces and ongoing learning journeys

Every page must contribute to a connected customer journey rather than operating as an isolated sales page.

The website experience should help visitors understand:

1. What Mindset Media Group is.
2. What they can accomplish inside the ecosystem.
3. Which path fits their objective.
4. Which product, service, subscription, or resource is the appropriate next step.
5. How Kairos supports planning, execution, progress, and continued development.

HOMEPAGE ROLE

The homepage is the ecosystem orientation and routing layer.

It must:

- Establish the core value proposition.
- Introduce the major customer pathways.
- Explain Kairos clearly.
- Guide visitors toward products, services, subscriptions, publishing support, and educational resources.
- Build trust through MMG’s mission and Door Opener philosophy.
- Provide clear next actions without overwhelming visitors.
- Connect each major section to a meaningful destination in the ecosystem.
- Preserve visible progress and guided momentum throughout the experience.

CUSTOMER PATHWAYS

The website should recognize and guide visitors who want to:

- Publish knowledge, expertise, or lived experience.
- Build or strengthen a brand.
- Learn and apply practical AI.
- Create and sell digital products.
- Improve creator content and audience growth.
- Access editorial, publishing, design, or production services.
- Join a personalized recurring learning subscription.
- Use Kairos to organize and execute an objective.

CURATION PRINCIPLE

Kairos should evaluate every page in the context of the complete ecosystem.

Recommendations, copy, calls to action, related resources, and page connections should be selected according to the visitor’s likely objective and next logical step.

Do not treat products, services, subscriptions, and educational resources as unrelated catalog items.

LINK AND CTA GOVERNANCE

Button wording and destinations must be governed separately.

Never change a URL, link destination, product reference, collection reference, navigation item, or customer pathway unless that exact destination change is included in an approved link plan.

For text-only jobs:

- Button labels may change.
- Existing destinations must remain unchanged.
- Kairos must report the current destination beside every proposed button-label change.
- Any destination that appears inconsistent with the new label must be flagged for a separate journey-link approval rather than changed automatically.

LEARNING AND CONTINUITY

After each approved page is completed, Kairos must preserve:

- The approved page purpose.
- Section order and section roles.
- Approved customer-facing copy.
- Approved CTA labels and destinations.
- Products, services, subscriptions, and resources connected to the page.
- Customer journey relationships.
- Verification evidence and revision history.
- Lessons from executive approval or rejection.

Future page work must consult these approved records before generating a plan.

DESIGN BOUNDARY

The current approved design remains the visual baseline unless an objective explicitly authorizes design work.

Copy curation does not authorize changes to layout, styling, typography, colors, assets, spacing, sections, blocks, templates, Liquid, CSS, JavaScript, or responsive behavior.`,
  }),
  Object.freeze({
    id: "mmg-homepage-journey-map-v1",
    title: "MMG Homepage Journey Map",
    aliases: [
      "homepage journey map",
      "homepage section map",
      "homepage customer journey",
      "homepage routing map",
    ],
    status: "canonical",
    version: "1.0",
    owner: "MMG / Kairos",
    scope: ["homepage"],
    content: `MMG HOMEPAGE JOURNEY MAP

Section 1: Hero
Purpose: Establish MMG’s core promise.
Primary destination: Ecosystem overview or guided pathway.
Secondary destination: Kairos introduction.

Section 2: Guided pathways
Purpose: Help visitors identify what they want to accomplish.
Destinations: Publishing, branding, AI education, digital products, creator growth, and professional services.

Section 3: Products and resources
Purpose: Introduce practical products and educational resources.
Destinations: Relevant collections and product pages.

Section 4: Services
Purpose: Route visitors toward publishing, editorial, design, production, and business support.
Destinations: Approved service pages.

Section 5: Subscription
Purpose: Introduce personalized recurring learning and resource delivery.
Destination: Subscription explanation or onboarding page.

Section 6: Kairos
Purpose: Explain guided execution and how Kairos supports the customer.
Destination: Kairos experience or customer workspace.

Section 7: Mission and trust
Purpose: Explain MMG’s purpose, values, and Door Opener philosophy.
Destination: About or mission content where appropriate.

Section 8: Final next step
Purpose: Help the visitor continue based on their objective.
Destinations: Guided pathways, subscriptions, services, products, or Kairos.`,
  }),
  Object.freeze({
    id: "mmg-experience-first-doctrine-v1",
    title: "MMG/Kairos Experience-First Doctrine",
    aliases: [
      "experience first doctrine",
      "experience-first doctrine",
      "guided experience doctrine",
      "objective first execution",
    ],
    status: "canonical",
    version: "1.0",
    owner: "MMG / Kairos",
    scope: ["ecosystem", "command center", "customer portal", "website"],
    content: `MMG/KAIROS EXPERIENCE-FIRST DOCTRINE

The Command Center, Customer Portal, website, and broader MMG ecosystem must operate as a cohesive experience rather than a collection of disconnected tools.

Users should primarily express objectives. Kairos should translate those objectives into governed execution by consulting authoritative MMG knowledge, doctrines, specifications, project records, and approved history.

The system must continually remove unnecessary clicks, repeated input, prompt memorization, navigation complexity, and workflow interruptions.

As capabilities expand, the experience should become simpler for the user, not more complicated.

Visible progress, clear next actions, verified deliverables, and durable customer value are foundational requirements.`,
  }),
  Object.freeze({
    id: "mmg-door-opener-doctrine-v1",
    title: "MMG Door Opener Doctrine",
    aliases: [
      "door opener doctrine",
      "door openers",
      "not gatekeepers",
      "we are not gatekeepers",
    ],
    status: "canonical",
    version: "1.0",
    owner: "MMG",
    scope: ["brand", "customer experience", "publishing", "education"],
    content: `MMG DOOR OPENER DOCTRINE

We’re not gatekeepers. We’re door openers.

Mindset Media Group exists to reduce unnecessary barriers to knowledge, publishing, technology, professional production, and opportunity.

The company should help creators, entrepreneurs, authors, educators, and small businesses understand the path forward, access practical resources, and convert knowledge and experience into durable work and intellectual property.

Accessibility does not mean lowering quality. It means removing needless complexity while preserving professional standards, transparency, integrity, and customer-first service.`,
  }),
]);

export function listInternalDoctrines() {
  return DOCTRINES.map(summarizeDoctrine);
}

export function findInternalDoctrines(query, limit = 8) {
  const normalized = normalize(query);
  if (!normalized || /^(all|list|canonical|doctrine|doctrines|vault)$/.test(normalized)) {
    return DOCTRINES.slice(0, limit);
  }

  return DOCTRINES
    .map(doctrine => ({ doctrine, score: doctrineScore(doctrine, normalized) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.doctrine.title.localeCompare(right.doctrine.title))
    .slice(0, limit)
    .map(item => item.doctrine);
}

export function resolveInternalDoctrine(query) {
  return findInternalDoctrines(query, 1)[0] || null;
}

function doctrineScore(doctrine, query) {
  const title = normalize(doctrine.title);
  const id = normalize(doctrine.id);
  const aliases = doctrine.aliases.map(normalize);
  const content = normalize(doctrine.content);
  let score = 0;

  if (query === title || query === id || aliases.includes(query)) score += 1000;
  if (title.includes(query) || query.includes(title)) score += 500;
  if (aliases.some(alias => alias.includes(query) || query.includes(alias))) score += 350;

  const terms = query.split(" ").filter(term => term.length >= 3);
  for (const term of terms) {
    if (title.includes(term)) score += 35;
    if (aliases.some(alias => alias.includes(term))) score += 24;
    if (content.includes(term)) score += 3;
  }
  return score;
}

function summarizeDoctrine(doctrine) {
  return {
    id: doctrine.id,
    title: doctrine.title,
    status: doctrine.status,
    version: doctrine.version,
    owner: doctrine.owner,
    scope: [...doctrine.scope],
  };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[™®]/g, "")
    .replace(/[_–—-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
