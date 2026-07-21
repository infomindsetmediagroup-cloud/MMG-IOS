# MMG Commerce Staging Host Runtime QA

## Source and release identity

- [ ] The workflow checks out the exact 40-character release commit.
- [ ] The release ID is immutable and valid.
- [ ] TypeScript validation passes.
- [ ] The focused Cloudflare staging-host tests pass.
- [ ] Shopify governance passes.
- [ ] Canonical service-product validation passes.
- [ ] No secret, database URL, provider token, or customer identifier is committed.

## Cloudflare isolation

- [ ] The Worker name is exactly `mmg-commerce-staging`.
- [ ] The runtime is restricted to `MMG_COMMERCE_ENVIRONMENT=staging`.
- [ ] The deployment uses a separate protected `mmg-commerce-staging` GitHub Environment.
- [ ] The host does not replace or modify the production Worker.
- [ ] The upstream service binding name ends in `-staging`.
- [ ] Upload and deploy fail when the upstream service binding is missing.
- [ ] No route falls back to a production URL or Worker.

## Hyperdrive and PostgreSQL

- [ ] The `HYPERDRIVE` binding references the isolated staging PostgreSQL database.
- [ ] The Worker does not receive a raw database URL through vars or secrets.
- [ ] Only `postgres:` and `postgresql:` Hyperdrive connection strings are accepted.
- [ ] Query clients close after completion.
- [ ] Transactions use one client through BEGIN, COMMIT, or ROLLBACK.
- [ ] A failed transaction attempts rollback and does not commit.
- [ ] Connection and statement timeouts remain bounded.
- [ ] The database contains no production customer records.

## Credentials and secrets

- [ ] Operations, integration, rehearsal, rehearsal-adapter, and runtime-control credentials are at least 32 characters and mutually distinct.
- [ ] Admin dashboard authentication uses a separate credential.
- [ ] Provider health uses a separate credential.
- [ ] Wrangler declares all eight required secrets.
- [ ] The deploy workflow uploads secrets with the exact Worker version.
- [ ] The temporary secret file is mode 0600 and removed after the action.
- [ ] Sanitized artifacts contain secret names only, never values.

## Health and routing

- [ ] `GET /healthz` returns the exact release ID and commit SHA.
- [ ] `HEAD /healthz` returns the same release headers without a response body.
- [ ] Health reports `upstreamConfigured=true` after deployment.
- [ ] Health reports `publicationAllowed=false`.
- [ ] Health reports `liveCustomerDataAllowed=false`.
- [ ] Host-owned operations, readiness, integration, rehearsal, Admin, and runtime-control routes are handled locally.
- [ ] Governed application routes are forwarded only through the staging service binding.
- [ ] Forwarded responses are stamped with the release ID and upstream marker.
- [ ] Unknown routes return 404 when the upstream binding is absent.

## Provider heartbeats

- [ ] Heartbeat refresh supports POST only.
- [ ] Missing internal marker is rejected.
- [ ] Invalid integration credential is rejected.
- [ ] A mismatched Origin header is rejected.
- [ ] Database health uses a real query.
- [ ] Runtime-route health uses the deployed staging host.
- [ ] Runtime-control health requires the complete control set.
- [ ] Admin-auth health requires the separate Admin credential.
- [ ] Alert, scheduler, dispatcher, and storage-signer endpoints use HTTPS.
- [ ] Remote providers identify the exact release through JSON or `X-MMG-Release-Id`.
- [ ] Release mismatch is degraded.
- [ ] Network or non-2xx provider failure is unavailable.
- [ ] Exactly eight durable heartbeats are written before readiness.

## Workflow ordering

- [ ] Local protected-environment preflight runs before migrations.
- [ ] Migrations 001–011 run before release registration.
- [ ] Release registration runs before safe-state bootstrap.
- [ ] Safe-state bootstrap runs before provider-heartbeat refresh.
- [ ] Provider-heartbeat refresh runs before protected runtime readiness.
- [ ] Rehearsal runs only after readiness is fully passed.
- [ ] Final verification remains exact-release bound.
- [ ] The workflow returns to Paused 0% after rehearsal teardown.

## Deployment actions

- [ ] `validate` performs a Wrangler dry run only.
- [ ] `upload` creates an immutable version without serving traffic.
- [ ] `deploy` verifies the exact release through `/healthz`.
- [ ] The monitor remains disabled unless explicitly enabled by workflow input.
- [ ] Sanitized deployment artifacts are retained for 30 days.

## Safety boundary

- [ ] No Shopify mutation is performed.
- [ ] Subscription checkout remains disabled.
- [ ] Product publication remains disabled.
- [ ] No live customer cohort is exposed.
- [ ] No production database or upstream binding is used.
- [ ] No delivered ownership is revoked.
