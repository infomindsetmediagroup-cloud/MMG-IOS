import {
  deleteThemeFiles,
  hashText,
  httpError,
  inspectStagingSource,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_CANONICAL_HOMEPAGE_BUILD = "kairos-canonical-homepage-builder-20260717-1";

const BUILD_PATH = "/api/shopify/staging/canonical-homepage/build";
const CONFIRMATION = "BUILD_CANONICAL_MMG_HOMEPAGE_STAGING";
const TEMPLATE_FILE = "templates/index.json";
const SECTION_FILE = "sections/mmg-canonical-homepage.liquid";
const CSS_FILE = "assets/mmg-canonical-homepage.css";
const JS_FILE = "assets/mmg-canonical-homepage.js";
const MANAGED_FILES = [TEMPLATE_FILE, SECTION_FILE, CSS_FILE, JS_FILE];

const TEMPLATE_SOURCE = JSON.stringify({
  sections: {
    mmg_canonical_homepage: {
      type: "mmg-canonical-homepage",
      settings: {},
    },
  },
  order: ["mmg_canonical_homepage"],
}, null, 2);

const SECTION_SOURCE = String.raw`{{ 'mmg-canonical-homepage.css' | asset_url | stylesheet_tag }}

<section
  id="mmg-home"
  class="mmg-home"
  data-mmg-canonical-homepage
  data-build="kairos-canonical-homepage-builder-20260717-1"
  aria-label="Mindset Media Group knowledge ecosystem"
>
  <nav class="mmg-home__rail" aria-label="Homepage sections">
    <div class="mmg-home__rail-inner">
      <a href="#pathways">Choose a path</a>
      <a href="#resources">Resources</a>
      <a href="#services">Services</a>
      <a href="#subscriptions">Subscriptions</a>
      <a href="#kairos">Kairos</a>
    </div>
  </nav>

  <header class="mmg-hero mmg-reveal" data-mmg-section="hero">
    <div class="mmg-shell mmg-hero__grid">
      <div class="mmg-hero__copy">
        <p class="mmg-kicker">Mindset Media Group™ · Knowledge Ecosystem</p>
        <h1>Your Knowledge Has Value.</h1>
        <p class="mmg-hero__lead">Turn what you know, what you have lived, and what you are building into books, digital products, brands, and lasting intellectual property.</p>
        <p class="mmg-hero__support">Practical education, professional services, digital resources, personalized subscriptions, and Kairos-guided execution—connected in one experience built to move ideas into completed work.</p>
        <div class="mmg-actions" aria-label="Primary homepage actions">
          <a class="mmg-button mmg-button--primary" href="#pathways">Explore the Ecosystem</a>
          <a class="mmg-button mmg-button--secondary" href="#kairos">Meet Kairos</a>
        </div>
      </div>
      <aside class="mmg-hero__panel" aria-label="How Mindset Media Group helps">
        <p class="mmg-hero__panel-label">One connected path</p>
        <ol class="mmg-progress-list">
          <li><span>01</span><div><strong>Start with an objective</strong><p>Tell us what you want to create, publish, improve, or grow.</p></div></li>
          <li><span>02</span><div><strong>Choose the right support</strong><p>Use practical resources, professional services, or Kairos-guided execution.</p></div></li>
          <li><span>03</span><div><strong>Build visible progress</strong><p>Move from idea to a professional deliverable with a clear next step.</p></div></li>
        </ol>
      </aside>
    </div>
    <div class="mmg-shell mmg-capability-strip" aria-label="Ecosystem capabilities">
      <span>Publishing</span><span>Creator education</span><span>Digital products</span><span>Guided execution</span>
    </div>
  </header>

  <main>
    <section id="pathways" class="mmg-section mmg-reveal" data-mmg-section="pathways">
      <div class="mmg-shell">
        <div class="mmg-section-heading">
          <p class="mmg-kicker">Choose your direction</p>
          <h2>Choose What You Want to Build</h2>
          <p>Begin with the objective in front of you. Each pathway connects the right knowledge, service, product, and next action around the work you are building.</p>
        </div>
        <div class="mmg-path-grid">
          <a class="mmg-path-card" href="/collections/all"><span class="mmg-path-card__number">01</span><h3>Publish Your Knowledge</h3><p>Turn expertise and lived experience into professional books, guides, and publishing assets.</p><span class="mmg-card-link">Explore publishing <span aria-hidden="true">→</span></span></a>
          <a class="mmg-path-card" href="/collections/all"><span class="mmg-path-card__number">02</span><h3>Build Your Brand</h3><p>Create a clear, consistent presence supported by practical content, design, and business systems.</p><span class="mmg-card-link">Explore branding <span aria-hidden="true">→</span></span></a>
          <a class="mmg-path-card" href="/products/ai-image-mastery"><span class="mmg-path-card__number">03</span><h3>Grow With AI</h3><p>Use practical AI to improve creativity, productivity, communication, and execution.</p><span class="mmg-card-link">Explore AI resources <span aria-hidden="true">→</span></span></a>
          <a class="mmg-path-card" href="/collections/all"><span class="mmg-path-card__number">04</span><h3>Create Digital Products</h3><p>Transform useful knowledge into resources that educate customers and create durable value.</p><span class="mmg-card-link">Explore products <span aria-hidden="true">→</span></span></a>
          <a class="mmg-path-card" href="#services"><span class="mmg-path-card__number">05</span><h3>Access Professional Services</h3><p>Get publishing, editorial, design, creator, and business support aligned to your project.</p><span class="mmg-card-link">Explore services <span aria-hidden="true">→</span></span></a>
          <a class="mmg-path-card" href="#kairos"><span class="mmg-path-card__number">06</span><h3>Work With Kairos</h3><p>Let Kairos organize the objective, coordinate the next action, and move the work toward a verified result.</p><span class="mmg-card-link">Start with Kairos <span aria-hidden="true">→</span></span></a>
        </div>
      </div>
    </section>

    <section id="resources" class="mmg-section mmg-section--contrast mmg-reveal" data-mmg-section="resources">
      <div class="mmg-shell">
        <div class="mmg-split-heading">
          <div><p class="mmg-kicker">Practical knowledge</p><h2>Products and Resources Built for Progress</h2></div>
          <p>Every resource is designed to help you understand the next action, apply what you learn, and continue through a connected learning journey.</p>
        </div>
        <div class="mmg-feature-grid">
          <article class="mmg-feature-card mmg-feature-card--primary"><p class="mmg-card-tag">AI guide</p><h3>AI Image Mastery</h3><p>Build stronger visual concepts, prompts, and production habits with practical guidance for creators and small businesses.</p><a class="mmg-button mmg-button--light" href="/products/ai-image-mastery">View the guide</a></article>
          <article class="mmg-feature-card"><p class="mmg-card-tag">Creator education</p><h3>Practical Resources for the Next Step</h3><p>Explore guides, tools, and educational products organized around publishing, AI, content, and business execution.</p><a class="mmg-card-link" href="/collections/all">Browse all resources <span aria-hidden="true">→</span></a></article>
          <article class="mmg-feature-card"><p class="mmg-card-tag">Learning journey</p><h3>Keep Building From What You Learn</h3><p>Move from one useful resource to the next instead of treating every purchase as an isolated event.</p><a class="mmg-card-link" href="#subscriptions">Continue your journey <span aria-hidden="true">→</span></a></article>
        </div>
      </div>
    </section>

    <section id="services" class="mmg-section mmg-reveal" data-mmg-section="services">
      <div class="mmg-shell">
        <div class="mmg-section-heading mmg-section-heading--center">
          <p class="mmg-kicker">Professional support</p>
          <h2>Move From Draft to Deliverable</h2>
          <p>Choose focused support for publishing, editorial development, creator growth, brand development, design, production, and business execution.</p>
        </div>
        <div class="mmg-service-grid">
          <article class="mmg-service-card"><div class="mmg-service-card__icon" aria-hidden="true">P</div><h3>Publishing and Editorial</h3><p>Move manuscripts, guides, and publishing projects toward clear, professional, release-ready deliverables.</p><a href="/collections/all">Explore publishing support</a></article>
          <article class="mmg-service-card"><div class="mmg-service-card__icon" aria-hidden="true">C</div><h3>Creator and Business</h3><p>Strengthen content systems, customer communication, offers, and the operating structure behind your work.</p><a href="/collections/all">Explore creator services</a></article>
          <article class="mmg-service-card"><div class="mmg-service-card__icon" aria-hidden="true">D</div><h3>Design and Production</h3><p>Prepare visual, digital, and production assets that support the complete customer journey.</p><a href="/products/professional-cover-design-service">Explore design support</a></article>
        </div>
        <div class="mmg-inline-cta"><div><p class="mmg-kicker">Have a project in mind?</p><h3>Start with the work you need completed.</h3></div><a class="mmg-button mmg-button--primary" href="/pages/contact">Start a Project</a></div>
      </div>
    </section>

    <section id="subscriptions" class="mmg-section mmg-section--soft mmg-reveal" data-mmg-section="subscriptions">
      <div class="mmg-shell mmg-subscription-grid">
        <div>
          <p class="mmg-kicker">Personalized learning</p>
          <h2>Learning That Continues With You</h2>
          <p class="mmg-large-copy">Choose a weekly, bi-weekly, or monthly cadence and receive curated digital resources aligned to your role, interests, and current objectives.</p>
          <a class="mmg-button mmg-button--primary" href="/pages/contact">Explore Subscriptions</a>
        </div>
        <div class="mmg-cadence-list" aria-label="Subscription cadence options">
          <article><span>Weekly</span><p>Maintain momentum with a focused resource package every week.</p></article>
          <article><span>Bi-weekly</span><p>Balance consistent progress with more time to apply each resource.</p></article>
          <article><span>Monthly</span><p>Receive a curated monthly package aligned to your priorities.</p></article>
          <p class="mmg-cadence-note">Review and adjust your upcoming package before distribution so each delivery continues to match your goals.</p>
        </div>
      </div>
    </section>

    <section id="kairos" class="mmg-section mmg-kairos mmg-reveal" data-mmg-section="kairos">
      <div class="mmg-shell mmg-kairos__grid">
        <div class="mmg-kairos__mark" aria-hidden="true"><span>K</span><i></i></div>
        <div>
          <p class="mmg-kicker">The intelligence operating system</p>
          <h2>Kairos Turns Objectives Into Guided Execution</h2>
          <p class="mmg-large-copy">Describe what you want to accomplish. Kairos connects the relevant knowledge, tools, services, and workflows around that objective, then coordinates the next action toward a verified result.</p>
          <ul class="mmg-check-list">
            <li>Organizes context around the objective</li>
            <li>Identifies the strongest next action</li>
            <li>Coordinates work across the MMG ecosystem</li>
            <li>Preserves visible project progress</li>
          </ul>
          <details class="mmg-moment"><summary>Hear the Kairos welcome message</summary><p>Hi, I’m Kairos. Welcome to Mindset Media Group. Tell me what you want to build, and I’ll help organize the path forward.</p></details>
        </div>
      </div>
    </section>

    <section id="mission" class="mmg-section mmg-reveal" data-mmg-section="mission">
      <div class="mmg-shell mmg-mission-grid">
        <div><p class="mmg-kicker">Our operating belief</p><h2>We’re Not Gatekeepers. We’re Door Openers.</h2></div>
        <div><p class="mmg-large-copy">Mindset Media Group makes professional knowledge, publishing, technology, and opportunity more accessible without unnecessary complexity or barriers.</p><p>Everything is designed around progress, integrity, transparent service, and helping creators, entrepreneurs, authors, educators, and small businesses turn useful knowledge into work that lasts.</p></div>
      </div>
    </section>

    <section id="questions" class="mmg-section mmg-section--bordered mmg-reveal" data-mmg-section="questions">
      <div class="mmg-shell mmg-faq-grid">
        <div><p class="mmg-kicker">Common questions</p><h2>Start With Clarity</h2><p>Understand how the ecosystem connects before choosing your next step.</p></div>
        <div class="mmg-faq-list">
          <details><summary>What can Mindset Media Group help me build?</summary><p>Books, guides, digital products, publishing assets, creator systems, brand materials, and other knowledge-based deliverables supported by practical education and professional services.</p></details>
          <details><summary>Do I need to know which service or product I need?</summary><p>No. Start with the objective. The ecosystem is designed to help connect that objective to the right pathway, resource, service, or guided workflow.</p></details>
          <details><summary>How does Kairos fit into the experience?</summary><p>Kairos is the coordination layer. It organizes context, identifies the next action, and helps move approved work through a visible execution process.</p></details>
        </div>
      </div>
    </section>

    <section id="next-step" class="mmg-final mmg-reveal" data-mmg-section="next-step">
      <div class="mmg-shell mmg-final__inner">
        <p class="mmg-kicker">Your next move</p>
        <h2>Start With What You Know</h2>
        <p>Choose a path, explore products and services, join a personalized learning cadence, or let Kairos guide the next step.</p>
        <div class="mmg-actions mmg-actions--center"><a class="mmg-button mmg-button--light" href="#pathways">Choose Your Path</a><a class="mmg-button mmg-button--ghost-light" href="#kairos">Start With Kairos</a></div>
      </div>
    </section>
  </main>
</section>

<script src="{{ 'mmg-canonical-homepage.js' | asset_url }}" defer="defer"></script>

{% schema %}
{
  "name": "MMG canonical homepage",
  "tag": "section",
  "class": "mmg-canonical-homepage-section",
  "settings": [],
  "presets": [
    {
      "name": "MMG canonical homepage"
    }
  ]
}
{% endschema %}`;

const CSS_SOURCE = String.raw`:root{--mmg-ink:#10182b;--mmg-muted:#536077;--mmg-blue:#2767ff;--mmg-blue-dark:#1545b8;--mmg-sky:#eaf1ff;--mmg-line:rgba(16,24,43,.12);--mmg-soft:#f5f7fb;--mmg-white:#fff;--mmg-radius:24px;--mmg-shadow:0 24px 70px rgba(28,48,92,.13)}
.mmg-canonical-homepage-section{margin:0!important}.mmg-home{background:var(--mmg-white);color:var(--mmg-ink);font-family:var(--font-body-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);overflow:hidden}.mmg-home *{box-sizing:border-box}.mmg-home a{text-decoration:none}.mmg-home h1,.mmg-home h2,.mmg-home h3,.mmg-home p{margin-top:0}.mmg-home h1,.mmg-home h2,.mmg-home h3{color:var(--mmg-ink);font-family:var(--font-heading-family,var(--font-body-family,system-ui));letter-spacing:-.035em}.mmg-home h1{font-size:clamp(3.2rem,8vw,7.2rem);line-height:.94;margin-bottom:1.7rem;max-width:9ch}.mmg-home h2{font-size:clamp(2.35rem,5vw,4.5rem);line-height:1.02;margin-bottom:1.35rem}.mmg-home h3{font-size:clamp(1.35rem,2vw,1.85rem);line-height:1.15;margin-bottom:.85rem}.mmg-home p{color:var(--mmg-muted);font-size:1.05rem;line-height:1.72}.mmg-shell{width:min(1180px,calc(100% - 40px));margin-inline:auto}.mmg-kicker{color:var(--mmg-blue)!important;font-size:.78rem!important;font-weight:800;letter-spacing:.16em;line-height:1.3!important;margin-bottom:1.2rem!important;text-transform:uppercase}.mmg-large-copy{font-size:clamp(1.15rem,2vw,1.45rem)!important;line-height:1.65!important}.mmg-home__rail{background:rgba(255,255,255,.93);border-bottom:1px solid var(--mmg-line);position:sticky;top:0;z-index:10;backdrop-filter:blur(16px)}.mmg-home__rail-inner{display:flex;gap:2rem;justify-content:center;margin:auto;max-width:1180px;overflow-x:auto;padding:.9rem 20px;scrollbar-width:none}.mmg-home__rail-inner::-webkit-scrollbar{display:none}.mmg-home__rail a{color:var(--mmg-muted);font-size:.8rem;font-weight:750;letter-spacing:.04em;white-space:nowrap}.mmg-home__rail a:hover,.mmg-home__rail a:focus-visible{color:var(--mmg-blue)}.mmg-hero{background:radial-gradient(circle at 78% 22%,rgba(39,103,255,.17),transparent 34%),linear-gradient(180deg,#fff 0%,#f6f9ff 100%);padding:clamp(5rem,9vw,8rem) 0 2.2rem}.mmg-hero__grid{align-items:center;display:grid;gap:clamp(3rem,6vw,6rem);grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr)}.mmg-hero__lead{color:var(--mmg-ink)!important;font-size:clamp(1.25rem,2.5vw,1.75rem)!important;line-height:1.5!important;max-width:700px}.mmg-hero__support{max-width:700px}.mmg-actions{display:flex;flex-wrap:wrap;gap:.85rem;margin-top:2rem}.mmg-button{align-items:center;border:1px solid transparent;border-radius:999px;display:inline-flex;font-size:.94rem;font-weight:800;justify-content:center;min-height:52px;padding:.78rem 1.35rem;transition:transform .2s ease,box-shadow .2s ease,background .2s ease,color .2s ease}.mmg-button:hover{transform:translateY(-2px)}.mmg-button:focus-visible,.mmg-home a:focus-visible,.mmg-home summary:focus-visible{outline:3px solid rgba(39,103,255,.4);outline-offset:4px}.mmg-button--primary{background:var(--mmg-blue);box-shadow:0 14px 32px rgba(39,103,255,.25);color:#fff}.mmg-button--primary:hover{background:var(--mmg-blue-dark);color:#fff}.mmg-button--secondary{border-color:var(--mmg-line);color:var(--mmg-ink);background:#fff}.mmg-button--light{background:#fff;color:var(--mmg-blue-dark)}.mmg-button--ghost-light{border-color:rgba(255,255,255,.42);color:#fff}.mmg-hero__panel{background:rgba(255,255,255,.82);border:1px solid rgba(39,103,255,.12);border-radius:32px;box-shadow:var(--mmg-shadow);padding:2rem;backdrop-filter:blur(18px)}.mmg-hero__panel-label{color:var(--mmg-ink)!important;font-size:.82rem!important;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.mmg-progress-list{display:grid;gap:1.1rem;list-style:none;margin:1.4rem 0 0;padding:0}.mmg-progress-list li{align-items:flex-start;display:grid;gap:1rem;grid-template-columns:44px 1fr;padding-top:1.1rem;border-top:1px solid var(--mmg-line)}.mmg-progress-list li>span{align-items:center;background:var(--mmg-sky);border-radius:50%;color:var(--mmg-blue);display:flex;font-size:.78rem;font-weight:850;height:44px;justify-content:center}.mmg-progress-list strong{display:block;font-size:1rem;margin-bottom:.35rem}.mmg-progress-list p{font-size:.9rem!important;line-height:1.55!important;margin-bottom:0}.mmg-capability-strip{display:grid;gap:1px;grid-template-columns:repeat(4,1fr);margin-top:clamp(4rem,7vw,6rem);overflow:hidden;border:1px solid var(--mmg-line);border-radius:18px;background:var(--mmg-line)}.mmg-capability-strip span{background:#fff;color:var(--mmg-muted);font-size:.8rem;font-weight:800;letter-spacing:.08em;padding:1.05rem;text-align:center;text-transform:uppercase}.mmg-section{padding:clamp(5rem,9vw,8.5rem) 0;scroll-margin-top:72px}.mmg-section--contrast{background:var(--mmg-ink)}.mmg-section--contrast h2,.mmg-section--contrast h3{color:#fff}.mmg-section--contrast p{color:#b9c4d8}.mmg-section--soft{background:var(--mmg-soft)}.mmg-section--bordered{border-top:1px solid var(--mmg-line)}.mmg-section-heading{max-width:780px;margin-bottom:3rem}.mmg-section-heading--center{text-align:center;margin-inline:auto}.mmg-split-heading{align-items:end;display:grid;gap:3rem;grid-template-columns:1.05fr .95fr;margin-bottom:3rem}.mmg-path-grid{display:grid;gap:1rem;grid-template-columns:repeat(3,minmax(0,1fr))}.mmg-path-card{background:#fff;border:1px solid var(--mmg-line);border-radius:var(--mmg-radius);color:inherit;display:flex;flex-direction:column;min-height:330px;padding:1.7rem;position:relative;transition:border .2s ease,box-shadow .2s ease,transform .2s ease}.mmg-path-card:hover{border-color:rgba(39,103,255,.35);box-shadow:0 18px 44px rgba(27,48,90,.1);transform:translateY(-5px)}.mmg-path-card__number{color:var(--mmg-blue);font-size:.78rem;font-weight:850;letter-spacing:.14em;margin-bottom:auto}.mmg-path-card p{font-size:.96rem}.mmg-card-link{color:var(--mmg-blue);display:inline-flex;font-size:.9rem;font-weight:800;gap:.45rem;margin-top:auto}.mmg-feature-grid{display:grid;gap:1rem;grid-template-columns:1.2fr 1fr 1fr}.mmg-feature-card{background:#fff;border-radius:var(--mmg-radius);display:flex;flex-direction:column;min-height:360px;padding:2rem}.mmg-feature-card p{font-size:.96rem}.mmg-feature-card .mmg-card-link,.mmg-feature-card .mmg-button{margin-top:auto;align-self:flex-start}.mmg-feature-card--primary{background:linear-gradient(145deg,var(--mmg-blue),#143c9c);box-shadow:0 26px 60px rgba(7,22,57,.3)}.mmg-feature-card--primary h3,.mmg-feature-card--primary p{color:#fff!important}.mmg-card-tag{color:var(--mmg-blue)!important;font-size:.74rem!important;font-weight:850;letter-spacing:.13em;text-transform:uppercase}.mmg-feature-card--primary .mmg-card-tag{color:#cbdcff!important}.mmg-service-grid{display:grid;gap:1rem;grid-template-columns:repeat(3,1fr)}.mmg-service-card{border-top:1px solid var(--mmg-line);padding:2rem 1rem 1rem 0}.mmg-service-card__icon{align-items:center;background:var(--mmg-sky);border-radius:16px;color:var(--mmg-blue);display:flex;font-size:1.1rem;font-weight:900;height:52px;justify-content:center;margin-bottom:2rem;width:52px}.mmg-service-card a{color:var(--mmg-blue);font-size:.9rem;font-weight:800}.mmg-inline-cta{align-items:center;background:var(--mmg-soft);border-radius:var(--mmg-radius);display:flex;gap:2rem;justify-content:space-between;margin-top:4rem;padding:2rem}.mmg-inline-cta h3{margin-bottom:0}.mmg-subscription-grid{align-items:center;display:grid;gap:clamp(3rem,7vw,7rem);grid-template-columns:1fr 1fr}.mmg-cadence-list{background:#fff;border:1px solid var(--mmg-line);border-radius:28px;box-shadow:0 20px 55px rgba(25,44,81,.08);padding:1.5rem}.mmg-cadence-list article{display:grid;gap:1rem;grid-template-columns:110px 1fr;padding:1.2rem;border-bottom:1px solid var(--mmg-line)}.mmg-cadence-list article span{color:var(--mmg-ink);font-weight:850}.mmg-cadence-list article p{font-size:.92rem;margin:0}.mmg-cadence-note{font-size:.83rem!important;line-height:1.5!important;margin:1.3rem .9rem .4rem!important}.mmg-kairos{background:radial-gradient(circle at 22% 44%,rgba(70,123,255,.18),transparent 29%),#0c1428}.mmg-kairos h2,.mmg-kairos strong{color:#fff}.mmg-kairos p{color:#b8c4dc}.mmg-kairos__grid{align-items:center;display:grid;gap:clamp(3rem,8vw,8rem);grid-template-columns:.75fr 1.25fr}.mmg-kairos__mark{aspect-ratio:1;background:linear-gradient(145deg,rgba(47,108,255,.2),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.12);border-radius:40%;box-shadow:0 30px 100px rgba(0,0,0,.35);display:grid;place-items:center;position:relative}.mmg-kairos__mark span{color:#fff;font-size:clamp(5rem,14vw,10rem);font-weight:900;letter-spacing:-.08em}.mmg-kairos__mark i{border:1px solid rgba(96,146,255,.45);border-radius:50%;inset:12%;position:absolute}.mmg-check-list{display:grid;gap:.85rem;list-style:none;margin:2rem 0;padding:0}.mmg-check-list li{color:#e7edfb;padding-left:1.8rem;position:relative}.mmg-check-list li:before{color:#7aa3ff;content:"✓";font-weight:900;left:0;position:absolute}.mmg-moment{border-top:1px solid rgba(255,255,255,.15);color:#fff;padding-top:1.1rem}.mmg-moment summary{cursor:pointer;font-weight:800}.mmg-moment p{font-size:.95rem;margin:1rem 0 0}.mmg-mission-grid{display:grid;gap:clamp(3rem,8vw,8rem);grid-template-columns:1fr 1fr}.mmg-faq-grid{display:grid;gap:clamp(3rem,8vw,8rem);grid-template-columns:.75fr 1.25fr}.mmg-faq-list{display:grid}.mmg-faq-list details{border-top:1px solid var(--mmg-line);padding:1.35rem 0}.mmg-faq-list details:last-child{border-bottom:1px solid var(--mmg-line)}.mmg-faq-list summary{color:var(--mmg-ink);cursor:pointer;font-size:1.05rem;font-weight:800;padding-right:2rem;position:relative}.mmg-faq-list summary:after{content:"+";position:absolute;right:.2rem}.mmg-faq-list details[open] summary:after{content:"−"}.mmg-faq-list details p{font-size:.96rem;margin:1rem 0 0;max-width:680px}.mmg-final{background:linear-gradient(135deg,#2868ff,#123583);padding:clamp(5rem,10vw,9rem) 0}.mmg-final__inner{text-align:center}.mmg-final h2,.mmg-final p{color:#fff}.mmg-final__inner>p:not(.mmg-kicker){font-size:clamp(1.1rem,2vw,1.35rem);margin-inline:auto;max-width:700px}.mmg-final .mmg-kicker{color:#d7e3ff!important}.mmg-actions--center{justify-content:center}.mmg-reveal{opacity:0;transform:translateY(18px);transition:opacity .65s ease,transform .65s ease}.mmg-reveal.is-visible{opacity:1;transform:none}@media (max-width:990px){.mmg-hero__grid,.mmg-subscription-grid,.mmg-kairos__grid,.mmg-mission-grid,.mmg-faq-grid{grid-template-columns:1fr}.mmg-hero__panel{max-width:680px}.mmg-kairos__mark{max-width:480px;width:100%;margin:auto}.mmg-path-grid{grid-template-columns:repeat(2,1fr)}.mmg-feature-grid{grid-template-columns:1fr 1fr}.mmg-feature-card--primary{grid-column:1/-1}.mmg-service-grid{grid-template-columns:1fr}.mmg-service-card{display:grid;grid-template-columns:70px 1fr}.mmg-service-card__icon{grid-row:1/4}.mmg-split-heading{grid-template-columns:1fr}.mmg-capability-strip{grid-template-columns:repeat(2,1fr)}}@media (max-width:640px){.mmg-shell{width:min(100% - 28px,1180px)}.mmg-home h1{font-size:clamp(3rem,16vw,4.6rem)}.mmg-home h2{font-size:clamp(2.2rem,11vw,3.2rem)}.mmg-home__rail-inner{justify-content:flex-start}.mmg-hero{padding-top:4rem}.mmg-path-grid,.mmg-feature-grid{grid-template-columns:1fr}.mmg-feature-card--primary{grid-column:auto}.mmg-path-card{min-height:290px}.mmg-inline-cta{align-items:flex-start;flex-direction:column}.mmg-cadence-list article{grid-template-columns:1fr;gap:.35rem}.mmg-capability-strip{grid-template-columns:1fr 1fr}.mmg-actions .mmg-button{width:100%}.mmg-service-card{display:block}.mmg-service-card__icon{margin-bottom:1.4rem}}@media (prefers-reduced-motion:reduce){.mmg-reveal{opacity:1;transform:none;transition:none}.mmg-button,.mmg-path-card{transition:none;scroll-behavior:auto}}`;

const JS_SOURCE = String.raw`(() => {
  const root = document.querySelector('[data-mmg-canonical-homepage]');
  if (!root || root.dataset.enhanced === 'true') return;
  root.dataset.enhanced = 'true';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveal = [...root.querySelectorAll('.mmg-reveal')];
  if (reducedMotion || !('IntersectionObserver' in window)) {
    reveal.forEach((element) => element.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveal.forEach((element) => observer.observe(element));
  }

  root.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = root.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  });
})();`;

export async function handleCanonicalHomepageBuild(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== BUILD_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  if (payload?.confirmation !== CONFIRMATION) {
    throw httpError(403, "canonical_homepage_confirmation_required", `Provide the exact staging confirmation phrase: ${CONFIRMATION}.`);
  }
  const mode = payload?.mode === "repair" ? "repair" : "build";
  const inspection = await inspectStagingSource(null, request, env, KAIROS_CANONICAL_HOMEPAGE_BUILD, MANAGED_FILES);
  const evidence = inspection?.evidence || {};
  validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);

  const beforeMap = new Map((evidence.files || []).map((file) => [file.filename, file]));
  const candidates = [
    { filename: TEMPLATE_FILE, content: TEMPLATE_SOURCE },
    { filename: SECTION_FILE, content: SECTION_SOURCE },
    { filename: CSS_FILE, content: CSS_SOURCE },
    { filename: JS_FILE, content: JS_SOURCE },
  ];

  const prepared = [];
  for (const candidate of candidates) {
    prepared.push({
      ...candidate,
      beforeSha256: beforeMap.get(candidate.filename)?.sha256 || null,
      afterSha256: await hashText(candidate.content),
      existedBefore: beforeMap.has(candidate.filename),
      beforeBytes: beforeMap.get(candidate.filename)?.bytes || 0,
      afterBytes: new TextEncoder().encode(candidate.content).length,
    });
  }

  await writeThemeFiles(env, evidence.stagingTheme.gid, prepared.map(({ filename, content }) => ({ filename, content })));

  try {
    const readBack = await inspectStagingSource(null, request, env, KAIROS_CANONICAL_HOMEPAGE_BUILD, MANAGED_FILES);
    const readBackMap = new Map((readBack?.evidence?.files || []).map((file) => [file.filename, file]));
    for (const candidate of prepared) {
      const actual = readBackMap.get(candidate.filename);
      if (!actual || actual.content !== candidate.content || actual.sha256 !== candidate.afterSha256) {
        throw httpError(502, "canonical_homepage_readback_mismatch", `Shopify did not preserve the canonical source for ${candidate.filename}.`);
      }
    }
  } catch (error) {
    await restorePreviousFiles(env, evidence.stagingTheme.gid, prepared, beforeMap);
    throw error;
  }

  const previewURL = stagingPreviewURL(env, evidence.stagingTheme.gid);
  return json({
    status: "completed",
    build: KAIROS_CANONICAL_HOMEPAGE_BUILD,
    mode,
    completedAt: new Date().toISOString(),
    summary: `Kairos ${mode === "repair" ? "repaired" : "installed"} the canonical MMG homepage bundle in the verified non-live Kairos Staging theme and confirmed exact Shopify read-back.`,
    preview: {
      url: previewURL,
      desktopURL: previewURL,
      mobileURL: previewURL,
      theme: evidence.stagingTheme,
    },
    production: {
      publishedTheme: evidence.mainTheme,
      publishedThemeChanged: false,
      publishAuthorized: false,
    },
    files: prepared.map(({ content, ...file }) => ({ ...file, changed: file.beforeSha256 !== file.afterSha256 })),
    verification: {
      exactReadBack: true,
      templateSections: ["mmg_canonical_homepage"],
      requiredSectionIDs: ["pathways", "resources", "services", "subscriptions", "kairos", "mission", "questions", "next-step"],
      singlePrimaryHeadingDesigned: true,
      responsiveStylesIncluded: true,
      interactionScriptIncluded: true,
      reducedMotionSupported: true,
    },
    safeguards: {
      stagingOnly: true,
      mainThemeMutation: false,
      externalInferenceAPIUsed: false,
      workersAIUsed: false,
      approvalTimeReconstructionUsed: false,
      rollbackOnReadBackFailure: true,
    },
  }, 200);
}

async function restorePreviousFiles(env, themeGid, prepared, beforeMap) {
  const restore = prepared
    .filter((file) => beforeMap.has(file.filename))
    .map((file) => ({ filename: file.filename, content: beforeMap.get(file.filename).content }));
  const remove = prepared.filter((file) => !beforeMap.has(file.filename)).map((file) => file.filename).filter((filename) => filename !== TEMPLATE_FILE);
  if (restore.length) await writeThemeFiles(env, themeGid, restore);
  if (remove.length) await deleteThemeFiles(env, themeGid, remove);
}

function validateThemeBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN" || String(stagingTheme.name || "").trim().toLowerCase() !== "kairos staging") {
    throw httpError(409, "verified_kairos_staging_required", "The canonical homepage can only be installed into the verified non-live Kairos Staging theme.");
  }
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN" || mainTheme.gid === stagingTheme.gid) {
    throw httpError(409, "main_theme_boundary_invalid", "The published MAIN theme boundary could not be verified.");
  }
}

function stagingPreviewURL(env, gid) {
  const origin = String(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com").replace(/\/+$/, "");
  const themeID = String(gid || "").split("/").pop();
  return themeID ? `${origin}/?preview_theme_id=${encodeURIComponent(themeID)}` : origin;
}

async function safeRequestJSON(request) {
  try { return await request.json(); }
  catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_CANONICAL_HOMEPAGE_BUILD,
      "X-Kairos-Staging-Only": "true",
      "X-Kairos-Workers-AI-Used": "false",
      "X-Kairos-Production-Publish": "false",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
