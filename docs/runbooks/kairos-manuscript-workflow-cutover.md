# Kairos Manuscript Workflow Cutover

## Canonical execution path

New manuscript production starts use the existing public contract:

```text
POST /api/production-registry/manuscripts/:projectId/generation-job
```

The production entrypoint intercepts that POST before the legacy registry handler and routes it through the name-addressed `KairosProjectAgent`. The Agent starts `KAIROS_MANUSCRIPT_WORKFLOW`, and the Workflow writes source-grounded progress and outputs to the existing `KairosProject` registry.

GET and DELETE requests continue to use the existing generation-job registry contract so mobile clients do not require a route migration.

## Production configuration

```toml
KAIROS_MANUSCRIPT_START_MODE = "workflow"
KAIROS_MANUSCRIPT_LEGACY_ALARM_ROLLBACK_ENABLED = "true"
```

`workflow` is the canonical mode. The required bindings are:

- `KAIROS_PROJECT_AGENT`
- `KAIROS_MANUSCRIPT_WORKFLOW`
- `KAIROS_PROJECTS`

Kairos returns `GENERATION_WORKFLOW_UNAVAILABLE` when the durable path is selected but unavailable. It does not silently downgrade to the legacy alarm runner.

## Runtime certification

Check:

```text
GET /api/kairos/runtime/health
```

The response must report:

```json
{
  "workflow": "ready",
  "orchestration": {
    "manuscriptStartMode": "workflow",
    "durableManuscriptWorkflow": "ready",
    "automaticLegacyFallback": false
  }
}
```

A generation start response must include:

- `startMode: workflow`
- `executionMode: manuscript-generation-v1`
- a Workflow instance identifier
- a queued or running status

The existing generation-job GET route must then return durable progress and ultimately a completed job with the output checksum and immutable-original metadata.

## Governed rollback

Rollback is explicit and temporary:

```toml
KAIROS_MANUSCRIPT_START_MODE = "legacy-alarm"
KAIROS_MANUSCRIPT_LEGACY_ALARM_ROLLBACK_ENABLED = "true"
```

Both settings are required. Setting the mode to `legacy-alarm` while rollback is disabled leaves Workflow as the selected path.

Rollback does not modify Shopify permissions, package approval, live publication approval, customer-delivery verification, or website-mutation restrictions.

## Retirement gate

Do not remove the alarm implementation until the durable path has completed production certification for:

1. Source integrity and immutable-original preservation.
2. Reconnect-safe progress from Safari.
3. Provider quota, authentication, and retry failures.
4. Successful expansion, checksum generation, and package manufacture.
5. Explicit rollback rehearsal.
6. Shopify draft and live-publication approval boundaries.

After those gates pass, remove the alarm index, alarm scheduling, and rollback variables in a separate reviewed change.
