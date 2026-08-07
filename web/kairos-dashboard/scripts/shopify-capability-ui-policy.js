const BUILD = "kairos-shopify-capability-ui-policy-20260807-1";

function syncPolicyDefaults(root = document) {
  const dialog = root.querySelector?.(".kairos-shopify-dialog");
  if (!dialog) return;
  const select = dialog.querySelector("#kairos-shopify-tool");
  const textarea = dialog.querySelector("#kairos-shopify-args");
  if (!select || !textarea || select.value !== "shopify.product.create") return;

  try {
    const value = JSON.parse(textarea.value || "{}");
    if (!value.handle) {
      value.handle = "new-product";
      textarea.value = JSON.stringify(value, null, 2);
    }
    if (!value.status) {
      value.status = "DRAFT";
      textarea.value = JSON.stringify(value, null, 2);
    }
  } catch {
    // The main capability UI owns JSON validation and will surface malformed input.
  }
}

syncPolicyDefaults();
new MutationObserver(() => syncPolicyDefaults()).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

document.addEventListener("change", (event) => {
  if (event.target?.id === "kairos-shopify-tool") queueMicrotask(() => syncPolicyDefaults());
}, true);

window.__KAIROS_SHOPIFY_UI_POLICY_BUILD__ = BUILD;
