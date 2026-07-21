# Canonical Service Product QA

## Contract checks

- [ ] Product GID, handle, title, type, status, option, variants, SKUs, and prices match `contract.json`.
- [ ] All variants remain untracked and non-shipping.
- [ ] Growth remains the default visual selection.
- [ ] One purchase represents one project.
- [ ] Project Guide delivery and Customer Portal intake are explicit.

## Storefront checks

- [ ] Exactly one visible H1.
- [ ] Heading hierarchy is logical.
- [ ] Native Shopify header and footer remain intact.
- [ ] No horizontal overflow at 320, 375, 768, 1024, and 1440 CSS pixels.
- [ ] Portrait media uses `object-fit: contain` and is not cropped.
- [ ] All actions are keyboard reachable and have visible focus treatment.
- [ ] Reduced-motion mode removes reveal and smooth-scroll dependencies.
- [ ] Failure to load product JSON leaves readable content and disables unsafe purchase actions.

## Commerce checks

- [ ] Product hydration is read-only.
- [ ] Cart mutation occurs only after a customer click.
- [ ] Variant IDs come from the live product response, then are matched to the exact tier name.
- [ ] Unavailable or unresolved variants cannot be submitted.
- [ ] Cart success and failure messages use `aria-live`.
- [ ] No product, price, inventory, customer, order, or theme mutation exists in client code.

## Journey checks

- [ ] Hero purchase action reaches the package section.
- [ ] Deliverables, process, visible progress, scope, and related-next-step sections remain present.
- [ ] Reserved service links retain their exact handles until the real products replace the temporary redirects.
- [ ] Customer Portal and customer-service links use canonical routes.

## Deployment checks

- [ ] Shopify AI Toolkit schema validation passes for preflight and deployment operations.
- [ ] Fresh live snapshot matches the manifest.
- [ ] Rollback source is captured before any write.
- [ ] Production approval names the exact deployment change-set ID.
- [ ] Post-deployment checks validate page rendering, tier prices, add-to-cart behavior, and redirect integrity.
