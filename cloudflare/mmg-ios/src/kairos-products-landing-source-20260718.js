export const PRODUCTS_TEMPLATE_FILE = "templates/page.products.json";
export const PRODUCTS_SECTION_FILE = "sections/mmg-products-landing.liquid";
export const PRODUCTS_CSS_FILE = "assets/mmg-products-landing.css";

export const PRODUCTS_TEMPLATE_SOURCE = JSON.stringify({
  sections: { main: { type: "mmg-products-landing", settings: {} } },
  order: ["main"]
}, null, 2);

export const PRODUCTS_SECTION_SOURCE = `{% comment %}Canonical MMG Products landing{% endcomment %}
{{ 'mmg-products-landing.css' | asset_url | stylesheet_tag }}
<section class="mmg-products" aria-labelledby="mmg-products-title">
  <div class="mmg-products__shell">
    <header class="mmg-products__hero">
      <p class="mmg-products__eyebrow">Mindset Media Group™ Products</p>
      <h1 id="mmg-products-title">Practical resources for the next step in your work</h1>
      <p class="mmg-products__lead">Explore digital guides, creator education, publishing resources, and business tools designed to help you learn, build, publish, and grow with clarity.</p>
      <div class="mmg-products__actions">
        <a class="mmg-products__button mmg-products__button--primary" href="#featured-products">Browse featured products</a>
        <a class="mmg-products__button" href="/pages/knowledge-library">Explore the Knowledge Library</a>
      </div>
    </header>

    <nav class="mmg-products__pathways" aria-label="Product pathways">
      <a href="/collections/ai-guides"><span>AI Guides</span><small>Use AI with more confidence and direction.</small></a>
      <a href="/collections/creator-education"><span>Creator Education</span><small>Build stronger content, systems, and audience momentum.</small></a>
      <a href="/collections/publishing-education"><span>Publishing Education</span><small>Move from manuscript or idea toward a finished publication.</small></a>
      <a href="/collections/mindset-motivation"><span>Mindset &amp; Motivation</span><small>Strengthen resilience, discipline, and personal momentum.</small></a>
    </nav>

    <section class="mmg-products__section" id="featured-products" aria-labelledby="featured-products-title">
      <div class="mmg-products__section-heading">
        <p class="mmg-products__eyebrow">Featured resources</p>
        <h2 id="featured-products-title">Start with a focused result</h2>
        <p>Each product is designed around a practical outcome rather than an isolated download.</p>
      </div>
      <div class="mmg-products__grid">
        <article class="mmg-products__card">
          <div class="mmg-products__card-label">AI learning</div>
          <h3>AI Image Mastery</h3>
          <p>Build a stronger foundation for planning, prompting, refining, and using AI-generated visuals.</p>
          <a href="/products/ai-image-mastery">View product</a>
        </article>
        <article class="mmg-products__card">
          <div class="mmg-products__card-label">Creator education</div>
          <h3>Content Monetization Playbook</h3>
          <p>Connect content strategy, audience value, and practical monetization pathways.</p>
          <a href="/products/content-monetization-playbook">View product</a>
        </article>
        <article class="mmg-products__card">
          <div class="mmg-products__card-label">Publishing support</div>
          <h3>Publishing Resources</h3>
          <p>Use structured guides and tools to prepare, refine, and advance your publishing work.</p>
          <a href="/collections/publishing-education">Browse collection</a>
        </article>
      </div>
    </section>

    <section class="mmg-products__section mmg-products__section--journey" aria-labelledby="learning-journey-title">
      <div class="mmg-products__section-heading">
        <p class="mmg-products__eyebrow">Your learning journey</p>
        <h2 id="learning-journey-title">Build capability in sequence</h2>
        <p>Choose the resource that matches your current stage, then continue into the next connected skill.</p>
      </div>
      <ol class="mmg-products__steps">
        <li><span>01</span><div><strong>Learn the foundation</strong><p>Understand the concepts, standards, and decisions behind the work.</p></div></li>
        <li><span>02</span><div><strong>Apply the method</strong><p>Use practical exercises, prompts, templates, and examples.</p></div></li>
        <li><span>03</span><div><strong>Create a finished asset</strong><p>Turn the lesson into content, a publication, or a business resource.</p></div></li>
        <li><span>04</span><div><strong>Advance with support</strong><p>Continue through related products, membership, or professional services.</p></div></li>
      </ol>
    </section>

    <section class="mmg-products__section" aria-labelledby="choose-path-title">
      <div class="mmg-products__section-heading">
        <p class="mmg-products__eyebrow">Choose the right path</p>
        <h2 id="choose-path-title">Products, membership, and services serve different needs</h2>
      </div>
      <div class="mmg-products__choice-grid">
        <article><h3>Choose a product</h3><p>For a focused resource you can study and apply at your own pace.</p><a href="/collections/all">Browse all products</a></article>
        <article><h3>Choose membership</h3><p>For recurring curated learning resources and continued development.</p><a href="/pages/membership">Explore membership</a></article>
        <article><h3>Choose a service</h3><p>For hands-on professional production, publishing, or creative support.</p><a href="/pages/services">Explore services</a></article>
      </div>
    </section>

    <section class="mmg-products__guidance" aria-labelledby="kairos-product-guidance-title">
      <div>
        <p class="mmg-products__eyebrow">Kairos guidance</p>
        <h2 id="kairos-product-guidance-title">Move from browsing to the right next action</h2>
        <p>Kairos connects products with the broader ecosystem so customers can understand what a resource supports, where it fits, and what comes next.</p>
      </div>
      <div class="mmg-products__guidance-links">
        <a href="/pages/kairos">Meet Kairos</a>
        <a href="/pages/customer-portal">Open Customer Portal</a>
      </div>
    </section>

    <section class="mmg-products__footer-cta" aria-labelledby="product-cta-title">
      <p class="mmg-products__eyebrow">Continue your journey</p>
      <h2 id="product-cta-title">Choose one useful next step and build from there</h2>
      <p>Start with a focused product, deepen your learning in the Knowledge Library, or move into professional support when the work requires it.</p>
      <div class="mmg-products__actions">
        <a class="mmg-products__button mmg-products__button--primary" href="/collections/all">View all products</a>
        <a class="mmg-products__button" href="/pages/services">Get professional support</a>
      </div>
    </section>
  </div>
</section>
{% schema %}
{"name":"MMG Products landing","settings":[],"presets":[{"name":"MMG Products landing"}]}
{% endschema %}`;

export const PRODUCTS_CSS_SOURCE = `.mmg-products{--ink:#111827;--muted:#5d6675;--line:#dfe4ea;--panel:#f6f8fb;--accent:#173f73;background:#fff;color:var(--ink);font-family:var(--font-body-family,Arial,sans-serif)}.mmg-products *{box-sizing:border-box}.mmg-products__shell{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:72px 0 88px}.mmg-products__hero{max-width:860px;padding:44px 0 56px}.mmg-products__eyebrow{margin:0 0 14px;color:var(--accent);font-size:.78rem;font-weight:750;letter-spacing:.12em;text-transform:uppercase}.mmg-products h1,.mmg-products h2,.mmg-products h3{margin-top:0;line-height:1.08}.mmg-products h1{font-size:clamp(2.7rem,6vw,5.6rem);letter-spacing:-.055em;margin-bottom:24px}.mmg-products h2{font-size:clamp(2rem,4vw,3.7rem);letter-spacing:-.04em;margin-bottom:18px}.mmg-products h3{font-size:1.35rem;margin-bottom:12px}.mmg-products p{color:var(--muted);line-height:1.7}.mmg-products__lead{max-width:760px;font-size:1.18rem}.mmg-products__actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.mmg-products__button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border:1px solid var(--line);border-radius:999px;color:var(--ink);text-decoration:none;font-weight:700}.mmg-products__button--primary{background:var(--ink);border-color:var(--ink);color:#fff}.mmg-products__pathways{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:94px}.mmg-products__pathways a,.mmg-products__card,.mmg-products__choice-grid article{border:1px solid var(--line);border-radius:22px;padding:25px;background:#fff}.mmg-products__pathways a{text-decoration:none;color:var(--ink)}.mmg-products__pathways span{display:block;font-weight:800;margin-bottom:8px}.mmg-products__pathways small{display:block;color:var(--muted);line-height:1.5}.mmg-products__section{padding:76px 0;border-top:1px solid var(--line)}.mmg-products__section-heading{max-width:760px;margin-bottom:34px}.mmg-products__grid,.mmg-products__choice-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.mmg-products__card{display:flex;flex-direction:column;min-height:280px}.mmg-products__card-label{font-size:.74rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:30px}.mmg-products__card a,.mmg-products__choice-grid a,.mmg-products__guidance-links a{margin-top:auto;color:var(--accent);font-weight:800;text-decoration:none}.mmg-products__section--journey{background:var(--panel);border-radius:32px;padding:60px;margin:30px 0 76px;border-top:0}.mmg-products__steps{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.mmg-products__steps li{display:flex;gap:18px;padding:23px;border:1px solid var(--line);border-radius:18px;background:#fff}.mmg-products__steps span{font-weight:850;color:var(--accent)}.mmg-products__steps p{margin-bottom:0}.mmg-products__choice-grid article{min-height:230px;display:flex;flex-direction:column}.mmg-products__guidance{display:grid;grid-template-columns:1.5fr .5fr;gap:38px;align-items:end;margin:76px 0;padding:46px;border-radius:28px;background:var(--ink);color:#fff}.mmg-products__guidance p{color:#cbd5e1}.mmg-products__guidance-links{display:flex;flex-direction:column;gap:12px}.mmg-products__guidance-links a{display:block;background:#fff;padding:14px 18px;border-radius:999px;text-align:center}.mmg-products__footer-cta{max-width:900px;padding:56px 0 0}.mmg-products__footer-cta>p{max-width:720px}@media(max-width:900px){.mmg-products__pathways{grid-template-columns:repeat(2,1fr)}.mmg-products__grid,.mmg-products__choice-grid{grid-template-columns:1fr}.mmg-products__guidance{grid-template-columns:1fr}.mmg-products__steps{grid-template-columns:1fr}}@media(max-width:600px){.mmg-products__shell{width:min(100% - 22px,1180px);padding-top:42px}.mmg-products__hero{padding-top:24px}.mmg-products__pathways{grid-template-columns:1fr;margin-bottom:60px}.mmg-products__section{padding:54px 0}.mmg-products__section--journey{padding:28px 18px;border-radius:22px}.mmg-products__guidance{padding:30px 22px;border-radius:22px}.mmg-products__button{width:100%}}`;