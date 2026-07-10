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
