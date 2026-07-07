const deliveryKey = "kairos.delivery.board.v1";

const seedItems = [
  { id: "DELIVERY-001", title: "Digital download attachment map", lane: "Shopify", status: "Draft", requirement: "PDF, cover image, support assets, and buyer handoff." },
  { id: "DELIVERY-002", title: "Portal access map", lane: "Customer Ops", status: "Draft", requirement: "Match product type to access, downloads, and support." },
  { id: "DELIVERY-003", title: "Free Vault access package", lane: "Lead Capture", status: "Draft", requirement: "Lead asset, confirmation, and upgrade path." },
  { id: "DELIVERY-004", title: "Service onboarding package", lane: "Services", status: "Draft", requirement: "Onboarding PDF and portal entry instructions." },
  { id: "DELIVERY-005", title: "Bundle delivery package", lane: "Bundles", status: "Draft", requirement: "Contents, license note, and download sequence." }
];

function readItems() {
  try {
    return JSON.parse(localStorage.getItem(deliveryKey) || "null") || seedItems;
  } catch {
    return seedItems;
  }
}

function writeItems(items) {
  localStorage.setItem(deliveryKey, JSON.stringify(items));
  return items;
}

export function getDeliveryBoard() {
  return readItems();
}

export function stageDeliveryItem(id) {
  const next = readItems().map(item => item.id === id ? { ...item, status: "Staged", updatedAt: new Date().toLocaleString() } : item);
  return writeItems(next);
}

export function deliveryBoardMetrics() {
  const items = readItems();
  return {
    total: items.length,
    draft: items.filter(item => item.status === "Draft").length,
    staged: items.filter(item => item.status === "Staged").length
  };
}
