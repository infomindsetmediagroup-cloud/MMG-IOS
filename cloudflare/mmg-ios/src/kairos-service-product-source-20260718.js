export const SERVICE_PRODUCT_TEMPLATE_FILE = "templates/product.mmg-service.json";
export const SERVICE_PRODUCT_SECTION_FILE = "sections/mmg-service-product.liquid";
export const SERVICE_PRODUCT_CSS_FILE = "assets/mmg-service-product.css";

export const SERVICE_PRODUCT_TEMPLATE_SOURCE = JSON.stringify({
  sections: {
    main: {
      type: "mmg-service-product",
      settings: {
        eyebrow: "Professional publishing service",
        promise: "Choose the service level that matches your project, timeline, and production needs.",
        tiers_heading: "Choose your service level",
        comparison_heading: "Compare deliverables",
        process_heading: "How your project moves forward",
        policy_heading: "Revision and delivery standards",
        faq_heading: "Common questions"
      }
    }
  },
  order: ["main"]
}, null, 2);

export const SERVICE_PRODUCT_SECTION_SOURCE = String.raw`{{ 'mmg-service-product.css' | asset_url | stylesheet_tag }}
{% assign selected_variant = product.selected_or_first_available_variant %}
{% assign process_items = product.metafields.custom.service_process.value %}
{% assign faq_items = product.metafields.custom.faq.value %}
<section class="mmg-sp" data-product-id="{{ product.id }}">
  <nav class="mmg-sp__crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/pages/services">Services</a><span>/</span><span aria-current="page">{{ product.title }}</span></nav>

  <header class="mmg-sp__hero">
    <div class="mmg-sp__intro">
      <p class="mmg-sp__eyebrow">{{ section.settings.eyebrow }}</p>
      <h1>{{ product.title }}</h1>
      <p class="mmg-sp__promise">{% if product.metafields.custom.listing_subtitle != blank %}{{ product.metafields.custom.listing_subtitle }}{% else %}{{ section.settings.promise }}{% endif %}</p>
      <div class="mmg-sp__description rte">{{ product.description }}</div>
      <div class="mmg-sp__trust"><span>Defined deliverables</span><span>Secure checkout</span><span>Guided onboarding</span></div>
    </div>
    <div class="mmg-sp__visual">
      {% if product.featured_media %}{{ product.featured_media | image_url: width: 1400 | image_tag: loading: 'eager', widths: '500,800,1100,1400', sizes: '(max-width: 900px) 92vw, 42vw', alt: product.featured_media.alt | default: product.title }}{% else %}<div class="mmg-sp__placeholder"><span>Mindset Media Group</span><strong>{{ product.title }}</strong></div>{% endif %}
    </div>
  </header>

  <section class="mmg-sp__tiers" id="service-levels">
    <div class="mmg-sp__heading"><p class="mmg-sp__eyebrow">Project fit</p><h2>{{ section.settings.tiers_heading }}</h2><p>Select a tier below. Shopify pricing, availability, and checkout remain authoritative.</p></div>
    {% form 'product', product, class: 'mmg-sp__form', id: 'MMGServiceForm' %}
      <input type="hidden" name="id" value="{{ selected_variant.id }}" data-service-variant-input>
      <div class="mmg-sp__tier-grid" role="radiogroup" aria-label="Service level">
        {% for variant in product.variants %}
          {% assign tier_name = variant.title | downcase %}
          <label class="mmg-sp__tier{% if variant.id == selected_variant.id %} is-selected{% endif %}{% unless variant.available %} is-unavailable{% endunless %}" data-service-tier>
            <input type="radio" name="service_level" value="{{ variant.id }}" {% if variant.id == selected_variant.id %}checked{% endif %} {% unless variant.available %}disabled{% endunless %}>
            <span class="mmg-sp__tier-label">{% if tier_name contains 'growth' %}Most popular{% elsif tier_name contains 'professional' %}Complete production{% else %}Essential foundation{% endif %}</span>
            <h3>{{ variant.title }}</h3>
            <div class="mmg-sp__price">{{ variant.price | money }}</div>
            <p>{% if tier_name contains 'professional' %}For complex, high-page-count, or full-production projects requiring the broadest support.{% elsif tier_name contains 'growth' %}For developed projects that need deeper editorial, formatting, and production support.{% else %}For focused projects that need a professional foundation and defined core deliverables.{% endif %}</p>
            <span class="mmg-sp__select">{% if variant.available %}Select {{ variant.title }}{% else %}Currently unavailable{% endif %}</span>
          </label>
        {% endfor %}
      </div>
      <div class="mmg-sp__purchase">
        <div><span>Selected service</span><strong data-service-selection>{{ selected_variant.title }} · {{ selected_variant.price | money }}</strong></div>
        <button type="submit" name="add" {% unless selected_variant.available %}disabled{% endunless %}>Add selected service to cart</button>
      </div>
    {% endform %}
  </section>

  <section class="mmg-sp__comparison">
    <div class="mmg-sp__heading"><p class="mmg-sp__eyebrow">Scope clarity</p><h2>{{ section.settings.comparison_heading }}</h2></div>
    <div class="mmg-sp__table-wrap"><table><thead><tr><th>Capability</th>{% for variant in product.variants %}<th>{{ variant.title }}</th>{% endfor %}</tr></thead><tbody>
      <tr><th>Professional project onboarding</th>{% for variant in product.variants %}<td>Included</td>{% endfor %}</tr>
      <tr><th>Editorial and structural review</th>{% for variant in product.variants %}<td>{% if variant.title contains 'Starter' %}Core{% else %}Expanded{% endif %}</td>{% endfor %}</tr>
      <tr><th>Production-ready formatting</th>{% for variant in product.variants %}<td>Included</td>{% endfor %}</tr>
      <tr><th>Complexity and page-count capacity</th>{% for variant in product.variants %}<td>{% if variant.title contains 'Professional' %}Highest{% elsif variant.title contains 'Growth' %}Expanded{% else %}Standard{% endif %}</td>{% endfor %}</tr>
      <tr><th>Customer Portal project tracking</th>{% for variant in product.variants %}<td>Included</td>{% endfor %}</tr>
    </tbody></table></div>
    <p class="mmg-sp__scope-note">Exact deliverables, eligibility, page limits, and add-ons remain governed by the product listing and project agreement.</p>
  </section>

  <section class="mmg-sp__process">
    <div class="mmg-sp__heading"><p class="mmg-sp__eyebrow">From purchase to delivery</p><h2>{{ section.settings.process_heading }}</h2></div>
    <ol>
      {% if process_items != blank %}{% for item in process_items %}<li><span>{{ forloop.index }}</span><div><h3>{{ item.title }}</h3><p>{{ item.description }}</p></div></li>{% endfor %}{% else %}
      <li><span>1</span><div><h3>Purchase and onboarding</h3><p>Select the appropriate tier, complete checkout, and receive project intake instructions.</p></div></li>
      <li><span>2</span><div><h3>Submit project materials</h3><p>Upload manuscripts, references, images, and other required assets through the approved project workflow.</p></div></li>
      <li><span>3</span><div><h3>Production and review</h3><p>Your project advances through the defined editorial, design, formatting, and quality-control stages.</p></div></li>
      <li><span>4</span><div><h3>Delivery and support</h3><p>Approved deliverables are organized in your customer workspace with the applicable revision terms.</p></div></li>
      {% endif %}
    </ol>
  </section>

  <section class="mmg-sp__policy">
    <div><p class="mmg-sp__eyebrow">Customer protection</p><h2>{{ section.settings.policy_heading }}</h2><p>Eligible manuscript services include one complimentary editorial rewrite request within 30 days of delivery. Scope changes, new source material, added pages, and work outside the purchased tier may require a revised quote.</p></div>
    <a href="/pages/customer-service-policies">Review service policies</a>
  </section>

  <section class="mmg-sp__faq">
    <div class="mmg-sp__heading"><p class="mmg-sp__eyebrow">Before you begin</p><h2>{{ section.settings.faq_heading }}</h2></div>
    {% if faq_items != blank %}{% for item in faq_items %}<details><summary>{{ item.question }}</summary><div>{{ item.answer }}</div></details>{% endfor %}{% else %}
    <details><summary>What happens after purchase?</summary><div>You receive onboarding instructions describing the project intake process and required materials.</div></details>
    <details><summary>How do I choose the right tier?</summary><div>Choose based on page count, project complexity, required deliverables, and the amount of editorial or production support needed.</div></details>
    <details><summary>Are research, cover design, or other add-ons included?</summary><div>Only when explicitly listed in the selected tier or purchased as an approved add-on.</div></details>
    {% endif %}
  </section>
</section>
<script>
(() => {
  const root = document.querySelector('.mmg-sp[data-product-id="{{ product.id }}"]');
  if (!root) return;
  const input = root.querySelector('[data-service-variant-input]');
  const selection = root.querySelector('[data-service-selection]');
  root.querySelectorAll('[data-service-tier] input').forEach(radio => radio.addEventListener('change', () => {
    input.value = radio.value;
    root.querySelectorAll('[data-service-tier]').forEach(card => card.classList.toggle('is-selected', card.contains(radio)));
    const card = radio.closest('[data-service-tier]');
    selection.textContent = `${card.querySelector('h3').textContent.trim()} · ${card.querySelector('.mmg-sp__price').textContent.trim()}`;
  }));
})();
</script>
{% schema %}
{"name":"MMG Service Product","tag":"section","class":"section-mmg-service-product","settings":[{"type":"text","id":"eyebrow","label":"Eyebrow","default":"Professional publishing service"},{"type":"textarea","id":"promise","label":"Default promise","default":"Choose the service level that matches your project, timeline, and production needs."},{"type":"text","id":"tiers_heading","label":"Tiers heading","default":"Choose your service level"},{"type":"text","id":"comparison_heading","label":"Comparison heading","default":"Compare deliverables"},{"type":"text","id":"process_heading","label":"Process heading","default":"How your project moves forward"},{"type":"text","id":"policy_heading","label":"Policy heading","default":"Revision and delivery standards"},{"type":"text","id":"faq_heading","label":"FAQ heading","default":"Common questions"}],"presets":[{"name":"MMG Service Product"}]}
{% endschema %}`;

export const SERVICE_PRODUCT_CSS_SOURCE = String.raw`.mmg-sp{--ink:#101827;--muted:#5d6675;--line:#dfe4eb;--blue:#1769e0;--soft:#f5f7fa;max-width:1320px;margin:auto;padding:18px 28px 100px;color:var(--ink)}.mmg-sp *{box-sizing:border-box}.mmg-sp__crumbs{display:flex;gap:9px;font-size:13px;color:var(--muted);margin:4px 0 34px}.mmg-sp__crumbs a{color:inherit;text-decoration:none}.mmg-sp__hero{display:grid;grid-template-columns:1.05fr .95fr;gap:62px;align-items:center;padding:25px 0 78px}.mmg-sp__eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:800;color:var(--blue);margin:0 0 14px}.mmg-sp h1{font:700 clamp(44px,5.5vw,76px)/.98 Georgia,serif;letter-spacing:-.045em;margin:0 0 20px}.mmg-sp__promise{font-size:21px;line-height:1.5;color:var(--muted);max-width:700px}.mmg-sp__description{line-height:1.72;color:#3e4856}.mmg-sp__trust{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}.mmg-sp__trust span{background:var(--soft);border-radius:999px;padding:9px 12px;font-size:12px;font-weight:700}.mmg-sp__visual{background:linear-gradient(145deg,#f3f6fa,#e3e9f1);border:1px solid var(--line);border-radius:28px;min-height:480px;display:grid;place-items:center;padding:30px;overflow:hidden}.mmg-sp__visual img{max-width:100%;max-height:540px;object-fit:contain}.mmg-sp__placeholder{width:80%;aspect-ratio:4/3;background:#152238;color:#fff;border-radius:20px;padding:35px;display:flex;flex-direction:column;justify-content:space-between}.mmg-sp__placeholder span{font-size:12px;text-transform:uppercase;letter-spacing:.12em}.mmg-sp__placeholder strong{font:700 32px/1.1 Georgia,serif}.mmg-sp__tiers,.mmg-sp__comparison,.mmg-sp__process,.mmg-sp__faq{padding:78px 0;border-top:1px solid var(--line)}.mmg-sp__heading{max-width:760px;margin-bottom:34px}.mmg-sp h2{font:700 clamp(34px,4vw,56px)/1.04 Georgia,serif;letter-spacing:-.035em;margin:0 0 18px}.mmg-sp__heading>p:last-child{color:var(--muted);font-size:17px;line-height:1.55}.mmg-sp__tier-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.mmg-sp__tier{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:22px;padding:26px;cursor:pointer;transition:.2s;background:#fff}.mmg-sp__tier:hover,.mmg-sp__tier.is-selected{border-color:var(--blue);box-shadow:0 16px 38px rgba(23,105,224,.12);transform:translateY(-3px)}.mmg-sp__tier input{position:absolute;opacity:0}.mmg-sp__tier-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--blue);font-weight:800}.mmg-sp__tier h3{font:700 30px/1.1 Georgia,serif;margin:18px 0 8px}.mmg-sp__price{font-size:26px;font-weight:800}.mmg-sp__tier p{color:var(--muted);line-height:1.55;flex:1}.mmg-sp__select{display:block;background:var(--soft);border-radius:12px;padding:13px;text-align:center;font-weight:800;margin-top:15px}.mmg-sp__tier.is-selected .mmg-sp__select{background:var(--blue);color:#fff}.mmg-sp__tier.is-unavailable{opacity:.55;cursor:not-allowed}.mmg-sp__purchase{margin-top:20px;background:#121b2b;color:#fff;border-radius:18px;padding:20px 22px;display:flex;align-items:center;justify-content:space-between;gap:20px}.mmg-sp__purchase div{display:flex;flex-direction:column;gap:5px}.mmg-sp__purchase span{font-size:12px;color:#aebbd0}.mmg-sp__purchase button{border:0;border-radius:12px;background:var(--blue);color:#fff;padding:15px 22px;font-weight:800;cursor:pointer}.mmg-sp__table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.mmg-sp table{border-collapse:collapse;width:100%;min-width:760px}.mmg-sp th,.mmg-sp td{padding:18px;border-bottom:1px solid var(--line);text-align:center}.mmg-sp th:first-child{text-align:left}.mmg-sp thead th{background:var(--soft);font-size:13px}.mmg-sp__scope-note{font-size:12px;color:var(--muted);margin-top:12px}.mmg-sp__process ol{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;list-style:none;padding:0}.mmg-sp__process li{border:1px solid var(--line);border-radius:18px;padding:22px}.mmg-sp__process li>span{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--blue);color:#fff;font-weight:800}.mmg-sp__process h3{font-size:19px;margin:28px 0 10px}.mmg-sp__process p{color:var(--muted);line-height:1.55}.mmg-sp__policy{background:#121b2b;color:#fff;border-radius:28px;padding:54px;display:flex;justify-content:space-between;align-items:end;gap:35px}.mmg-sp__policy>div{max-width:780px}.mmg-sp__policy .mmg-sp__eyebrow{color:#82b5ff}.mmg-sp__policy p{line-height:1.65;color:#d5dceb}.mmg-sp__policy a{color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:12px;padding:14px 18px;text-decoration:none;font-weight:800;white-space:nowrap}.mmg-sp__faq details{border-top:1px solid var(--line);padding:20px 0}.mmg-sp__faq summary{font-weight:800;cursor:pointer}.mmg-sp__faq details div{padding:12px 0;color:var(--muted);line-height:1.6}@media(max-width:900px){.mmg-sp{padding:14px 18px 70px}.mmg-sp__hero{grid-template-columns:1fr;gap:32px}.mmg-sp__tier-grid{grid-template-columns:1fr}.mmg-sp__process ol{grid-template-columns:1fr 1fr}.mmg-sp__purchase,.mmg-sp__policy{align-items:stretch;flex-direction:column}.mmg-sp__purchase button{width:100%}}@media(max-width:560px){.mmg-sp__visual{min-height:320px}.mmg-sp__process ol{grid-template-columns:1fr}.mmg-sp__policy{padding:30px 24px}.mmg-sp h1{font-size:42px}}`;
