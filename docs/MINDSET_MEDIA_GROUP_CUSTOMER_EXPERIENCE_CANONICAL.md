# Mindset Media Group Customer Experience Canonical Standard

Status: CANONICAL — LOCKED
Effective: 2026-08-08
Authority: Executive-approved production governance
Applies to: website, Shopify, Kairos customer surfaces, customer portal, native app customer surfaces, marketing pages, product/service pages, navigation, metadata, accessibility, and future customer-facing releases.

## 1. Brand naming rule

- Always write **Mindset Media Group** when the brand name is required.
- In natural customer-facing prose, prefer **we**, **our**, and **us** after the brand has been established.
- Never abbreviate Mindset Media Group in customer-facing copy, navigation, titles, metadata, labels, alt text, accessibility text, structured data, transactional language, or new canonical technical identifiers.
- Existing legacy technical identifiers may remain only where an immediate rename would break a production contract. They are migration debt, must never leak into the customer experience, and must be replaced when the dependent contract is safely migrated.

## 2. Customer transformation model

The canonical transformation is:

**Knowledge → Structure → Execution → Finished Asset → Next Opportunity**

The canonical customer lifecycle is:

**Learn → Build → Publish → Manage → Grow**

Every meaningful customer-facing page must make its role in that lifecycle clear and provide a logical next action. Kairos may connect stages only to the extent that the referenced capability is actually live.

## 3. Brand philosophy

All customer experience and editorial decisions must reinforce:

1. Purpose before product.
2. Clarity before volume.
3. Trust before scale.
4. Systems over shortcuts.
5. Stewardship over gatekeeping.
6. Durable value over temporary noise.
7. Visible progress protects momentum.
8. The finished asset is the proof.

The experience must focus primarily on what the customer is building, not on what we are building internally.

## 4. Voice

Canonical voice: direct, disciplined, practical, human, confident, accountable, premium, outcome-first.

Avoid:
- hype without evidence;
- shortcut promises;
- internal implementation jargon that does not help the customer;
- invented proof, testimonials, project states, availability, or results;
- vague calls to action when a specific action can be named.

Marketing-oriented concepts such as virality, hacks, or secret sauce must be grounded in mechanics, testing, retention, iteration, and repeatable execution rather than guarantees.

## 5. Canonical site shell

All storefront templates must use one governed site frame:

- one header;
- one primary navigation model;
- one mobile navigation model;
- one search/cart/account treatment;
- one ecosystem footer;
- one fixed Back-to-Top behavior;
- one responsive utility layer;
- one accessibility model;
- one semantic heading model;
- one reveal/motion system with reduced-motion safety.

Page or product templates may not ship their own legacy navigation/footer systems.

## 6. Canonical navigation

### Start Here
- Choose your objective

### Shop
- Publications
- Digital Assets
- All Products
- Creator Merch

### Create & Learn
- Knowledge Library
- Free Creator Toolkit
- CapCut Templates
- Knowledge Subscription

### Services
- Publishing Services
- Professional Services
- Project Guide
- Publishing FAQ

### Company
- About
- Our Work
- Kairos
- Founder
- Our Standards

### Support
- Customer Portal
- Customer Service
- Contact

Publishing Philosophy and the Mindset Media Group Promise remain available as deeper Company/footer resources rather than equally weighted primary Company destinations.

## 7. Page roles

- **About** — what Mindset Media Group is, who we serve, what we produce, and how the customer journey fits together.
- **Founder** — origin, lived experience, and why the company exists.
- **Publishing Philosophy** — publishing and stewardship doctrine.
- **Our Standards** — specific operating commitments and measurable expectations.
- **Mindset Media Group Promise** — concise customer-facing commitment.
- **Our Work** — verified proof, finished work, and real results only. It should absorb case-study functionality rather than spawn a redundant page.

Do not add page volume unless it resolves a real customer decision or operational need.

## 8. Product page standard

Every digital product page must present, in a coherent sequence:

**Outcome → Why it matters → What you will learn → What is included → Who it is for → How to use it → Format/delivery → Customer reviews → Next resource**

Digital-product commerce language:

**Instant Digital Access · No Shipping Required**

Requirements:
- one customer-visible H1;
- one purchase interface;
- no irrelevant shipping, pickup, sold-out, or duplicate native commerce UI;
- recommendation/loading modules fail gracefully and never make a finished page look incomplete;
- current product excluded from recommendation carousels;
- SEO/social metadata and image alt text are complete and accurate.

## 9. Service page standard

Every professional service page must answer:

1. What outcome am I buying?
2. What must I provide?
3. What is included?
4. What is not included?
5. What happens immediately after checkout?
6. What are the stages?
7. What affects turnaround?
8. What will I receive?
9. How do revisions work?
10. Where do I get support?
11. What should I do next?

Service commerce language:

**Professional Digital Service · Project Intake Begins After Purchase**

Use **What You Receive**, not shipping-oriented wording, for digital service deliverables.

## 10. Customer Portal standard

Unauthenticated state:
- clear secure portal purpose;
- sign-in/create-account actions;
- no simulated customer metrics, projects, deliverables, or status.

Authenticated state:
- show only real account-linked purchases, projects, files, approvals, messages, deliverables, library assets, and support activity.

Never expose development-sprint language, fake project data, placeholder future modules presented as live, or implementation notes to customers.

## 11. Kairos claims

Every Kairos reference must accurately reflect capability maturity.

- Live capability may be described as live only when operational on that surface.
- Future capability must be explicitly characterized as future/developing and must not imply availability.
- "Powered by Kairos" or equivalent claims may appear only where Kairos literally powers the production experience being described.
- Internal architecture detail is omitted unless it materially helps the customer understand an outcome.

## 12. Subscription terminology

Canonical commercial identity: **Mindset Media Group Knowledge Subscription™**.

Use **subscription**, not membership, unless a future offer has genuine membership/community benefits that justify a separate product category.

## 13. Publishing precision

Do not imply that a preparation service itself publishes a customer's book when publication remains the customer's responsibility.

Preferred framing:

**Turn your manuscript into a publication-ready book package.**

Claims must remain consistent with actual deliverables, third-party platform responsibilities, policies, and service scope.

## 14. CTA standard

Calls to action should name the next action or outcome. Preferred vocabulary includes:

- Choose Your Path
- Find the Right Resource
- See What's Included
- Start My Publishing Project
- Open My Customer Hub
- Compare Publishing Packages
- Get the Digital Guide
- Prepare My Manuscript
- Continue My Learning Path
- Ask About My Project

Generic actions such as Learn More, Explore, View, and Continue should be replaced when the destination/action can be more specific.

## 15. Catalog taxonomy

- **Publications** — books and guides.
- **Digital Assets** — downloadable resources.
- **Publishing Services** — professional publishing services.
- **Knowledge Subscription** — recurring knowledge support.
- **All Products** — every product that is actually public and purchasable.

A label that says All Products must not silently represent a partial catalog.

## 16. Accessibility and trust

- Maintain WCAG-conscious semantics, keyboard support, focus visibility, image alt text, contrast, readable motion behavior, and reduced-motion support.
- Maintain an Accessibility Statement as a footer-level resource.
- Never manufacture social proof, case studies, inventory state, product availability, customer progress, or customer outcomes.
- Broken internal links, obsolete handles, duplicate titles, contradictory delivery language, and inaccurate metadata are release blockers.

## 17. Release governance

- v3.7 remains the protected production rollback baseline for the 2026-08-08 reconciliation.
- v3.8 is the canonical reconciliation release line.
- Staging changes must be validated before promotion.
- A release cannot be declared complete while any P0 customer-experience, accuracy, accessibility, navigation, commerce-language, or broken-link defect remains open.
- Future changes must preserve this standard unless an executive-approved canonical revision explicitly supersedes it.
