export const KAIROS_WEBSITE_BUILD_DOCTRINE_VERSION='2026.07.15-v1';

export const KAIROS_WEBSITE_BUILD_DOCTRINE=Object.freeze({
  id:'mmg-kairos-enterprise-website-build-doctrine',
  status:'canonical',
  purpose:'Enable Kairos to design, build, preview, verify, revise, and deploy a professional experience-first Shopify website for Mindset Media Group.',
  operatingPrinciples:[
    'Begin with the customer objective and intended next action, not decorative components.',
    'Use the existing MMG content, products, services, doctrines, brand assets, and Shopify data as the source material.',
    'Translate internal platform language into plain customer language before rendering public copy.',
    'Treat clarity, trust, accessibility, speed, mobile usability, and conversion as hard requirements.',
    'Use staging-first execution with preview, verification, rollback evidence, and explicit production approval.',
    'External inference providers are prohibited.'
  ],
  benchmarkPatterns:{
    apple:[
      'One dominant message per visual section.',
      'Large editorial typography, disciplined whitespace, strong product imagery, and restrained controls.',
      'Two-action pattern where appropriate: learn/explore first and buy/start second.',
      'Motion supports hierarchy and comprehension; it never blocks reading or interaction.'
    ],
    nike:[
      'Campaign-led visual storytelling tied directly to a category, product, or customer identity.',
      'Clear top-level shopping paths and strong search, account, and cart access.',
      'Editorial modules transition into curated product or service discovery.',
      'Use authentic people, outcomes, and use cases rather than generic decoration.'
    ],
    categoryLeaders:[
      'Persistent, predictable navigation and recognizable interaction conventions.',
      'Progressive disclosure: show the essential decision first, then details.',
      'Strong trust signals near decision points.',
      'Fast, responsive, accessible pages with measurable quality gates.',
      'Every page has a primary journey and one primary conversion objective.'
    ]
  },
  canonicalCustomerJourney:[
    {stage:'orient',question:'What is this and is it for me?',requirements:['Immediate value proposition','Audience recognition','Primary next action','No internal jargon']},
    {stage:'discover',question:'Where should I go?',requirements:['Guided paths by customer objective','Products, services, education, and ecosystem separated clearly','Search and navigation remain available']},
    {stage:'understand',question:'Why should I trust this?',requirements:['Outcome-led explanation','Proof, examples, policies, and process','Kairos guidance only where useful']},
    {stage:'evaluate',question:'Which option fits me?',requirements:['Clear comparison','Transparent price and deliverables','Eligibility, limitations, and expected timeline']},
    {stage:'act',question:'What happens when I continue?',requirements:['One dominant CTA','Low-friction cart, intake, account, or project action','Visible confirmation and recoverable errors']},
    {stage:'continue',question:'What is my next step after purchase or signup?',requirements:['Portal handoff','Visible project or learning progress','Related resource or next milestone']}
  ],
  informationArchitecture:{
    primaryNavigation:['Learn','Create','Publish','Grow','Shop','About'],
    utilities:['Search','Account','Cart'],
    rules:[
      'Navigation labels must describe customer destinations, not departments or internal systems.',
      'Keep primary navigation shallow; use structured menus for deeper categories.',
      'Every landing page must provide a clear path forward without requiring the user to return to the homepage.',
      'Preserve the canonical native Shopify header architecture.'
    ]
  },
  homepageSequence:[
    'Native Shopify header and concise announcement utility',
    'Primary hero: customer outcome, supporting sentence, primary CTA, secondary CTA, signature visual',
    'Guided objective selector: Learn, Create, Publish, or Grow',
    'Featured products and services organized by customer outcome',
    'How MMG and Kairos work together in customer language',
    'Proof and trust: deliverables, policies, examples, testimonials when available',
    'Learning journey and recommended next steps',
    'Final focused CTA and complete footer'
  ],
  componentRules:{
    sections:'Each section must have one job, one heading, and a clear visual hierarchy.',
    cards:'Cards must represent a real destination or action; no decorative dead cards.',
    callsToAction:'Use specific verbs. Never place multiple competing primary CTAs in one section.',
    imagery:'Use owned or licensed assets that demonstrate people, products, outcomes, or process. Maintain focal-point-safe crops across breakpoints.',
    motion:'Use subtle reveal, parallax, scale, or transition only when it improves comprehension. Respect prefers-reduced-motion.',
    kairosMoments:'Use brief optional audio or assistant guidance only at high-friction or high-value decisions. Never autoplay intrusive audio.',
    copy:'Lead with customer outcomes, then explain the mechanism. Keep paragraphs scannable and remove vague hype.'
  },
  visualSystem:{
    direction:'Premium editorial, Apple-inspired restraint, MMG-owned identity; never clone Apple or Nike.',
    layout:['Mobile-first','Responsive fluid grid','Generous spacing','Strong alignment','Consistent section rhythm'],
    typography:['One display hierarchy','Readable body measure','Clear CTA labels','No artificial text compression'],
    surfaces:['Use depth and translucency sparingly','Maintain legible contrast','Avoid excessive glass effects behind body copy'],
    assetPriority:['MMG originals','Product and service deliverables','Customer-relevant lifestyle imagery','Abstract imagery only when it supports meaning']
  },
  qualityGates:{
    accessibility:['Semantic landmarks','Single descriptive H1','Keyboard navigation','Visible focus','Alt text','Sufficient contrast','Reduced motion support','Touch targets suitable for mobile'],
    performance:['Optimize responsive images','Lazy-load below-fold media','Avoid render-blocking scripts','Minimize animation cost','Prevent layout shift'],
    seo:['Unique title and meta description','Canonical URL','Logical heading hierarchy','Structured internal links','Product and organization schema where applicable'],
    commerce:['Price, format, delivery, policies, variants, and CTA remain unambiguous','Cart and checkout paths are never obstructed','Digital products and services use the correct fulfillment or intake flow'],
    verification:['Desktop and mobile preview','Broken-link check','Console-error check','Header, search, account, cart, forms, variants, and CTAs tested','Staging diff recorded','Rollback package recorded']
  },
  executionProtocol:[
    '1. INSPECT: Read the current staging theme, content inventory, Shopify catalog, assets, and governing MMG doctrines.',
    '2. CLASSIFY: Determine whether the objective is content-only, style-only, structural, component, page-build, or site-wide.',
    '3. JOURNEY PLAN: Define audience, page objective, primary action, required proof, and downstream destination.',
    '4. BUILD PLAN: Name exact files, components, assets, copy blocks, risks, acceptance criteria, and rollback scope.',
    '5. GENERATE: Produce deterministic Liquid, JSON templates, CSS, and minimal JavaScript using the existing theme architecture.',
    '6. STAGE: Write only to the verified non-live Kairos Staging theme.',
    '7. PREVIEW: Return a working preview URL plus a human-readable change summary.',
    '8. VERIFY: Execute automated and visual checks against every acceptance criterion.',
    '9. REVISE: Correct failed checks without requiring the user to restate the objective.',
    '10. APPROVE: Present the verified package for explicit production approval.',
    '11. APPLY: Publish the approved package, verify persistence, and record deployment evidence.',
    '12. CONTINUE: Recommend the next highest-value page or journey improvement based on the canonical backlog.'
  ],
  prohibitedBehaviors:[
    'Do not produce a visual clone of another company.',
    'Do not use internal registry IDs, implementation labels, or engineering jargon in customer-facing copy.',
    'Do not replace Shopify-native commerce behavior with fragile custom behavior without necessity.',
    'Do not create fake testimonials, metrics, scarcity, reviews, or customer claims.',
    'Do not declare success without a functioning preview and verification evidence.',
    'Do not mutate the live MAIN theme before explicit production approval.',
    'Do not stop at a plan when the authorized objective requires an executable build.'
  ]
});

export function getKairosWebsiteBuildInstructionSet(){
  return JSON.parse(JSON.stringify(KAIROS_WEBSITE_BUILD_DOCTRINE));
}
