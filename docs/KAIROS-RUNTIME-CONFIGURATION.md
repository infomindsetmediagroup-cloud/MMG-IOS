# Kairos Runtime Configuration

## Purpose
Kairos production intelligence must route through a secure MMG/Kairos backend runtime. Client surfaces, including iOS, Shopify, website pages, and dashboards, must not call model providers directly.

## iOS Client Configuration
The iOS application reads the Kairos backend endpoint from:

```text
KAIROS_API_ENDPOINT
```

This value should point to the backend route, for example:

```text
https://example.com/api/kairos
```

## Secret Handling
Provider credentials belong only in the backend runtime environment.

Do not store provider credentials in:
- Swift source files.
- Info.plist files.
- Xcode project files.
- Shopify Liquid source.
- Public JavaScript bundles.
- Customer-visible request payloads.
- Logs or analytics events.

## Client Contract
The iOS client sends a structured request to the Kairos backend:

```json
{
  "mode": "public|customer|admin",
  "surface": "ios",
  "message": "string",
  "context": {}
}
```

The backend returns:

```json
{
  "reply": "string",
  "mode": "public|customer|admin",
  "department": "kairos-core",
  "status": "ok"
}
```

## Guardrail
The iOS client adapter exists only as a frontend bridge. It is not a direct model-provider client and must not become one.
