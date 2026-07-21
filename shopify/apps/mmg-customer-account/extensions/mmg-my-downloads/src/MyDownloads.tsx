import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useCallback, useEffect, useMemo, useState} from 'preact/hooks';
import {buildDownloadLibrary, summarizeDownloadLibrary} from './library.mjs';

const API_VERSION = '2026-07';
const PAGE_SIZE = 50;
const MAX_ORDER_PAGES = 20;

const DOWNLOADS_QUERY = `
  query MMGMyDownloads($first: Int!, $after: String) {
    customer {
      id
      firstName
      orders(first: $first, after: $after, sortKey: PROCESSED_AT, reverse: true) {
        nodes {
          id
          name
          createdAt
          processedAt
          financialStatus
          fulfillmentStatus
          cancelledAt
          statusPageUrl
          lineItems(first: 250) {
            nodes {
              id
              name
              presentmentTitle
              productId
              productType
              quantity
              refundableQuantity
              requiresShipping
              sku
              variantId
              variantTitle
              giftCard
              image {
                url
                altText
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export default function extension() {
  render(<MyDownloads />, document.body);
}

function MyDownloads() {
  const [state, setState] = useState({status: 'loading', customer: null, orders: [], error: null});

  const load = useCallback(async () => {
    setState((current) => ({...current, status: 'loading', error: null}));
    try {
      const result = await fetchAllOrders();
      setState({status: 'ready', customer: result.customer, orders: result.orders, error: null});
    } catch (error) {
      console.error('MMG My Downloads failed to load.', error);
      setState({status: 'error', customer: null, orders: [], error});
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const downloads = useMemo(() => buildDownloadLibrary(state.orders), [state.orders]);
  const summary = useMemo(() => summarizeDownloadLibrary(downloads), [downloads]);

  return (
    <s-page
      heading="My Downloads"
      subheading="Your digital purchases, organized across every eligible order."
    >
      <s-button slot="primary-action" onClick={load} loading={state.status === 'loading'}>
        Refresh
      </s-button>
      <s-button
        slot="secondary-action"
        onClick={() => shopify.navigation.navigate('shopify:customer-account/orders')}
      >
        All orders
      </s-button>

      <s-stack direction="block" gap="base">
        <s-banner heading="Secure digital access" tone="info">
          <s-text>
            Files remain protected by Shopify Digital Products. Each access button opens the verified
            order entitlement that owns the download.
          </s-text>
        </s-banner>

        {state.status === 'loading' ? <LoadingState /> : null}
        {state.status === 'error' ? <ErrorState onRetry={load} /> : null}
        {state.status === 'ready' && downloads.length === 0 ? <EmptyState /> : null}

        {state.status === 'ready' && downloads.length > 0 ? (
          <>
            <s-section heading="Library summary">
              <s-stack direction="inline" gap="base">
                <s-badge tone="info">{summary.entitlements} downloads</s-badge>
                <s-badge>{summary.products} products</s-badge>
                <s-badge>{summary.orders} orders</s-badge>
              </s-stack>
            </s-section>

            <s-section heading={`Available downloads${state.customer?.firstName ? ` for ${state.customer.firstName}` : ''}`}>
              <s-stack direction="block" gap="base">
                {downloads.map((item) => (
                  <DownloadCard key={item.id} item={item} />
                ))}
              </s-stack>
            </s-section>
          </>
        ) : null}

        <s-section heading="Need help?">
          <s-text>
            Open the original order first. When a paid digital product is attached correctly, Shopify
            Digital Products displays its secure file controls on that order page.
          </s-text>
          <s-link href="https://themindsetmediagroup.com/pages/customer-service" target="_blank">
            Contact Customer Service
          </s-link>
        </s-section>
      </s-stack>
    </s-page>
  );
}

function DownloadCard({item}) {
  const purchased = formatDate(item.purchasedAt);
  const variant = item.variantTitle && item.variantTitle !== 'Default Title' ? item.variantTitle : null;

  return (
    <s-card>
      <s-stack direction="block" gap="small-200">
        <s-stack direction="inline" gap="base" inlineAlignment="space-between">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">{item.title}</s-text>
            {variant ? <s-text color="subdued">{variant}</s-text> : null}
          </s-stack>
          <s-badge tone="success">Available</s-badge>
        </s-stack>

        <s-text color="subdued">
          Order {item.orderName} · Purchased {purchased}
        </s-text>
        {item.sku ? <s-text color="subdued">SKU: {item.sku}</s-text> : null}
        {item.quantity > 1 ? <s-text color="subdued">Licenses: {item.quantity}</s-text> : null}

        <s-button href={item.statusPageUrl} target="_blank" variant="primary">
          Access download
        </s-button>
      </s-stack>
    </s-card>
  );
}

function LoadingState() {
  return (
    <s-section heading="Loading your library">
      <s-stack direction="inline" gap="base" blockAlignment="center">
        <s-spinner size="base" />
        <s-text>Checking eligible purchases across your Shopify orders…</s-text>
      </s-stack>
    </s-section>
  );
}

function ErrorState({onRetry}) {
  return (
    <s-banner heading="Downloads could not be loaded" tone="critical">
      <s-stack direction="block" gap="base">
        <s-text>Refresh the page or try again. No purchase or file data was changed.</s-text>
        <s-button onClick={onRetry}>Try again</s-button>
      </s-stack>
    </s-banner>
  );
}

function EmptyState() {
  return (
    <s-section heading="No digital downloads yet">
      <s-stack direction="block" gap="base">
        <s-text>Eligible digital purchases will appear here after payment is confirmed.</s-text>
        <s-button onClick={() => shopify.navigation.navigate('shopify:customer-account/orders')}>
          View orders
        </s-button>
      </s-stack>
    </s-section>
  );
}

async function fetchAllOrders() {
  let after = null;
  let customer = null;
  const orders = [];

  for (let page = 0; page < MAX_ORDER_PAGES; page += 1) {
    const response = await fetch(`shopify://customer-account/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        query: DOWNLOADS_QUERY,
        variables: {first: PAGE_SIZE, after},
      }),
    });

    if (!response.ok) {
      throw new Error(`Customer Account API returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    if (payload?.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).join('; '));
    }

    const currentCustomer = payload?.data?.customer;
    if (!currentCustomer) {
      throw new Error('Authenticated customer data is unavailable.');
    }

    customer ??= {id: currentCustomer.id, firstName: currentCustomer.firstName || null};
    const connection = currentCustomer.orders;
    orders.push(...(connection?.nodes || []));

    if (!connection?.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) break;
  }

  return {customer, orders};
}

function formatDate(value) {
  if (!value) return 'date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
