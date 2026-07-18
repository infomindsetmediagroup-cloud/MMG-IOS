export const DIGITAL_PRODUCT_TEMPLATE_FILE = "templates/product.mmg-digital.json";
export const DIGITAL_PRODUCT_SECTION_FILE = "sections/mmg-digital-product.liquid";
export const DIGITAL_PRODUCT_CSS_FILE = "assets/mmg-digital-product.css";

export const DIGITAL_PRODUCT_TEMPLATE_SOURCE = JSON.stringify({
  sections: {
    main: {
      type: "mmg-digital-product",
      settings: {
        eyebrow: "Professional digital resource",
        promise: "A practical, focused resource built to help you move from learning to execution.",
        included_heading: "What is included",
        outcomes_heading: "What you will be able to do",
        journey_heading: "Your Learning Journey",
        journey_copy: "Use this resource as one step in a larger path of knowledge, implementation, and measurable progress.",
        portal_heading: "Your purchase stays organized",
        portal_copy: "Eligible digital resources and project deliverables are available through your Mindset Media Group customer workspace.",
        faq_heading: "Common questions"
      }
    }
  },
  order: ["main"]
}, null, 2);

export const DIGITAL_PRODUCT_SECTION_SOURCE = String.raw`{{ 'mmg-digital-product.css' | asset_url | stylesheet_tag }}
{% assign selected_variant = product.selected_or_first_available_variant %}
{% assign learning_items = product.metafields.custom.learning_outcomes.value %}
{% assign included_items = product.metafields.custom.included_assets.value %}
{% assign faq_items = product.metafields.custom.faq.value %}
<section class="mmg-dp" data-product-id="{{ product.id }}">
  <nav class="mmg-dp__crumbs" aria-label="Breadcrumb">
    <a href="/">Home</a><span>/</span><a href="/pages/products">Products</a><span>/</span><span aria-current="page">{{ product.title }}</span>
  </nav>

  <div class="mmg-dp__hero">
    <div class="mmg-dp__media">
      <div class="mmg-dp__cover">
        {% if product.featured_media %}
          {{ product.featured_media | image_url: width: 1400 | image_tag: loading: 'eager', widths: '420, 720, 1000, 1400', sizes: '(max-width: 860px) 92vw, 44vw', alt: product.featured_media.alt | default: product.title }}
        {% else %}
          <div class="mmg-dp__placeholder" role="img" aria-label="Product cover placeholder"><span>{{ product.title }}</span></div>
        {% endif %}
      </div>
      {% if product.media.size > 1 %}
        <div class="mmg-dp__thumbs" aria-label="Product previews">
          {% for media in product.media limit: 5 %}
            <a href="{{ media.preview_image | image_url: width: 1400 }}" aria-label="Open preview {{ forloop.index }}">
              {{ media.preview_image | image_url: width: 180 | image_tag: loading: 'lazy', alt: media.alt | default: product.title }}
            </a>
          {% endfor %}
        </div>
      {% endif %}
    </div>

    <div class="mmg-dp__summary">
      <p class="mmg-dp__eyebrow">{{ section.settings.eyebrow }}</p>
      <h1>{{ product.title }}</h1>
      {% if product.metafields.custom.listing_subtitle != blank %}
        <p class="mmg-dp__subtitle">{{ product.metafields.custom.listing_subtitle }}</p>
      {% else %}
        <p class="mmg-dp__subtitle">{{ section.settings.promise }}</p>
      {% endif %}
      <div class="mmg-dp__price" aria-live="polite">{{ selected_variant.price | money }}</div>
      <div class="mmg-dp__description rte">{{ product.description }}</div>

      {% form 'product', product, class: 'mmg-dp__form' %}
        <input type="hidden" name="id" value="{{ selected_variant.id }}">
        <button class="mmg-dp__buy" type="submit" name="add" {% unless selected_variant.available %}disabled{% endunless %}>
          {% if selected_variant.available %}Add digital resource to cart{% else %}Currently unavailable{% endif %}
        </button>
        <div class="mmg-dp__assurance">
          <span>Digital product</span><span>Secure checkout</span><span>Customer workspace access where eligible</span>
        </div>
      {% endform %}
      <p class="mmg-dp__delivery">Digital access instructions are provided after purchase. No physical item is shipped.</p>
    </div>
  </div>

  <div class="mmg-dp__body">
    <section class="mmg-dp__panel">
      <p class="mmg-dp__kicker">Inside the resource</p>
      <h2>{{ section.settings.included_heading }}</h2>
      <div class="mmg-dp__grid mmg-dp__grid--included">
        {% if included_items != blank %}
          {% for item in included_items %}<article><span>{{ forloop.index | prepend: '0' }}</span><p>{{ item }}</p></article>{% endfor %}
        {% else %}
          <article><span>01</span><p>A professionally structured digital guide</p></article>
          <article><span>02</span><p>Practical explanations and implementation direction</p></article>
          <article><span>03</span><p>A reusable resource you can revisit as your work advances</p></article>
        {% endif %}
      </div>
    </section>

    <section class="mmg-dp__panel mmg-dp__panel--dark">
      <p class="mmg-dp__kicker">From information to action</p>
      <h2>{{ section.settings.outcomes_heading }}</h2>
      <div class="mmg-dp__outcomes">
        {% if learning_items != blank %}
          {% for item in learning_items %}<div><b>✓</b><p>{{ item }}</p></div>{% endfor %}
        {% else %}
          <div><b>✓</b><p>Understand the core ideas without unnecessary complexity.</p></div>
          <div><b>✓</b><p>Apply the material to a real objective, project, or workflow.</p></div>
          <div><b>✓</b><p>Identify the next logical step in your learning journey.</p></div>
        {% endif %}
      </div>
    </section>

    <section class="mmg-dp__journey">
      <div><p class="mmg-dp__kicker">Connected learning</p><h2>{{ section.settings.journey_heading }}</h2><p>{{ section.settings.journey_copy }}</p></div>
      <ol>
        <li><span>1</span><div><b>Learn</b><p>Build a clear foundation with this resource.</p></div></li>
        <li><span>2</span><div><b>Apply</b><p>Use the knowledge against a real goal.</p></div></li>
        <li><span>3</span><div><b>Advance</b><p>Continue through related products, membership, or professional support.</p></div></li>
      </ol>
    </section>

    <section class="mmg-dp__portal">
      <div><p class="mmg-dp__kicker">Customer experience</p><h2>{{ section.settings.portal_heading }}</h2><p>{{ section.settings.portal_copy }}</p></div>
      <a href="/pages/customer-portal">Open Customer Portal</a>
    </section>

    <section class="mmg-dp__faq">
      <p class="mmg-dp__kicker">Before you purchase</p><h2>{{ section.settings.faq_heading }}</h2>
      {% if faq_items != blank %}
        {% for item in faq_items %}<details><summary>{{ item.question }}</summary><div>{{ item.answer }}</div></details>{% endfor %}
      {% else %}
        <details><summary>Is this a physical product?</summary><div>No. This is a digital resource. No physical item will be shipped.</div></details>
        <details><summary>How do I receive it?</summary><div>Access instructions are provided after checkout using the delivery method configured for this product.</div></details>
        <details><summary>Can I use it more than once?</summary><div>Yes. The resource is designed to be revisited as you apply the material and advance your work.</div></details>
      {% endif %}
    </section>
  </div>

  <aside class="mmg-dp__sticky" aria-label="Purchase {{ product.title }}">
    <div><span>{{ product.title }}</span><b>{{ selected_variant.price | money }}</b></div>
    {% form 'product', product %}<input type="hidden" name="id" value="{{ selected_variant.id }}"><button type="submit" name="add" {% unless selected_variant.available %}disabled{% endunless %}>{% if selected_variant.available %}Add to cart{% else %}Unavailable{% endif %}</button>{% endform %}
  </aside>
</section>
{% schema %}
{"name":"MMG Digital Product","tag":"section","class":"section-mmg-digital-product","settings":[{"type":"text","id":"eyebrow","label":"Eyebrow","default":"Professional digital resource"},{"type":"textarea","id":"promise","label":"Default promise","default":"A practical, focused resource built to help you move from learning to execution."},{"type":"text","id":"included_heading","label":"Included heading","default":"What is included"},{"type":"text","id":"outcomes_heading","label":"Outcomes heading","default":"What you will be able to do"},{"type":"text","id":"journey_heading","label":"Journey heading","default":"Your Learning Journey"},{"type":"textarea","id":"journey_copy","label":"Journey copy","default":"Use this resource as one step in a larger path of knowledge, implementation, and measurable progress."},{"type":"text","id":"portal_heading","label":"Portal heading","default":"Your purchase stays organized"},{"type":"textarea","id":"portal_copy","label":"Portal copy","default":"Eligible digital resources and project deliverables are available through your Mindset Media Group customer workspace."},{"type":"text","id":"faq_heading","label":"FAQ heading","default":"Common questions"}],"presets":[{"name":"MMG Digital Product"}]}
{% endschema %}`;

export const DIGITAL_PRODUCT_CSS_SOURCE = String.raw`.mmg-dp{--ink:#111827;--muted:#5d6675;--line:#dfe4eb;--blue:#1769e0;--soft:#f5f7fa;color:var(--ink);max-width:1320px;margin:auto;padding:18px 28px 110px}.mmg-dp *{box-sizing:border-box}.mmg-dp__crumbs{display:flex;gap:9px;align-items:center;font-size:13px;color:var(--muted);margin:4px 0 30px;overflow:hidden;white-space:nowrap}.mmg-dp__crumbs a{color:inherit;text-decoration:none}.mmg-dp__hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(380px,.86fr);gap:68px;align-items:start}.mmg-dp__media{position:sticky;top:100px}.mmg-dp__cover{background:linear-gradient(145deg,#f4f6f9,#e7ecf2);border:1px solid var(--line);border-radius:28px;padding:34px;display:grid;place-items:center;min-height:620px;overflow:hidden}.mmg-dp__cover img{max-width:100%;max-height:650px;width:auto;height:auto;object-fit:contain;filter:drop-shadow(0 20px 22px rgba(17,24,39,.16))}.mmg-dp__placeholder{width:min(78%,420px);aspect-ratio:4/5.5;background:#162237;color:#fff;display:grid;place-items:center;text-align:center;padding:28px;border-radius:4px;box-shadow:0 24px 38px rgba(17,24,39,.22);font:700 28px/1.1 Georgia,serif}.mmg-dp__thumbs{display:flex;gap:10px;margin-top:14px}.mmg-dp__thumbs a{border:1px solid var(--line);border-radius:12px;width:72px;height:72px;padding:5px;display:grid;place-items:center}.mmg-dp__thumbs img{max-width:100%;max-height:100%;object-fit:contain}.mmg-dp__summary{padding-top:22px}.mmg-dp__eyebrow,.mmg-dp__kicker{text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:800;color:var(--blue);margin:0 0 14px}.mmg-dp h1{font:700 clamp(42px,5vw,70px)/.98 Georgia,serif;letter-spacing:-.045em;margin:0 0 18px}.mmg-dp__subtitle{font-size:20px;line-height:1.55;color:var(--muted);margin:0 0 22px}.mmg-dp__price{font-size:27px;font-weight:800;margin:0 0 22px}.mmg-dp__description{color:#3e4856;line-height:1.75;font-size:16px}.mmg-dp__form{margin-top:26px}.mmg-dp__buy,.mmg-dp__sticky button{width:100%;border:0;border-radius:14px;background:var(--blue);color:#fff;font-weight:800;font-size:16px;padding:17px 22px;cursor:pointer}.mmg-dp button:disabled{opacity:.5;cursor:not-allowed}.mmg-dp__assurance{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.mmg-dp__assurance span{font-size:11px;line-height:1.35;text-align:center;background:var(--soft);border-radius:10px;padding:10px 6px}.mmg-dp__delivery{font-size:12px;color:var(--muted);line-height:1.5}.mmg-dp__body{margin-top:100px}.mmg-dp__panel{padding:70px 7%;border-top:1px solid var(--line)}.mmg-dp__panel h2,.mmg-dp__journey h2,.mmg-dp__portal h2,.mmg-dp__faq h2{font:700 clamp(34px,4vw,54px)/1.05 Georgia,serif;letter-spacing:-.035em;margin:0 0 28px}.mmg-dp__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.mmg-dp__grid article{border:1px solid var(--line);border-radius:18px;padding:25px;min-height:150px}.mmg-dp__grid article span{color:var(--blue);font-weight:800;font-size:12px}.mmg-dp__grid article p{font-size:18px;line-height:1.45;margin:25px 0 0}.mmg-dp__panel--dark{background:#121b2b;color:#fff;border-radius:28px;border:0}.mmg-dp__panel--dark .mmg-dp__kicker{color:#82b5ff}.mmg-dp__outcomes{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.mmg-dp__outcomes div{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);border-radius:16px;padding:22px}.mmg-dp__outcomes b{color:#82b5ff}.mmg-dp__outcomes p{line-height:1.5;margin:15px 0 0}.mmg-dp__journey,.mmg-dp__portal{display:grid;grid-template-columns:.8fr 1.2fr;gap:60px;padding:85px 7%;align-items:center}.mmg-dp__journey>div>p:last-child,.mmg-dp__portal p:last-child{color:var(--muted);line-height:1.65}.mmg-dp__journey ol{list-style:none;margin:0;padding:0;display:grid;gap:12px}.mmg-dp__journey li{display:flex;gap:17px;border:1px solid var(--line);border-radius:16px;padding:20px}.mmg-dp__journey li>span{width:34px;height:34px;border-radius:50%;background:var(--blue);color:#fff;display:grid;place-items:center;font-weight:800;flex:none}.mmg-dp__journey li p{margin:5px 0 0;color:var(--muted)}.mmg-dp__portal{background:var(--soft);border-radius:28px}.mmg-dp__portal a{justify-self:end;background:var(--ink);color:#fff;text-decoration:none;font-weight:800;padding:15px 22px;border-radius:13px}.mmg-dp__faq{max-width:920px;margin:0 auto;padding:90px 20px}.mmg-dp__faq details{border-top:1px solid var(--line);padding:21px 0}.mmg-dp__faq summary{cursor:pointer;font-weight:800;font-size:18px}.mmg-dp__faq details div{padding:14px 0 0;color:var(--muted);line-height:1.65}.mmg-dp__sticky{display:none}@media(max-width:860px){.mmg-dp{padding:12px 16px 96px}.mmg-dp__hero{grid-template-columns:1fr;gap:28px}.mmg-dp__media{position:static}.mmg-dp__cover{min-height:auto;padding:20px;border-radius:20px}.mmg-dp__cover img{max-height:520px}.mmg-dp__summary{padding-top:0}.mmg-dp h1{font-size:44px}.mmg-dp__assurance{grid-template-columns:1fr}.mmg-dp__body{margin-top:58px}.mmg-dp__panel{padding:54px 4px}.mmg-dp__grid,.mmg-dp__outcomes{grid-template-columns:1fr}.mmg-dp__panel--dark{padding:42px 24px}.mmg-dp__journey,.mmg-dp__portal{grid-template-columns:1fr;gap:26px;padding:54px 22px}.mmg-dp__portal a{justify-self:start}.mmg-dp__sticky{position:fixed;z-index:30;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;bottom:0;left:0;right:0;background:rgba(255,255,255,.96);backdrop-filter:blur(14px);border-top:1px solid var(--line);padding:10px 14px}.mmg-dp__sticky div{min-width:0}.mmg-dp__sticky span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.mmg-dp__sticky b{font-size:14px}.mmg-dp__sticky button{width:auto;padding:12px 18px}.mmg-dp__sticky form{margin:0}}`;