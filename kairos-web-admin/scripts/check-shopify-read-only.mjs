#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchShopIdentity, fetchRecentOrders, fetchProductSummary, fetchCustomerSummary } from '../src/shopify/read-only-client.mjs';

function loadDotEnv(filePath = resolve('.env')) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadDotEnv();
  console.log('Kairos Shopify read-only check starting...');

  const identity = await fetchShopIdentity();
  const orders = await fetchRecentOrders(5);
  const products = await fetchProductSummary(5);
  const customers = await fetchCustomerSummary(5);

  const shop = identity.shop;
  console.log(`Shop: ${shop.name} (${shop.myshopifyDomain})`);
  console.log(`Recent orders: ${orders.orders.nodes.length}`);
  console.log(`Recent products: ${products.products.nodes.length}`);
  console.log(`Recent customers: ${customers.customers.nodes.length}`);
  console.log('Kairos Shopify read-only check passed.');
}

main().catch(error => {
  console.error('Kairos Shopify read-only check failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
