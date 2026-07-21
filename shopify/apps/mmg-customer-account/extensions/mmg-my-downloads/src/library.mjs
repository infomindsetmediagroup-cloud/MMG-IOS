const ELIGIBLE_FINANCIAL_STATUSES = new Set(['PAID', 'PARTIALLY_REFUNDED']);

export function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isDigitalLineItem(lineItem = {}) {
  if (lineItem.giftCard === true) return false;
  if (lineItem.requiresShipping !== false) return false;

  const productType = normalize(lineItem.productType).replace(/[-_]+/g, ' ');
  const sku = String(lineItem.sku ?? '').trim().toUpperCase();

  return productType === 'digital download' || sku.startsWith('MMG-DIG-');
}

export function isEligibleOrder(order = {}) {
  if (order.cancelledAt) return false;
  if (!ELIGIBLE_FINANCIAL_STATUSES.has(String(order.financialStatus ?? '').toUpperCase())) {
    return false;
  }
  return Boolean(order.statusPageUrl);
}

export function buildDownloadLibrary(orders = []) {
  const items = [];

  for (const order of Array.isArray(orders) ? orders : []) {
    if (!isEligibleOrder(order)) continue;

    const lineItems = order?.lineItems?.nodes ?? order?.lineItems ?? [];
    for (const lineItem of lineItems) {
      if (!isDigitalLineItem(lineItem)) continue;
      if (Number(lineItem.refundableQuantity ?? lineItem.quantity ?? 0) <= 0) continue;

      items.push({
        id: `${order.id}:${lineItem.id}`,
        orderId: order.id,
        orderName: order.name,
        purchasedAt: order.processedAt || order.createdAt,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus || null,
        statusPageUrl: order.statusPageUrl,
        lineItemId: lineItem.id,
        productId: lineItem.productId || null,
        variantId: lineItem.variantId || null,
        title: lineItem.presentmentTitle || lineItem.name || 'Digital product',
        variantTitle: lineItem.variantTitle || null,
        sku: lineItem.sku || null,
        quantity: Number(lineItem.quantity || 1),
        productType: lineItem.productType || null,
        image: lineItem.image || null,
      });
    }
  }

  return items.sort((a, b) => {
    const dateDelta = new Date(b.purchasedAt || 0).getTime() - new Date(a.purchasedAt || 0).getTime();
    if (dateDelta !== 0) return dateDelta;
    return String(b.orderName).localeCompare(String(a.orderName));
  });
}

export function summarizeDownloadLibrary(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  return {
    entitlements: safeItems.length,
    orders: new Set(safeItems.map((item) => item.orderId)).size,
    products: new Set(safeItems.map((item) => item.productId || item.sku || item.title)).size,
  };
}
