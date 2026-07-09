# Kairos Backend Runtime

This package provides the first server-side Kairos runtime scaffold for `POST /api/kairos`.

## Purpose
The backend is the controlled intelligence boundary for MMG/Kairos. Client surfaces send structured requests here. Provider credentials, privileged routing, system instructions, and future customer vault access remain server-side.

## Local Setup

```bash
cd kairos/backend
npm install
cp .env.example .env
npm run dev
```

Set `OPENAI_API_KEY` in the local `.env` file or deployment secret manager. Never commit real secret values.

## Routes

### `GET /health`
Returns a basic service health payload.

### `POST /api/kairos`
Accepts the canonical Kairos runtime request:

```json
{
  "mode": "public",
  "surface": "ios",
  "message": "How can MMG help me organize my creator workflow?",
  "context": {}
}
```

Returns:

```json
{
  "reply": "...",
  "mode": "public",
  "department": "kairos-core",
  "status": "ok"
}
```

## Runtime Guardrails
- Requires `application/json`.
- Validates mode, surface, message, and context shape.
- Trims and size-limits messages.
- Keeps provider credentials server-side.
- Returns structured safe errors.
- Logs timestamp, mode, surface, department, status, and error code only.

## Next Hardening Pass
- Add authentication/session enforcement.
- Add deployment-specific rate limiting.
- Add Trust Layer audit persistence.
- Add department routing.
- Add tests once the repository test framework is selected.
