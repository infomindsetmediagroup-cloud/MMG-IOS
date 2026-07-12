# Kairos Social Connector Layer

This directory is the canonical contract for TikTok and Facebook publishing. Runtime activation requires developer applications, platform review, approved scopes, OAuth redirect URLs, encrypted token storage, webhook endpoints, and executive authorization. The connector must implement identity, permissions, token refresh, account health, content validation, approval, idempotent publishing, status reconciliation, analytics ingestion, and audit evidence before it can report Operational.

No social username or password may be stored. Missing credentials or scopes must surface as `connection_required`, never as a simulated success.
