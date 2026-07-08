# Command Center Telemetry

This module defines the live operations data contract consumed by the Command Center UI.

## Current Adapter

`getDevelopmentCommandCenterTelemetry()` returns isolated development data. It exists so the Command Center can be built against the real contract before production telemetry is available.

Development data must not be represented as production truth.

## Production Swap Path

The production adapter should keep the same `CommandCenterTelemetry` shape and source data from real MMG/Kairos runtime systems.

Expected source areas:

- Department health.
- Workflow status.
- Job status.
- Queue metrics.
- Activity stream items.
- Approval requests.
- Runtime health.
- Knowledge processing.
- Publishing processing.
- Customer activity.

## Rule

Do not add visual activity to the Command Center unless it is backed by this contract or a clearly isolated development adapter.
