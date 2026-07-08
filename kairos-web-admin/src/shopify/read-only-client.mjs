const DEFAULT_SHOPIFY_API_VERSION = '2026-04';

export const customerValueDoctrine = Object.freeze({
  promise: 'Your Knowledge Has Value.',
  support: 'Helping you discover it, build it, and share it with the world.',
  positioning: 'Build around the value only you can provide.',
  approvedProductContext: 'Products should be treated as tools inside the larger MMG value-building system, not isolated one-off purchases.'
});

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

export function inferCustomerValueContext(product = {}) {
  const text = [product.title, product.handle, product.productType, product.descriptionHtml, ...(product.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(guide|prompt|template|checklist|playbook|knowledge|library|creator|mindset|ai)/.test(text)) {
    return 'Knowledge asset';
  }

  if (/(service|consulting|publishing|production|onboarding|package)/.test(text)) {
    return 'Guided execution';
  }

  if (/(bundle|collection|series|course)/.test(text)) {
    return 'Asset pathway';
  }

  return 'Value-building tool';
}

export function mapProductToCustomerValueSurface(product) {
  return {
    ...product,
    customerValueContext: inferCustomerValueContext(product),
    doctrinePromise: customerValueDoctrine.promise,
    doctrinePositioning: customerValueDoctrine.positioning,
    ecosystemContext: customerValueDoctrine.approvedProductContext
  };
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
  const data = await shopifyGraphQL(`
    query KairosProductSummary($first: Int!) {
      products(first: $first, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          title
          handle
          descriptionHtml
          productType
          tags
          status
          totalInventory
          updatedAt
        }
      }
    }
  `, { first: limit }, env);

  return {
    ...data,
    products: {
      ...data.products,
      nodes: data.products.nodes.map(mapProductToCustomerValueSurface)
    }
  };
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

export async function fetchCustomerValueCommerceSnapshot(limit = 10, env = process.env) {
  const [identity, orders, products, customers] = await Promise.all([
    fetchShopIdentity(env),
    fetchRecentOrders(limit, env),
    fetchProductSummary(limit, env),
    fetchCustomerSummary(limit, env)
  ]);

  return {
    doctrine: customerValueDoctrine,
    identity,
    orders,
    products,
    customers,
    summary: {
      shopName: identity.shop.name,
      recentOrderCount: orders.orders.nodes.length,
      recentProductCount: products.products.nodes.length,
      recentCustomerCount: customers.customers.nodes.length,
      valueAlignedProductCount: products.products.nodes.filter(product => product.customerValueContext !== 'Value-building tool').length
    }
  };
}