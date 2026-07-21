# QA Contract

## Static source

- Exactly one H1.
- Required IDs: `objectives`, `included`, `system`, `outcomes`, `purchase`, `delivery`, `terms`, `support`, `next`.
- CSS root scoped to `#mmg-ai-image-mastery`.
- No `100vw`.
- Portrait media uses `object-fit: contain`.
- Keyboard focus uses a visible 3 px outline.
- Reduced-motion mode keeps all content visible.
- JavaScript contains no Admin API, secret, token, or GraphQL mutation pattern.
- Product hydration uses `/products/ai-image-mastery.js` with same-origin credentials.
- Cart mutation uses `/cart/add.js` only after a customer click.

## Browser matrix

320, 375, 768, 1024, and 1440 px must each pass:

- document, body, and root scroll width equal viewport width;
- one H1;
- one enabled purchase button after hydration;
- live `$9.95` price;
- no hidden reveal elements after the fail-safe window;
- contained product image.

## Functional evidence

- Cart payload must be `{ "id": 48655433498778, "quantity": 1 }`.
- Keyboard focus outline width must be 3 px.
- Reduced-motion opacity must be 1 and transform must be none.

## Live acceptance

Local browser evidence is supplemental. Post-assignment live storefront acceptance remains required.
