import { pushNotification } from "./notifications.js";

const productLaunchKey = "kairos.product.launch.packages.v1";

const seedProducts = [
  { id: "PROD-001", title: "Creator Launch Bundle", format: "Digital Bundle", status: "Draft", price: "TBD", requirement: "Attach full digital package through Shopify digital download workflow." },
  { id: "PROD-002", title: "AI Prompt Starter Pack", format: "Digital Download", status: "Draft", price: "$9.99", requirement: "Attach PDF, cover image, and supporting assets." },
  { id: "PROD-003", title: "Creator Starter Kit", format: "Digital Download", status: "Draft", price: "$14.99", requirement: "Stage product copy, preview assets, and download file." },
  { id: "PROD-004", title: "Publishing Checklist", format: "Digital Download", status: "Draft", price: "$9.99", requirement: "Prepare checklist PDF and product page trust proof." },
  { id: "PROD-005", title: "Canonical Service Onboarding PDF", format: "Service Asset", status: "Draft", price: "Internal", requirement: "Use as required onboarding asset for future service products." }
];

function readProducts() {
  try {
    return JSON.parse(localStorage.getItem(productLaunchKey) || "null") || seedProducts;
  } catch {
    return seedProducts;
  }
}

function writeProducts(items) {
  localStorage.setItem(productLaunchKey, JSON.stringify(items));
  return items;
}

export function getProductLaunchPackages() {
  return readProducts();
}

export function stageProductLaunch(id) {
  const next = readProducts().map(item => item.id === id ? { ...item, status: "Staged", updatedAt: new Date().toLocaleString() } : item);
  writeProducts(next);
  pushNotification("Product package staged", id, "Success");
  return next;
}

export function productLaunchMetrics() {
  const items = readProducts();
  return {
    total: items.length,
    draft: items.filter(item => item.status === "Draft").length,
    staged: items.filter(item => item.status === "Staged").length
  };
}
