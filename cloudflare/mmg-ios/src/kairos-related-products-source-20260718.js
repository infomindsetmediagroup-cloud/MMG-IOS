import { DIGITAL_PRODUCT_TEMPLATE_FILE, DIGITAL_PRODUCT_TEMPLATE_SOURCE } from "./kairos-digital-product-source-20260718.js";
import { SERVICE_PRODUCT_TEMPLATE_FILE, SERVICE_PRODUCT_TEMPLATE_SOURCE } from "./kairos-service-product-source-20260718.js";

export { DIGITAL_PRODUCT_TEMPLATE_FILE, SERVICE_PRODUCT_TEMPLATE_FILE };
export const RELATED_PRODUCTS_SECTION_FILE = "sections/mmg-related-products.liquid";
export const RELATED_PRODUCTS_CSS_FILE = "assets/mmg-related-products.css";

function extendTemplate(source) {
  const template = JSON.parse(source);
  template.sections.related = {
    type: "mmg-related-products",
    settings: {
      eyebrow: "Continue your journey",
      heading: "Recommended next steps",
      copy: "Resources selected to help you build on what you are learning and keep moving forward.",
      limit: 4,
      show_journey: true
    }
  };
  template.order = [...template.order.filter(id => id !== "related"), "related"];
  return JSON.stringify(template, null, 2);
}

export const RELATED_DIGITAL_TEMPLATE_SOURCE = extendTemplate(DIGITAL_PRODUCT_TEMPLATE_SOURCE);
export const RELATED_SERVICE_TEMPLATE_SOURCE = extendTemplate(SERVICE_PRODUCT_TEMPLATE_SOURCE);

export const RELATED_PRODUCTS_SECTION_SOURCE = String.raw`{{ 'mmg-related-products.css' | asset_url | stylesheet_tag }}
{% liquid
  assign explicit_products = product.metafields.custom.related_products.value
  assign journey_products = product.metafields.custom.learning_journey_products.value
  assign recommendation_collection = product.collections.first
  assign rendered_handles = '|' | append: product.handle | append: '|'
  assign rendered_count = 0
%}
<section class="mmg-rp" aria-labelledby="mmg-rp-title-{{ section.id }}">
  <header class="mmg-rp__header">
    <div><p>{{ section.settings.eyebrow }}</p><h2 id="mmg-rp-title-{{ section.id }}">{{ section.settings.heading }}</h2></div>
    <span>{{ section.settings.copy }}</span>
  </header>

  {% if section.settings.show_journey %}
    <div class="mmg-rp__journey" aria-label="Learning journey">
      <div class="is-complete"><b>1</b><span>Discover</span><small>Build the foundation</small></div>
      <i aria-hidden="true"></i>
      <div class="is-current"><b>2</b><span>Apply</span><small>Use what you learned</small></div>
      <i aria-hidden="true"></i>
      <div><b>3</b><span>Advance</span><small>Choose the next resource</small></div>
    </div>
  {% endif %}

  <div class="mmg-rp__grid">
    {% if explicit_products != blank %}
      {% for recommended in explicit_products limit: section.settings.limit %}
        {% unless recommended.handle == product.handle %}
          {% render 'mmg-related-product-card', recommended: recommended, reason: 'Selected for this resource' %}
          {% assign rendered_handles = rendered_handles | append: recommended.handle | append: '|' %}
          {% assign rendered_count = rendered_count | plus: 1 %}
        {% endunless %}
      {% endfor %}
    {% endif %}

    {% if journey_products != blank and rendered_count < section.settings.limit %}
      {% for recommended in journey_products %}
        {% assign handle_token = '|' | append: recommended.handle | append: '|' %}
        {% unless rendered_handles contains handle_token %}
          {% render 'mmg-related-product-card', recommended: recommended, reason: 'Next in your learning journey' %}
          {% assign rendered_handles = rendered_handles | append: recommended.handle | append: '|' %}
          {% assign rendered_count = rendered_count | plus: 1 %}
          {% if rendered_count >= section.settings.limit %}{% break %}{% endif %}
        {% endunless %}
      {% endfor %}
    {% endif %}

    {% if recommendation_collection != blank and rendered_count < section.settings.limit %}
      {% for recommended in recommendation_collection.products %}
        {% assign handle_token = '|' | append: recommended.handle | append: '|' %}
        {% unless rendered_handles contains handle_token %}
          {% render 'mmg-related-product-card', recommended: recommended, reason: 'Related resource' %}
          {% assign rendered_handles = rendered_handles | append: recommended.handle | append: '|' %}
          {% assign rendered_count = rendered_count | plus: 1 %}
          {% if rendered_count >= section.settings.limit %}{% break %}{% endif %}
        {% endunless %}
      {% endfor %}
    {% endif %}
  </div>

  {% if rendered_count == 0 %}
    <div class="mmg-rp__empty"><h3>Explore the complete knowledge ecosystem</h3><p>Browse practical resources, professional services, and connected learning paths.</p><a href="/pages/products">Explore products</a></div>
  {% endif %}
</section>
{% schema %}
{"name":"MMG Related Products","tag":"section","class":"section-mmg-related-products","settings":[{"type":"text","id":"eyebrow","label":"Eyebrow","default":"Continue your journey"},{"type":"text","id":"heading","label":"Heading","default":"Recommended next steps"},{"type":"textarea","id":"copy","label":"Copy","default":"Resources selected to help you build on what you are learning and keep moving forward."},{"type":"range","id":"limit","label":"Maximum recommendations","min":2,"max":6,"step":1,"default":4},{"type":"checkbox","id":"show_journey","label":"Show learning journey","default":true}],"presets":[{"name":"MMG Related Products"}]}
{% endschema %}`;

export const RELATED_PRODUCT_CARD_FILE = "snippets/mmg-related-product-card.liquid";
export const RELATED_PRODUCT_CARD_SOURCE = String.raw`<article class="mmg-rp__card">
  <a class="mmg-rp__media" href="{{ recommended.url }}" aria-label="View {{ recommended.title }}">
    {% if recommended.featured_image %}{{ recommended.featured_image | image_url: width: 760 | image_tag: loading: 'lazy', widths: '280, 480, 760', sizes: '(max-width: 760px) 80vw, 25vw', alt: recommended.featured_image.alt | default: recommended.title }}{% else %}<span>{{ recommended.title }}</span>{% endif %}
  </a>
  <div class="mmg-rp__content"><small>{{ reason }}</small><h3><a href="{{ recommended.url }}">{{ recommended.title }}</a></h3><p>{{ recommended.description | strip_html | truncate: 120 }}</p><footer><b>{{ recommended.price | money }}</b><a href="{{ recommended.url }}">View resource →</a></footer></div>
</article>`;

export const RELATED_PRODUCTS_CSS_SOURCE = String.raw`.mmg-rp{--ink:#111827;--muted:#647084;--line:#dfe5ed;--blue:#1769e0;max-width:1320px;margin:0 auto;padding:90px 28px 120px;color:var(--ink)}.mmg-rp *{box-sizing:border-box}.mmg-rp__header{display:grid;grid-template-columns:1fr minmax(280px,480px);gap:50px;align-items:end;border-top:1px solid var(--line);padding-top:54px}.mmg-rp__header p{margin:0 0 12px;text-transform:uppercase;letter-spacing:.14em;color:var(--blue);font-size:12px;font-weight:800}.mmg-rp__header h2{font:700 clamp(36px,4.6vw,62px)/1 Georgia,serif;letter-spacing:-.04em;margin:0}.mmg-rp__header>span{color:var(--muted);font-size:17px;line-height:1.65}.mmg-rp__journey{display:grid;grid-template-columns:1fr 60px 1fr 60px 1fr;align-items:center;margin:48px 0;padding:24px;border:1px solid var(--line);border-radius:20px;background:#f8fafc}.mmg-rp__journey div{display:grid;grid-template-columns:38px 1fr;gap:2px 12px;align-items:center}.mmg-rp__journey b{grid-row:1/3;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:1px solid #b9c3d0}.mmg-rp__journey span{font-weight:800}.mmg-rp__journey small{color:var(--muted)}.mmg-rp__journey i{height:1px;background:#cbd3de}.mmg-rp__journey .is-complete b,.mmg-rp__journey .is-current b{background:var(--blue);border-color:var(--blue);color:white}.mmg-rp__grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}.mmg-rp__card{border:1px solid var(--line);border-radius:20px;overflow:hidden;background:white;display:flex;flex-direction:column;transition:transform .2s,box-shadow .2s}.mmg-rp__card:hover{transform:translateY(-4px);box-shadow:0 18px 45px rgba(17,24,39,.1)}.mmg-rp__media{aspect-ratio:4/3;background:#edf1f6;display:grid;place-items:center;overflow:hidden;text-decoration:none;color:var(--ink);padding:18px;text-align:center;font-weight:800}.mmg-rp__media img{width:100%;height:100%;object-fit:contain}.mmg-rp__content{padding:20px;display:flex;flex-direction:column;flex:1}.mmg-rp__content small{color:var(--blue);font-weight:800;text-transform:uppercase;letter-spacing:.08em}.mmg-rp__content h3{font:700 23px/1.15 Georgia,serif;margin:10px 0}.mmg-rp__content h3 a,.mmg-rp__content footer a{color:inherit;text-decoration:none}.mmg-rp__content p{color:var(--muted);line-height:1.55;font-size:14px;margin:0 0 22px}.mmg-rp__content footer{margin-top:auto;display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:13px}.mmg-rp__content footer a{color:var(--blue);font-weight:800}.mmg-rp__empty{text-align:center;border:1px solid var(--line);border-radius:22px;padding:54px}.mmg-rp__empty h3{font:700 30px Georgia,serif;margin:0 0 12px}.mmg-rp__empty p{color:var(--muted)}.mmg-rp__empty a{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:800}@media(max-width:980px){.mmg-rp__grid{grid-template-columns:repeat(2,1fr)}.mmg-rp__journey{grid-template-columns:1fr;gap:12px}.mmg-rp__journey i{display:none}}@media(max-width:620px){.mmg-rp{padding:64px 18px 90px}.mmg-rp__header{grid-template-columns:1fr;gap:18px}.mmg-rp__grid{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px}.mmg-rp__card{min-width:82vw;scroll-snap-align:start}.mmg-rp__journey{padding:18px}}`;