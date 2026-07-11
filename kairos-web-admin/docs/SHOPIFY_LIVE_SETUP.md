# Shopify Live Setup

This document defines the safe path for moving Kairos Web Admin from local/mock intake into live Shopify-backed operations.

## Current Status

Kairos Web Admin currently runs as a local Node.js operator and supports mock Shopify order intake.

The next transition is live Shopify read/write integration without committing secrets and without enabling automatic CI minute usage.

## Required Shopify Values

Create a local `.env` file from `.env.example`:

```bash
cd kairos-web-admin
cp .env.example .env
```

Fill in these values locally only:

```dotenv
SHOPIFY_STORE_DOMAIN=mindsetmediagroup.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_WEBHOOK_SECRET=
SHOPIFY_API_VERSION=2026-04
```

Never commit `.env`.

## Required Shopify Admin API Scopes

Minimum recommended scopes for the first live Kairos phase:

```text
read_products
read_orders
read_customers
read_inventory
read_discounts
read_themes
write_discounts
```

Use write scopes only when Kairos needs to modify Shopify data. Read-only integration should be validated first.

## First Live Data Milestone

The first live milestone should be read-only:

1. Verify credentials.
2. Fetch store identity.
3. Fetch latest orders.
4. Fetch latest customers.
5. Fetch product count.
6. Fetch the published theme and homepage-critical file inventory.
7. Show live status in Kairos dashboard.

No order creation, product updates, discount creation, or destructive action should be enabled until read-only validation passes.

## First Webhook Milestone

After read-only validation:

1. Configure Shopify order-created webhook.
2. Verify HMAC signature with `SHOPIFY_WEBHOOK_SECRET`.
3. Convert valid order payloads into Kairos projects.
4. Reject duplicate Shopify order IDs.
5. Log webhook intake events.

## Safety Rules

- Do not store Shopify tokens in GitHub source.
- Do not print secrets in logs.
- Do not enable automatic GitHub Actions for Shopify validation.
- Run live checks locally first.
- Keep mock/local operator mode available as fallback.

## Operational Goal

The production operating loop is:

```text
Shopify order -> verified Kairos intake -> customer project -> production jobs -> operator dashboard
```

That is the point where Kairos starts actively running MMG operations from Shopify data.
