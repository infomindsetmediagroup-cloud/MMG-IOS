# Kairos Runtime Configuration

## Purpose

The iOS application communicates with the Kairos backend through a configurable URL. The client never stores or transmits an OpenAI API key directly.

## Build setting

Set `KAIROS_RUNTIME_URL` to the full backend endpoint, including `/api/kairos`.

Production example:

```text
https://api.example.com/api/kairos
```

Local development example:

```text
http://localhost:3000/api/kairos
```

## Security rules

- Production and remote endpoints must use HTTPS.
- Plain HTTP is accepted only for `localhost`, `127.0.0.1`, or `::1` development endpoints.
- An empty or missing setting produces a controlled unavailable-runtime state.
- Provider credentials remain exclusively on the backend.

## XcodeGen

`project.yml` defines an empty default value so the application builds without embedding an environment-specific endpoint. Supply the real value through the deployment or local build environment before end-to-end runtime testing.

## Validation sequence

1. Run the standard iOS build and unit-test gate with the default empty endpoint.
2. Configure a trusted Kairos backend URL in the target environment.
3. Verify `/api/health` independently.
4. Send a controlled Executive Chat request.
5. Confirm the response includes request and audit identifiers.
6. Confirm the command and response metadata are preserved in the Knowledge Vault.

## Deployment boundary

The endpoint value is configuration, not a credential. OpenAI keys, service credentials, authorization policy, model selection, and provider calls remain exclusively in the Kairos backend environment.
