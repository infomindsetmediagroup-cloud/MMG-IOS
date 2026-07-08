# Kairos Runtime Client

This directory contains the iOS-side adapter for the Kairos backend runtime.

## Files
- `KairosRuntimeModels.swift`: request, response, and safe error payloads.
- `KairosRuntimeConfiguration.swift`: endpoint lookup from app configuration.
- `KairosRuntimeClient.swift`: async POST client for the Kairos backend.

## Boundary
The iOS app is a client surface. Intelligence execution, provider selection, privileged instructions, customer vault access, and credential handling belong behind the Kairos backend boundary.
