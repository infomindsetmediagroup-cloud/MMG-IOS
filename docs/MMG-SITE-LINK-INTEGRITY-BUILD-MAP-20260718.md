# MMG Site Link Integrity & Supporting-Page Build Map

**Canonical storefront:** `https://themindsetmediagroup.com`  
**Locked navigation publisher:** `kairos-native-navigation-theme-publisher-20260718-8`  
**Rule:** every visible internal link must resolve to a purposeful page or Shopify system destination. No dead links, empty pages, accidental homepage fallbacks, or undocumented legacy slugs.

## Audit contract

The automated crawler must inventory Shopify sitemap URLs and recursively inspect every same-origin link it discovers. Each destination is classified as:

- **Healthy:** HTTP 2xx, intentional title/H1, substantive content, and correct destination.
- **Redirect:** resolves but uses a noncanonical or legacy slug; update the source link unless the redirect is intentionally retained.
- **Missing:** HTTP 4xx/5xx or an internal destination not returned by the crawl.
- **Thin/placeholder:** resolves but lacks sufficient useful page content.
- **Misrouted:** resolves to the homepage, catalog, or unrelated destination instead of the linked promise.
- **Outside sitemap:** reachable through links but absent from Shopify's published sitemap; verify visibility and canonical status.

## Current architecture observed

### Primary storefront destinations

| Area | Canonical destination | Build status / required action |
|---|---|---|
| Home | `/` | Live; audit every CTA and footer link. |
| Catalog / Products | `/collections` and `/collections/all` | Consolidate user-facing intent; use one canonical Products landing and retain Shopify collection routes for commerce. |
| Publishing Services | `/pages/publishing-services` | Live; validate every service card against a real product or supporting service explainer. |
| Knowledge Library | current live destination must be reconciled | Ensure top-level route exists, is substantive, and links only to live resources/products. |
| Customer Portal | `/pages/customer-portal` | Live; system/account links may route to authenticated application flows. |
| Company | `/pages/about-mindset-media-group` | Live runtime hub; supporting destinations must be completed and canonicalized. |

### Company supporting-page set

The Company hub currently declares these destinations. Every one must contain purpose-built content:

1. `/pages/about-mindset-media-group` — Company hub / overview.
2. `/pages/our-story` — origin, resilience, founder journey, and why MMG exists.
3. `/pages/mission` — current mission and practical user outcome.
4. `/pages/vision` — long-term unified knowledge and execution ecosystem.
5. `/pages/values` — stewardship, accessibility, resilience, clarity, faith-informed service without exclusion, and responsible execution.
6. `/pages/contact` — inquiry pathways, expectations, service/support routing, and response boundaries.
7. `/pages/partnerships` — eligible partnership types, evaluation criteria, process, and contact CTA.
8. `/pages/accessibility` — accessibility commitment, feedback method, known limitations, and improvement process.
9. `/policies/privacy-policy` — Shopify policy page; verify completeness and link accuracy.
10. `/policies/terms-of-service` — Shopify policy page; verify terms match digital products and services.
11. `/policies/refund-policy` — distinguish digital goods, custom services, cancellations, and defects.
12. `/policies/shipping-policy` — distinguish physical shipping from digital delivery and service deliverables.

### Legacy Company destinations already visible elsewhere

These existing routes must either remain canonical supporting pages or be intentionally redirected and all source links updated:

- `/pages/about`
- `/pages/our-standards`
- `/pages/publishing-philosophy`
- Founder page (exact slug to be confirmed by automated crawl)
- MMG Promise page (exact slug to be confirmed by automated crawl)

**Reconciliation decision:** preserve useful legacy pages as deeper doctrine pages, while the new Company hub becomes the directory. Do not create duplicate pages with substantially identical copy.

### Homepage journey destinations requiring verification

- Free Creator Toolkit
- Guided journey / project guide
- All publishing service product cards
- Creator's Bible product
- AI Prompting for Beginners product
- Failure Advantage product
- CapCut Templates
- Knowledge Library
- Customer Portal
- TikTok external profile

Each card or CTA must resolve to the exact resource named in its label. A link that silently returns to `/`, redirects to a generic catalog, or lands on an unrelated page fails the contract.

## Build sequence

### Phase 1 — Inventory and canonical routing

1. Run the live crawler and retain its JSON artifact.
2. Resolve every legacy/current slug pair.
3. Choose one canonical URL per concept.
4. Update source links to canonical URLs; keep redirects only for inbound compatibility.
5. Separate Shopify system routes (`/account`, cart, checkout, policies) from authored content routes.

**Exit gate:** zero unresolved internal links; every redirect has an explicit reason.

### Phase 2 — Company and trust layer

Build or complete Our Story, Mission, Vision, Values, Contact, Partnerships, and Accessibility. Reconcile Our Standards, Publishing Philosophy, Founder, and MMG Promise as deeper doctrine pages linked from the Company family.

**Exit gate:** every Company hub card opens a substantive page with a clear next action and links back into the Company directory or relevant MMG pathway.

### Phase 3 — Education and discovery layer

Complete Products, Knowledge Library, Free Toolkit, CapCut Templates, Project Guide, and any creator-education category pages. Remove duplicate or ambiguous catalog entry points.

**Exit gate:** every educational CTA leads to an actual resource, collection, or product; no placeholder categories.

### Phase 4 — Services layer

Audit each service card and product detail page. Add supporting explainers for process, inputs, deliverables, revisions, eligibility, timelines, and post-purchase workflow. Ensure product/service distinctions are explicit.

**Exit gate:** every service link resolves; pricing remains Shopify-authoritative; claims match actual delivery capability.

### Phase 5 — Products and fulfillment

Audit every product URL from the product sitemap, collection pages, recommendations, and homepage. Verify assets, purchase eligibility, delivery method, account/library behavior, related products, and policy links.

**Exit gate:** zero missing products, self-recommendations, duplicate recommendation links, or incorrect fulfillment claims.

### Phase 6 — Global footer, header, and policy reconciliation

Re-run the crawl after all page builds. Correct header, drawer, footer, inline CTA, product, policy, and account links. Confirm mobile and desktop parity.

**Final release gate:**

- zero HTTP 4xx/5xx internal destinations;
- zero unresolved internal links;
- zero unintended homepage fallbacks;
- zero thin authored pages;
- canonical slugs used at every source;
- all published pages reachable from a logical hub unless intentionally private;
- v8 navigation publisher unchanged and verified live.

## Permanent operating rule

Every page publisher must declare its outbound internal links in verification output. The release workflow must crawl those links after publication and fail when any destination is missing, thin, or misrouted. The full-site crawler runs after structural releases and on a recurring schedule so future Shopify edits cannot silently reintroduce dead routes.
