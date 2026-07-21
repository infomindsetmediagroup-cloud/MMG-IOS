import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useCallback, useEffect, useMemo, useState} from 'preact/hooks';
import {buildDownloadLibrary, summarizeDownloadLibrary} from './library.mjs';

const API_VERSION = '2026-07';
const PAGE_SIZE = 50;

const LIBRARY_QUERY = `
  query MyDownloads($first: Int!, $after: String) {
    customer {
      orders(first: $first, after: $after, reverse: true) {
        nodes {
          id
          name
          createdAt
          processedAt
          cancelledAt
          financialStatus
          fulfillmentStatus
          statusPageUrl
          lineItems(first: 100) {
            nodes {
              id
              name
              presentmentTitle
              variantTitle
              sku
              quantity
              refundableQuantity
              requiresShipping
              giftCard
              image { url altText }
              productId
              variantId
              productType
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

export default async () => {
  render(<MyDownloads />, document.body);
};

function MyDownloads() {
  const [state, setState] = useState({status: 'loading', items: [], error: null});

  const load = useCallback(async () => {
    setState((current) => ({...current, status: 'loading', error: null}));
    try {
      const orders = [];
      let after = null;
      let hasNextPage = true;

      while (hasNextPage) {
        const response = await fetch(`shopify://customer-account/api/${API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({query: LIBRARY_QUERY, variables: {first: PAGE_SIZE, after}}),
        });
        const payload = await response.json();
        if (!response.ok || payload?.errors?.length) {
          throw new Error(payload?.errors?.map((error) => error.message).join('; ') || 'Shopify returned an invalid response.');
        }
        const connection = payload?.data?.customer?.orders;
        if (!connection) throw new Error('Customer order history is unavailable.');
        orders.push(...(connection.nodes || []));
        hasNextPage = connection.pageInfo?.hasNextPage === true;
        after = connection.pageInfo?.endCursor || null;
      }

      setState({status: 'ready', items: buildDownloadLibrary(orders), error: null});
    } catch (error) {
      setState({status: 'error', items: [], error: error instanceof Error ? error.message : 'Downloads could not be loaded.'});
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const summary = useMemo(() => summarizeDownloadLibrary(state.items), [state.items]);

  if (state.status === 'loading') {
    return <s-page heading="My Downloads"><s-section><s-stack direction="block" gap="base" inline-alignment="center"><s-spinner size="large" /><s-text color="subdued">Loading your digital library…</s-text></s-stack></s-section></s-page>;
  }

  if (state.status === 'error') {
    return <s-page heading="My Downloads"><s-banner tone="critical" heading="Downloads could not be loaded"><s-text>{state.error}</s-text><s-button slot="secondary-action" onClick={load}>Try again</s-button></s-banner></s-page>;
  }

  return (
    <s-page heading="My Downloads">
      <s-stack direction="block" gap="base">
        <s-section>
          <s-stack direction="block" gap="small-200">
            <s-text>Your digital purchases, organized across every eligible order.</s-text>
            <s-stack direction="inline" gap="base">
              <s-badge tone="info">{summary.entitlements} download{summary.entitlements === 1 ? '' : 's'}</s-badge>
              <s-badge>{summary.orders} order{summary.orders === 1 ? '' : 's'}</s-badge>
              <s-badge>{summary.products} product{summary.products === 1 ? '' : 's'}</s-badge>
            </s-stack>
            <s-stack direction="inline" gap="base">
              <s-button onClick={load}>Refresh</s-button>
              <s-link href="shopify:customer-account/orders">All orders</s-link>
            </s-stack>
          </s-stack>
        </s-section>

        {state.items.length === 0 ? <EmptyLibrary /> : state.items.map((item) => <DownloadCard key={item.id} item={item} />)}

        <s-banner tone="info" heading="Secure delivery">
          <s-text>Download access remains protected by Shopify and the Digital Products app. Select an item to open its verified order delivery page.</s-text>
        </s-banner>
      </s-stack>
    </s-page>
  );
}

function DownloadCard({item}) {
  const date = item.purchasedAt ? new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(new Date(item.purchasedAt)) : 'Purchase date unavailable';
  return (
    <s-section heading={item.title}>
      <s-stack direction="block" gap="base">
        {item.image?.url ? <s-image src={item.image.url} alt={item.image.altText || item.title} aspect-ratio="1/1" object-fit="cover" /> : null}
        <s-stack direction="inline" gap="base">
          <s-badge tone="success">Available</s-badge>
          <s-badge>{item.orderName}</s-badge>
        </s-stack>
        <s-text color="subdued">Purchased {date}{item.quantity > 1 ? ` · Quantity ${item.quantity}` : ''}</s-text>
        {item.variantTitle && item.variantTitle !== 'Default Title' ? <s-text>{item.variantTitle}</s-text> : null}
        <s-link href={item.statusPageUrl}>Access download</s-link>
      </s-stack>
    </s-section>
  );
}

function EmptyLibrary() {
  return (
    <s-section heading="No digital downloads yet">
      <s-stack direction="block" gap="base">
        <s-text>Eligible digital purchases will appear here after payment is confirmed.</s-text>
        <s-link href="shopify:customer-account/orders">Review order history</s-link>
      </s-stack>
    </s-section>
  );
}
