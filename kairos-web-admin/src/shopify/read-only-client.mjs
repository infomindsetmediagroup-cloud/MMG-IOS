const DEFAULT_SHOPIFY_API_VERSION = '2026-04';

export function getShopifyConfig(env = process.env) {
  const storeDomain = env.SHOPIFY_STORE_DOMAIN;
  const adminAccessToken = env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const apiVersion = env.SHOPIFY_API_VERSION || DEFAULT_SHOPIFY_API_VERSION;

  if (!storeDomain) {
    throw new Error('Missing SHOPIFY_STORE_DOMAIN.');
  }

  if (!adminAccessToken) {
    throw new Error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN.');
  }

  return {
    storeDomain: storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    adminAccessToken,
    apiVersion
  };
}

export async function shopifyGraphQL(query, variables = {}, env = process.env) {
  const config = getShopifyConfig(env);
  const endpoint = `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-shopify-access-token': config.adminAccessToken
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = await response.json();

  if (!response.ok || payload.errors) {
    const message = payload.errors ? JSON.stringify(payload.errors) : response.statusText;
    throw new Error(`Shopify GraphQL request failed: ${message}`);
  }

  return payload.data;
}

export async function fetchShopIdentity(env = process.env) {
  return shopifyGraphQL(`
    query KairosShopIdentity {
      shop {
        id
        name
        myshopifyDomain
        primaryDomain { url host }
      }
    }
  `, {}, env);
}

export async function fetchRecentOrders(limit = 10, env = process.env) {
  return shopifyGraphQL(`
    query KairosRecentOrders($first: Int!) {
      orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
        nodes {
          id
          name
          email
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          customer { id displayName email }
        }
      }
    }
  `, { first: limit }, env);
}

export async function fetchProductSummary(limit = 10, env = process.env) {
  return shopifyGraphQL(`
    query KairosProductSummary($first: Int!) {
      products(first: $first, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          title
          handle
          status
          totalInventory
          updatedAt
        }
      }
    }
  `, { first: limit }, env);
}

export async function fetchCustomerSummary(limit = 10, env = process.env) {
  return shopifyGraphQL(`
    query KairosCustomerSummary($first: Int!) {
      customers(first: $first, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          displayName
          email
          createdAt
          updatedAt
        }
      }
    }
  `, { first: limit }, env);
}
