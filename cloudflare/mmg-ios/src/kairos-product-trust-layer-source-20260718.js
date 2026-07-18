export const PRODUCT_TRUST_SECTION_FILE = "sections/mmg-product-trust-layer.liquid";
export const PRODUCT_TRUST_CSS_FILE = "assets/mmg-product-trust-layer.css";
export const PRODUCT_TRUST_JS_FILE = "assets/mmg-product-trust-layer.js";

export function extendProductTemplateWithTrustLayer(templateSource) {
  const template = JSON.parse(templateSource);
  template.sections = template.sections || {};
  template.sections.trust = {
    type: "mmg-product-trust-layer",
    settings: {
      heading: "Purchase with clarity",
      delivery_heading: "What happens after checkout",
      policy_heading: "Service and delivery standards",
      reviews_heading: "Customer confidence",
      cart_heading: "Ready to continue?"
    }
  };
  const order = Array.isArray(template.order) ? template.order.filter(id => id !== "trust") : [];
  const relatedIndex = order.indexOf("related");
  if (relatedIndex >= 0) order.splice(relatedIndex, 0, "trust"); else order.push("trust");
  template.order = order;
  return JSON.stringify(template, null, 2);
}

export const PRODUCT_TRUST_SECTION_SOURCE = String.raw`{{ 'mmg-product-trust-layer.css' | asset_url | stylesheet_tag }}
<script src="{{ 'mmg-product-trust-layer.js' | asset_url }}" defer></script>
{% assign selected_variant = product.selected_or_first_available_variant %}
{% assign delivery_copy = product.metafields.custom.delivery_expectations.value | default: product.metafields.custom.delivery_expectations %}
{% assign eligibility_copy = product.metafields.custom.eligibility_disclosure.value | default: product.metafields.custom.eligibility_disclosure %}
{% assign revision_copy = product.metafields.custom.revision_policy.value | default: product.metafields.custom.revision_policy %}
<section class="mmg-trust" data-mmg-trust data-product-id="{{ product.id }}" data-product-handle="{{ product.handle }}" data-product-title="{{ product.title | escape }}" data-product-type="{{ product.type | escape }}" data-selected-variant="{{ selected_variant.id }}">
  <header class="mmg-trust__head">
    <p class="mmg-trust__kicker">Clear expectations. Professional support.</p>
    <h2>{{ section.settings.heading }}</h2>
    <p>Review delivery, eligibility, service standards, and purchase protections before continuing.</p>
  </header>

  <div class="mmg-trust__assurances" aria-label="Purchase assurances">
    <article><span aria-hidden="true">✓</span><div><h3>Secure Shopify checkout</h3><p>Your order is processed through the store's configured secure checkout.</p></div></article>
    <article><span aria-hidden="true">✓</span><div><h3>Transparent fulfillment</h3><p>Digital access or project onboarding instructions are provided after purchase.</p></div></article>
    <article><span aria-hidden="true">✓</span><div><h3>Organized customer access</h3><p>Eligible purchases and project deliverables remain accessible through your customer workspace.</p></div></article>
  </div>

  <div class="mmg-trust__grid">
    <section class="mmg-trust__card">
      <p class="mmg-trust__label">Delivery</p><h3>{{ section.settings.delivery_heading }}</h3>
      {% if delivery_copy != blank %}<div class="rte">{{ delivery_copy }}</div>{% else %}
      <ol><li><b>Order confirmation</b><span>Checkout confirms your selected product or service tier.</span></li><li><b>Access or intake</b><span>Digital instructions or a service onboarding path follows purchase.</span></li><li><b>Progress visibility</b><span>Eligible projects and deliverables are organized in the customer workspace.</span></li></ol>
      {% endif %}
    </section>

    <section class="mmg-trust__card">
      <p class="mmg-trust__label">Standards</p><h3>{{ section.settings.policy_heading }}</h3>
      <details open><summary>Eligibility and scope</summary><div>{% if eligibility_copy != blank %}{{ eligibility_copy }}{% else %}Product descriptions, selected variants, and included deliverables define the purchase scope. Additional work requires separate approval or purchase.{% endif %}</div></details>
      <details><summary>Revisions and corrections</summary><div>{% if revision_copy != blank %}{{ revision_copy }}{% else %}Eligible professional services follow the revision terms shown on the product page and applicable customer service policy. Digital downloads are not editable service engagements.{% endif %}</div></details>
      <details><summary>Digital-product delivery</summary><div>Digital products are delivered electronically. No physical item is shipped unless a product page explicitly states otherwise.</div></details>
      <a href="/pages/customer-service-policy" data-mmg-event="policy_view">Read the customer service policy</a>
    </section>
  </div>

  <section class="mmg-trust__reviews" aria-labelledby="mmg-trust-reviews-{{ section.id }}">
    <div><p class="mmg-trust__label">Verified feedback layer</p><h3 id="mmg-trust-reviews-{{ section.id }}">{{ section.settings.reviews_heading }}</h3><p>Customer reviews appear through the store's configured review provider when available. Review content is never fabricated by this section.</p></div>
    <div class="mmg-trust__review-slot" data-mmg-review-slot data-product-id="{{ product.id }}">
      <div class="jdgm-widget jdgm-preview-badge" data-id="{{ product.id }}">{{ product.metafields.judgeme.badge }}</div>
      {% if product.metafields.reviews.rating.value != blank %}<p><b>{{ product.metafields.reviews.rating.value.rating }}</b> out of {{ product.metafields.reviews.rating.value.scale_max }} based on verified store review data.</p>{% else %}<p>Review data will display here after the configured provider has verified customer feedback.</p>{% endif %}
    </div>
  </section>

  <aside class="mmg-trust__continue" data-mmg-cart-continuity>
    <div><p class="mmg-trust__label">Purchase continuity</p><h3>{{ section.settings.cart_heading }}</h3><p><span data-mmg-selected-title>{{ product.title }}</span> · <b data-mmg-selected-price>{{ selected_variant.price | money }}</b></p></div>
    {% form 'product', product, class: 'mmg-trust__form' %}<input type="hidden" name="id" value="{{ selected_variant.id }}" data-mmg-variant-input><button type="submit" name="add" data-mmg-event="add_to_cart" {% unless selected_variant.available %}disabled{% endunless %}>{% if selected_variant.available %}Add to cart{% else %}Currently unavailable{% endif %}</button>{% endform %}
  </aside>
</section>
{% schema %}
{"name":"MMG Product Trust Layer","tag":"section","class":"section-mmg-product-trust","settings":[{"type":"text","id":"heading","label":"Heading","default":"Purchase with clarity"},{"type":"text","id":"delivery_heading","label":"Delivery heading","default":"What happens after checkout"},{"type":"text","id":"policy_heading","label":"Policy heading","default":"Service and delivery standards"},{"type":"text","id":"reviews_heading","label":"Reviews heading","default":"Customer confidence"},{"type":"text","id":"cart_heading","label":"Cart heading","default":"Ready to continue?"}],"presets":[{"name":"MMG Product Trust Layer"}]}
{% endschema %}`;

export const PRODUCT_TRUST_CSS_SOURCE = String.raw`.mmg-trust{--ink:#101827;--muted:#5f6876;--line:#dde3eb;--blue:#1769e0;max-width:1320px;margin:90px auto;padding:0 28px;color:var(--ink)}.mmg-trust *{box-sizing:border-box}.mmg-trust__head{max-width:760px;margin-bottom:34px}.mmg-trust__kicker,.mmg-trust__label{text-transform:uppercase;letter-spacing:.13em;font-size:12px;font-weight:800;color:var(--blue);margin:0 0 10px}.mmg-trust h2{font:700 clamp(36px,4vw,56px)/1.02 Georgia,serif;letter-spacing:-.04em;margin:0 0 16px}.mmg-trust h3{font:700 25px/1.15 Georgia,serif;margin:0 0 12px}.mmg-trust p,.mmg-trust li,.mmg-trust details{line-height:1.6;color:var(--muted)}.mmg-trust__assurances{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px}.mmg-trust__assurances article{display:flex;gap:14px;border:1px solid var(--line);border-radius:18px;padding:22px}.mmg-trust__assurances article>span{display:grid;place-items:center;flex:0 0 30px;height:30px;border-radius:50%;background:#eaf3ff;color:var(--blue);font-weight:900}.mmg-trust__assurances h3{font:800 16px/1.25 system-ui;margin-bottom:5px}.mmg-trust__assurances p{font-size:13px;margin:0}.mmg-trust__grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.mmg-trust__card{border:1px solid var(--line);border-radius:22px;padding:30px;background:#fff}.mmg-trust__card ol{padding-left:20px;margin:20px 0 0}.mmg-trust__card li{padding:8px 0 8px 6px}.mmg-trust__card li b,.mmg-trust__card li span{display:block}.mmg-trust details{border-top:1px solid var(--line);padding:16px 0}.mmg-trust summary{cursor:pointer;font-weight:800;color:var(--ink)}.mmg-trust details div{padding-top:10px}.mmg-trust a{color:var(--blue);font-weight:800}.mmg-trust__reviews{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:center;margin-top:18px;background:#111b2b;color:#fff;border-radius:22px;padding:34px}.mmg-trust__reviews h3,.mmg-trust__reviews p{color:#fff}.mmg-trust__review-slot{border:1px solid rgba(255,255,255,.18);border-radius:16px;padding:22px}.mmg-trust__continue{position:sticky;bottom:16px;z-index:8;margin-top:18px;display:flex;justify-content:space-between;align-items:center;gap:20px;background:rgba(255,255,255,.96);backdrop-filter:blur(16px);border:1px solid var(--line);box-shadow:0 16px 44px rgba(16,24,39,.14);border-radius:18px;padding:18px 20px}.mmg-trust__continue h3{font:800 18px/1.2 system-ui;margin:0}.mmg-trust__continue p{margin:5px 0 0;font-size:13px}.mmg-trust__form button{border:0;border-radius:12px;background:var(--blue);color:#fff;font-weight:800;padding:15px 24px;min-width:180px;cursor:pointer}.mmg-trust__form button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:800px){.mmg-trust{padding:0 18px;margin-top:65px}.mmg-trust__assurances,.mmg-trust__grid,.mmg-trust__reviews{grid-template-columns:1fr}.mmg-trust__continue{bottom:8px;align-items:stretch;flex-direction:column}.mmg-trust__form button{width:100%}}`;

export const PRODUCT_TRUST_JS_SOURCE = String.raw`(()=>{const roots=document.querySelectorAll('[data-mmg-trust]');if(!roots.length)return;const emit=(name,detail={})=>{const payload={event:name,timestamp:new Date().toISOString(),...detail};window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:'mmg_product_event',mmg:payload});window.dispatchEvent(new CustomEvent('mmg:product-event',{detail:payload}));};roots.forEach(root=>{const base={productId:root.dataset.productId,productHandle:root.dataset.productHandle,productTitle:root.dataset.productTitle,productType:root.dataset.productType};emit('trust_layer_view',base);root.addEventListener('click',event=>{const target=event.target.closest('[data-mmg-event]');if(target)emit(target.dataset.mmgEvent,{...base,variantId:root.dataset.selectedVariant});});root.addEventListener('submit',event=>{if(event.target.matches('.mmg-trust__form'))emit('cart_submit',{...base,variantId:event.target.querySelector('[name=id]')?.value});});document.addEventListener('change',event=>{const input=event.target;if(!input.matches('[name=id],input[type=radio][name*=id],select[name=id]'))return;const variantId=input.value;root.dataset.selectedVariant=variantId;root.querySelectorAll('[data-mmg-variant-input]').forEach(el=>el.value=variantId);emit('variant_selected',{...base,variantId});});});})();`;
