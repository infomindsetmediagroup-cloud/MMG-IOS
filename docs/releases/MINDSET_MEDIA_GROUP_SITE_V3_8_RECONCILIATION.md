# Mindset Media Group Site v3.8 Reconciliation

Status: ACTIVE RELEASE GATE
Baseline: v3.7 production / protected rollback
Target: v3.8 unpublished staging theme
Canonical governance: `docs/MINDSET_MEDIA_GROUP_CUSTOMER_EXPERIENCE_CANONICAL.md`

## Release objective

Reconcile the storefront into one accurate, immersive customer experience without redesigning the approved visual foundation. v3.8 must remove legacy shell drift, contradictory commerce language, obsolete terminology, prototype leakage, broken customer paths, and inconsistent brand naming while preserving approved mobile behavior and improving desktop consistency.

## P0 acceptance gates

- [ ] No customer-facing abbreviation of Mindset Media Group remains in titles, navigation, body copy, metadata, alt text, structured data, portal copy, product/service copy, or template-generated labels.
- [ ] Canonical header/navigation/footer/page frame is used across homepage, standard pages, collection pages, digital products, service products, merch, and portal surfaces.
- [ ] Desktop page frame uses intentional full-width composition with consistent side padding; no arbitrary mix of full-bleed and constrained sections.
- [ ] Mobile behavior remains consistent with the approved production experience.
- [ ] One customer-visible H1 per page/product.
- [ ] Digital/service products do not expose irrelevant native shipping, pickup, sold-out, duplicate quantity, or duplicate add-to-cart UI.
- [ ] Digital products state: `Instant Digital Access · No Shipping Required` where delivery clarification is needed.
- [ ] Service products state: `Professional Digital Service · Project Intake Begins After Purchase` where fulfillment clarification is needed.
- [ ] Obsolete The Failure Advantage references are removed from customer-facing journeys and the retired URL routes safely to the current canonical product.
- [ ] All Products represents every public purchasable product, subject only to deliberate catalog eligibility rules.
- [ ] Customer Portal contains no simulated customer state, internal sprint language, or future placeholders presented as live.
- [ ] Kairos claims distinguish operational capability from future capability consistently.
- [ ] Knowledge Subscription terminology is canonical; membership terminology is removed unless explicitly required by a distinct future offer.
- [ ] No broken primary-navigation, footer, product-recommendation, customer-support, or internal journey links.

## P1 acceptance gates

- [ ] Main navigation follows the canonical customer journey architecture.
- [ ] Publishing Philosophy and the Mindset Media Group Promise are deeper Company/footer resources, not equally weighted primary Company choices.
- [ ] Page-to-page journey aligns to `Learn → Build → Publish → Manage → Grow`.
- [ ] Publishing-service copy does not overstate publication responsibility.
- [ ] `What You Receive` replaces shipping-oriented language for digital service deliverables.
- [ ] Service pages include clear `Not Included` scope.
- [ ] CTA language is action-specific wherever the next action is known.
- [ ] Internal architecture jargon is removed where it does not improve customer understanding.
- [ ] Dynamic recommendation/loading states fail gracefully.

## P2 acceptance gates

- [ ] About, Founder, Publishing Philosophy, Our Standards, and the Mindset Media Group Promise have distinct editorial jobs and do not redundantly repeat the same philosophy.
- [ ] Our Work contains only verifiable proof/results and is the preferred future case-study surface.
- [ ] Accessibility Statement exists as a footer-level resource.
- [ ] Sitewide alt text, SEO titles, meta descriptions, canonical behavior, semantic headings, and structured data are reconciled.
- [ ] Reveal/motion behavior is consistent on all approved non-product content surfaces and respects reduced-motion preferences.
- [ ] Fixed Back-to-Top behavior is consistent sitewide.

## QA matrix

Validate at minimum:

1. Homepage
2. Start Here
3. Publications
4. Digital Assets
5. Knowledge Library
6. Free Creator Toolkit
7. CapCut Templates
8. Knowledge Subscription
9. Professional Services
10. Publishing Services
11. Publishing FAQ
12. Project Guide
13. About
14. Our Work
15. Kairos
16. Founder
17. Our Standards
18. Publishing Philosophy
19. Mindset Media Group Promise
20. Customer Portal
21. Customer Service
22. Contact
23. All Products collection
24. Representative digital product
25. Representative service product
26. Creator Merch
27. Legal/footer resources
28. Search/cart/account shell

For each surface verify desktop, mobile, copy accuracy, navigation, heading hierarchy, links, CTA destination, focus/keyboard behavior, image alt text, metadata, responsive spacing, motion, reduced-motion behavior, and customer-facing brand naming.

## Promotion rule

v3.8 is not promoted until all P0 gates pass and all material P1 defects are closed or explicitly documented as non-blocking. v3.7 remains untouched as rollback until v3.8 production validation is complete.
