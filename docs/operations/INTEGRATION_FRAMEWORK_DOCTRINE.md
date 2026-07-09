# Plug-and-Play Integration Framework Doctrine

## Purpose

Kairos integrations must be built as a reusable connector framework, not as isolated one-off platform integrations.

The goal is turnkey expansion: once the framework exists, future integrations should be added by registering a provider, authentication mode, capabilities, connection health policy, and action surface.

## Canonical providers

Initial connector registry:

1. Shopify
2. OpenAI
3. TikTok
4. Instagram
5. Facebook
6. Custom API template

## Architecture rule

Every connector should follow the same structure:

- provider identity;
- category;
- display name;
- account handle;
- connection status;
- authentication mode;
- capabilities;
- health check timestamp;
- last connection timestamp;
- last error;
- production-enabled flag;
- notes and audit trail.

## Security rule

Do not store platform usernames or passwords inside the app. Production integrations should use OAuth, server-side secrets, scoped tokens, API keys stored only in secure backend secrets, permission grants, token refresh, and auditable connection events.

## Runtime principle

The dashboard should allow an operator to connect, inspect, disable, reauthorize, health-check, and production-enable a connector without rebuilding Kairos for every new platform.

## Execution order

1. Stabilize current operational runtime.
2. Complete Shopify production integration.
3. Complete OpenAI production runtime wiring.
4. Expand the connector registry for TikTok, Instagram, and Facebook.
5. Add future providers through the same connector template.

## Future providers

The same framework should support YouTube, LinkedIn, X, Pinterest, Threads, email providers, storage providers, analytics providers, payment providers, and custom APIs.
