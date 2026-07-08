# Kairos Persistence Foundation

## Status
Development foundation only. The current adapter is in-memory and is not production-durable.

## Purpose
The persistence layer creates a clean boundary between Kairos business logic and the eventual production datastore.

## Domains
The persistence contracts currently cover:
- Conversations.
- Messages and transcripts.
- Audit records.
- Work orders.
- Knowledge Event candidates.

## Current Adapter
`memoryStore.ts` provides an in-memory implementation for local development, runtime scaffolding, and unit tests.

It must not be treated as production storage because data is lost when the server process restarts.

## Production Adapter Requirements
A production datastore adapter must preserve:
- Customer isolation.
- Authenticated ownership.
- Durable audit history.
- Work-order lifecycle state.
- Knowledge Event review status.
- Anonymous retention rules.

## Boundary Rule
Kairos runtime code should depend on repository interfaces from `repositories.ts`, not on a specific database vendor.
