# MMG Web Data Boundary Map

## Public Data
Allowed on public routes and public Kairos mode.

Examples:
- Public product information
- Public brand doctrine
- Public Knowledge Library descriptions
- Public policies
- Public founder story
- Public education content

## Customer Data
Allowed only after authenticated customer access.

Examples:
- Purchases
- Downloads
- Subscription status
- Customer profile
- Project workspace records
- Customer Knowledge Vault records
- Personalized recommendations

## Admin Data
Allowed only after authenticated admin access.

Examples:
- Product publishing queues
- Customer operations overview
- Internal release checklists
- Trust Layer audit records
- Runtime health metadata
- Department configuration

## Server-Only Data
Never exposed to clients.

Examples:
- Provider credentials
- Privileged instructions
- Internal routing logic
- Environment variables
- Operational notes
- Sensitive logs

## Persistence Boundary
The persistence foundation defines repository contracts for:
- Conversations.
- Messages.
- Audit records.
- Work orders.
- Knowledge Event candidates.

The current in-memory implementation is a development adapter only. It provides runtime structure and test coverage but is not durable and must not be treated as production storage.

Production storage must preserve:
- Customer isolation.
- Admin-only operational access.
- Audit durability.
- Knowledge Event review status.
- Work-order lifecycle history.

## Enforcement Rule
Client-provided mode values are requests, not authority. The server must resolve actual permissions before using customer or admin data.

## Temporary Development Override
`x-kairos-role` and `x-kairos-subject` headers are not trusted by default. They may be used only for local development when `KAIROS_ENABLE_DEV_ROLE_HEADERS=true` and `NODE_ENV` is not `production`.

Production customer and admin access must be backed by a real authenticated session before private data, audit data, customer intelligence, or operational controls are exposed.
