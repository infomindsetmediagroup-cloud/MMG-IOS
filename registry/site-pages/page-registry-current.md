# MMG Live Site Registry — Canonical Current Baseline

**Status:** Active and approved  
**Recorded:** July 20, 2026  
**Canonical domain:** `https://themindsetmediagroup.com`  
**Machine-readable companion:** `registry/site-pages/site-url-registry-current.json`

This registry is the authoritative current URL inventory for the live MMG Shopify site. Kairos and future website work must use these exact routes unless an executive-approved migration or redirect replaces them.

## Governance Rules

- Treat every listed route as active and canonical.
- Preserve the non-`www` HTTPS domain.
- Do not invent replacement handles from page titles.
- Keep complete production source under `shopify/` when available; a live URL reference does not replace source control.
- Customer and admin portals retain their existing authentication and privacy boundaries.
- Any route change requires redirect planning, registry updates, navigation QA, and internal-link QA.

## Homepage

| Page | Canonical URL | Type | Access | Role |
|---|---|---|---|---|
| MMG Homepage | `https://themindsetmediagroup.com/` | Homepage | Public | Canonical visual and ecosystem entry baseline. |

## Active Product Pages

| Product | Canonical URL | Product type | Access | Role |
|---|---|---|---|---|
| AI Image Mastery™ | `https://themindsetmediagroup.com/products/ai-image-mastery` | Digital download | Public | Canonical active digital-product reference. |
| Professional Cover Design Service™ | `https://themindsetmediagroup.com/products/professional-cover-design-service` | Service | Public | Canonical active multi-variant service-product reference. |

## Active Public Pages

| Page | Canonical URL | Page class | Access | Role |
|---|---|---|---|---|
| Contact | `https://themindsetmediagroup.com/pages/contact` | Support | Public | Customer contact destination. |
| Data Sharing Opt-Out | `https://themindsetmediagroup.com/pages/data-sharing-opt-out` | Privacy | Public | Data-sharing preference and privacy control. |
| Free Creator Toolkit | `https://themindsetmediagroup.com/pages/free-creator-toolkit` | Lead resource | Public | Free creator-resource landing page. |
| CapCut Templates | `https://themindsetmediagroup.com/pages/capcut-templates` | Creator resource | Public | Template-resource landing page. |
| MMG Creator Merch | `https://themindsetmediagroup.com/pages/mmg-creator-merch` | Merchandising | Public | Creator merchandise landing page. |
| TikTok Secret Sauce | `https://themindsetmediagroup.com/pages/tiktok-secret-sauce` | Creator education | Public | TikTok education and resource landing page. |
| Publishing Services | `https://themindsetmediagroup.com/pages/publishing-services` | Services landing page | Public | Primary publishing-services ecosystem entry. |
| Customer Service | `https://themindsetmediagroup.com/pages/customer-service` | Policy and support | Public | Consolidated customer-service and policy center. |
| About | `https://themindsetmediagroup.com/pages/about` | Company | Public | Canonical company overview. |
| Our Standards | `https://themindsetmediagroup.com/pages/our-standards` | Trust and standards | Public | Quality, ethics, and operating standards. |
| Publishing Philosophy | `https://themindsetmediagroup.com/pages/publishing-philosophy` | Brand doctrine | Public | Public publishing philosophy and stewardship doctrine. |
| Knowledge Library | `https://themindsetmediagroup.com/pages/knowledge-library` | Catalog and learning | Public / authenticated modes | Shared digital catalog, subscription-selection surface, and customer library entry. |
| Founder | `https://themindsetmediagroup.com/pages/founder` | Company | Public | Founder story and credibility page. |
| MMG Promise | `https://themindsetmediagroup.com/pages/mmg-promise` | Trust | Public | Canonical customer promise. |
| Project Guide | `https://themindsetmediagroup.com/pages/project-guide` | Customer onboarding | Public | Service onboarding and project-start reference. |

## Active Portal Pages

| Page | Canonical URL | Access | Role |
|---|---|---|---|
| Customer Portal | `https://themindsetmediagroup.com/pages/customer-portal` | Customer-facing / authenticated workflows | Project intake, delivery, subscriptions, My Library, and customer operations. |
| Admin Portal | `https://themindsetmediagroup.com/pages/admin-portal` | Restricted administrative access | Internal operational control surface; never expose private controls publicly. |

## Active Collection

| Collection | Canonical URL | Access | Role |
|---|---|---|---|
| Frontpage Collection | `https://themindsetmediagroup.com/collections/frontpage` | Public | Active Shopify product-grid collection reference. |

## Canonical Route Corrections

The following earlier baseline assumptions are superseded:

- Company overview is `/pages/about`, not `/pages/about-mindset-media-group`.
- Customer promise is `/pages/mmg-promise`, not `/pages/the-mmg-promise`.
- The active collection reference is `/collections/frontpage`, not `/collections/all`.

## Source-Control Status

These URLs are canonical live references. Each page or product should additionally have complete source, metadata, QA, and release records under the appropriate `shopify/` path as those assets are imported or rebuilt.

## Validation Rule

Every future page, product, navigation, cart, portal, subscription, or Knowledge Library release must validate:

1. All canonical routes resolve correctly.
2. Internal calls to action use the exact registered route.
3. Protected portal boundaries remain intact.
4. No approved route is silently renamed or replaced.
5. Redirects exist before any handle migration is published.
