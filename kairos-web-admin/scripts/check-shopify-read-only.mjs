#!/usr/bin/env node
import { fetchShopIdentity, fetchRecentOrders, fetchProductSummary, fetchCustomerSummary } from '../src/shopify/read-only-client.mjs';

function loadDotEnv() {
  try {
    const { readFileSync, existsSync } = await import('node:fs');
  } catch {
    return;
  }
}

async function main() {
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
