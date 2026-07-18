import {
  deleteThemeFiles,
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  semanticHash,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_CANONICAL_HOMEPAGE_BUILD = "kairos-canonical-homepage-builder-20260717-3";

const BUILD_PATH = "/api/shopify/staging/canonical-homepage/build";
const CONFIRMATION = "BUILD_CANONICAL_MMG_HOMEPAGE_STAGING";
const TEMPLATE_FILE = "templates/index.json";
const SECTION_FILE = "sections/mmg-canonical-homepage.liquid";
const CSS_FILE = "assets/mmg-canonical-homepage.css";
const JS_FILE = "assets/mmg-canonical-homepage.js";
const MANAGED_FILES = [TEMPLATE_FILE, SECTION_FILE, CSS_FILE, JS_FILE];
const READ_BACK_ATTEMPTS = 10;
const READ_BACK_DELAY_MS = 450;

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
  <header class="mmg-page-hero mmg-reveal" data-mmg-section="hero">
    <div class="mmg-shell">
      <a class="mmg-home-link" href="/" aria-label="Mindset Media Group home">
        Mindset Media Group™ <span>Books · AI · Business · Creator Education</span>
      </a>
      <div class="mmg-hero-copy">
        <p class="mmg-pill">A Guided Knowledge Ecosystem Powered by Kairos</p>
        <h1>Turn What You Know Into Work That Moves People Forward.</h1>
        <p class="mmg-hero-lead">Mindset Media Group™ helps creators, authors, educators, entrepreneurs, and small businesses transform ideas, experience, and expertise into books, digital products, stronger brands, and professional publishing assets.</p>
        <p class="mmg-hero-support">Start with the objective in front of you. Learn through practical resources, choose professional production support when the work is ready, and use Kairos to connect the right knowledge, workflow, and next action.</p>
        <div class="mmg-actions" aria-label="Primary homepage actions">
          <a class="mmg-button mmg-button--primary" href="#pathways">Start the Guided Path</a>
          <a class="mmg-button mmg-button--secondary" href="/pages/customer-portal">Open Customer Portal</a>
        </div>
      </div>
    </div>
  </header>

  <main>
    <section id="pathways" class="mmg-section mmg-reveal" data-mmg-section="pathways">
      <div class="mmg-shell">
        <div class="mmg-section-heading">
          <p class="mmg-pill">Start Learning Here</p>
          <h2>Discover. Learn. Create. Deliver.</h2>
          <p>MMG begins with education and moves into production when the project is ready. Every path is designed to reduce confusion, preserve visible progress, and move useful knowledge toward a finished result.</p>
        </div>

        <div class="mmg-card-grid mmg-card-grid--four">
          <article class="mmg-card">
            <span class="mmg-card-chip">01</span>
            <h3>Discover</h3>
            <p>Clarify the idea, audience, message, opportunity, and outcome before choosing a tool, product, or service.</p>
          </article>
          <article class="mmg-card">
            <span class="mmg-card-chip">02</span>
            <h3>Learn + Apply</h3>
            <p>Use books, AI guides, prompts, templates, and practical frameworks to turn knowledge into repeatable action.</p>
          </article>
          <article class="mmg-card">
            <span class="mmg-card-chip">03</span>
            <h3>Create</h3>
            <p>Build content, guides, books, products, brand assets, and systems around a clear objective.</p>
          </article>
          <article class="mmg-card">
            <span class="mmg-card-chip">04</span>
            <h3>Deliver</h3>
            <p>Move approved work through production, quality assurance, packaging, and secure customer delivery.</p>
          </article>
        </div>

        <div class="mmg-inline-banner">
          <div>
            <p class="mmg-pill">One Connected Path</p>
            <h3>Discover → Learn → Apply → Create → Approve → Deliver</h3>
          </div>
          <a class="mmg-button mmg-button--primary" href="/pages/free-creator-toolkit">Use the Free Toolkit</a>
        </div>
      </div>
    </section>

    <section id="services" class="mmg-section mmg-section--soft mmg-reveal" data-mmg-section="services">
      <div class="mmg-shell">
        <div class="mmg-section-heading">
          <p class="mmg-pill">When the Idea Becomes Real</p>
          <h2>Choose How You Want to Build.</h2>
          <p>Keep learning through books and digital tools, or bring a serious project into the MMG production system for intake, approval, editorial work, design, production, quality assurance, and dashboard delivery.</p>
        </div>

        <div class="mmg-card-grid mmg-card-grid--three">
          <a class="mmg-card mmg-card--link" href="/products/publish-ready-book-build-service">
            <span class="mmg-card-chip">Book Build</span>
            <h3>Publish-Ready Book Build</h3>
            <p>Turn an idea, notes, outline, or manuscript into a structured digital publishing project with a clear production specification and organized delivery package.</p>
            <span class="mmg-card-action">Explore this path <span aria-hidden="true">→</span></span>
          </a>
          <a class="mmg-card mmg-card--link" href="/products/professional-cover-design-service">
            <span class="mmg-card-chip">Cover Design</span>
            <h3>Professional Cover Design</h3>
            <p>Create a stronger first impression with focused visual direction and polished cover, product, and launch assets.</p>
            <span class="mmg-card-action">Explore this path <span aria-hidden="true">→</span></span>
          </a>
          <a class="mmg-card mmg-card--link" href="/pages/publishing-services">
            <span class="mmg-card-chip">Formatting</span>
            <h3>Digital Interior Formatting</h3>
            <p>Improve hierarchy, spacing, structure, and reader flow for Kindle-ready and MMG digital-download formats.</p>
            <span class="mmg-card-action">Explore this path <span aria-hidden="true">→</span></span>
          </a>
          <a class="mmg-card mmg-card--link" href="/pages/publishing-services">
            <span class="mmg-card-chip">Editorial</span>
            <h3>Editorial Enhancement</h3>
            <p>Strengthen clarity, flow, structure, tone, and reader value before design, formatting, metadata, and release.</p>
            <span class="mmg-card-action">Explore this path <span aria-hidden="true">→</span></span>
          </a>
          <a class="mmg-card mmg-card--link" href="/pages/publishing-services">
            <span class="mmg-card-chip">Optimization</span>
            <h3>Listing & Publishing Optimization</h3>
            <p>Improve titles, descriptions, metadata, positioning, and storefront language before launch or promotion.</p>
            <span class="mmg-card-action">Explore this path <span aria-hidden="true">→</span></span>
          </a>
          <a class="mmg-card mmg-card--link mmg-card--accent" href="/pages/publishing-services">
            <span class="mmg-card-chip">Publishing Services</span>
            <h3>See the Complete Production Framework</h3>
            <p>Review packages, optional upgrades, delivery standards, customer responsibilities, and the full MMG publishing workflow.</p>
            <span class="mmg-card-action">Explore publishing services <span aria-hidden="true">→</span></span>
          </a>
        </div>
      </div>
    </section>

    <section id="resources" class="mmg-section mmg-reveal" data-mmg-section="resources">
      <div class="mmg-shell">
        <div class="mmg-section-heading">
          <p class="mmg-pill">Learning Resources</p>
          <h2>Choose the Resource That Supports Your Stage.</h2>
          <p>MMG books, AI guides, creator tools, and digital downloads are built to help you understand the next action, apply what you learn, and keep moving through a connected journey.</p>
        </div>

        <div class="mmg-card-grid mmg-card-grid--three">
          <a class="mmg-card mmg-card--link" href="/collections/all">
            <span class="mmg-card-chip">Creator Strategy</span>
            <h3>The Creator’s Bible™</h3>
            <p>A practical reference for content strategy, audience growth, monetization, AI workflows, discipline, and long-term publishing execution.</p>
            <span class="mmg-card-action">View product <span aria-hidden="true">→</span></span>
          </a>
          <a class="mmg-card mmg-card--link" href="/collections/all">
            <span class="mmg-card-chip">AI Skills</span>
            <h3>AI Prompting for Beginners™</h3>
            <p>A direct starting point for using prompts in content ideas, writing, planning, research, creative work, and execution.</p>
            <span class="mmg-card-action">View product <span aria-hidden="true">→</span></span>
          </a>
          <a class="mmg-card mmg-card--link" href="/collections/all">
            <span class="mmg-card-chip">Mindset</span>
            <h3>The Failure Advantage™</h3>
            <p>A resilience-focused guide for converting setbacks, pressure, discipline, and lived experience into forward momentum.</p>
            <span class="mmg-card-action">View product <span aria-hidden="true">→</span></span>
          </a>
        </div>

        <div class="mmg-feature-panel">
          <div class="mmg-feature-panel__copy">
            <p class="mmg-pill">Free Creator Toolkit</p>
            <h2>Get a Useful System Before You Buy Anything.</h2>
            <p>The Free Creator Toolkit gives you practical prompts, hook ideas, editing direction, posting systems, caption frameworks, and a pre-publish checklist.</p>
            <div class="mmg-actions">
              <a class="mmg-button mmg-button--primary" href="/pages/free-creator-toolkit">Open the Free Creator Toolkit</a>
              <a class="mmg-button mmg-button--secondary" href="/pages/knowledge-library">Explore the Knowledge Library</a>
            </div>
          </div>
          <div class="mmg-mini-grid" aria-label="Free Creator Toolkit contents">
            <article><span>Prompts</span><p>Generate stronger ideas, scripts, captions, content angles, and plans.</p></article>
            <article><span>Hooks</span><p>Improve the first seconds with direct, curiosity-driven openings.</p></article>
            <article><span>Templates</span><p>Create faster with practical visual and editing direction.</p></article>
            <article><span>Checklist</span><p>Check the purpose, cover, hook, caption, and next action before publishing.</p></article>
          </div>
        </div>
      </div>
    </section>

    <section id="subscriptions" class="mmg-section mmg-section--soft mmg-reveal" data-mmg-section="subscriptions">
      <div class="mmg-shell">
        <div class="mmg-section-heading">
          <p class="mmg-pill">Connected Ecosystem</p>
          <h2>Every Path Connects to the Next One.</h2>
          <p>Books, AI guides, free tools, publishing services, customer dashboards, and personalized learning are connected parts of one experience—not isolated shelves.</p>
        </div>

        <div class="mmg-card-grid mmg-card-grid--three">
          <article class="mmg-card">
            <span class="mmg-card-chip">Creator Growth</span>
            <h3>Build Stronger Content Systems</h3>
            <p>Learn audience growth, hooks, publishing discipline, monetization, and repeatable creator workflows.</p>
          </article>
          <article class="mmg-card">
            <span class="mmg-card-chip">AI Skills</span>
            <h3>Use AI With Purpose</h3>
            <p>Make AI practical for writing, planning, ideation, research, creator workflows, and faster execution.</p>
          </article>
          <article class="mmg-card">
            <span class="mmg-card-chip">Personalized Learning</span>
            <h3>Keep Learning at Your Cadence</h3>
            <p>Choose weekly, bi-weekly, or monthly digital resource delivery aligned to your role, interests, and active objectives.</p>
          </article>
        </div>

        <div class="mmg-process">
          <div class="mmg-section-heading">
            <p class="mmg-pill">Production Pathway</p>
            <h2>A Clear Workflow for Serious Digital Projects.</h2>
          </div>
          <div class="mmg-process-grid">
            <article><span>Step 01</span><h3>Purchase Creates the Project</h3><p>A service order opens the customer and admin project records with onboarding, upload instructions, and visible progress.</p></article>
            <article><span>Step 02</span><h3>Upload, Validation & Greenlight</h3><p>Customer files are checked against project requirements before production begins.</p></article>
            <article><span>Step 03</span><h3>Approve the Specification</h3><p>Publishing projects receive a customer-facing production plan before manufacturing moves forward.</p></article>
            <article><span>Step 04</span><h3>Receive Dashboard Delivery</h3><p>Approved deliverables are organized in the customer dashboard with documentation, metadata, versions, and download access.</p></article>
          </div>
        </div>
      </div>
    </section>

    <section id="kairos" class="mmg-section mmg-reveal" data-mmg-section="kairos">
      <div class="mmg-shell">
        <div class="mmg-feature-panel mmg-feature-panel--kairos">
          <div class="mmg-kairos-mark" aria-hidden="true">K</div>
          <div class="mmg-feature-panel__copy">
            <p class="mmg-pill">Kairos</p>
            <h2>The Intelligence and Orchestration Layer Behind the Experience.</h2>
            <p>Describe the objective. Kairos connects the governing knowledge, customer context, tools, services, and workflows around that objective, identifies the strongest next action, and preserves progress through execution and delivery.</p>
            <div class="mmg-check-grid">
              <span>Objective-first guidance</span>
              <span>Connected project context</span>
              <span>Visible progress</span>
              <span>Approval-aware execution</span>
            </div>
            <a class="mmg-button mmg-button--primary" href="/pages/customer-portal">Enter the Customer Portal</a>
          </div>
        </div>
      </div>
    </section>

    <section id="mission" class="mmg-section mmg-section--soft mmg-reveal" data-mmg-section="mission">
      <div class="mmg-shell">
        <div class="mmg-section-heading">
          <p class="mmg-pill">Built From the Ground Up</p>
          <h2>Practical Work Becomes Practical Education.</h2>
          <p>Mindset Media Group™ is built on discipline, recovery, execution, faith, and the belief that knowledge becomes powerful when it helps someone take action.</p>
        </div>

        <div class="mmg-card-grid mmg-card-grid--three">
          <article class="mmg-card">
            <span class="mmg-card-chip">Experience</span>
            <h3>Real Work Shapes the System</h3>
            <p>MMG is informed by lived experience, technical thinking, daily publishing, and the discipline to keep improving.</p>
          </article>
          <article class="mmg-card">
            <span class="mmg-card-chip">Mission</span>
            <h3>Create Resources People Can Use</h3>
            <p>The objective is to help people learn faster, act with clarity, publish consistently, and turn knowledge into finished work.</p>
          </article>
          <article class="mmg-card">
            <span class="mmg-card-chip">Standard</span>
            <h3>Clear Systems Over Noise</h3>
            <p>Products and services are organized around practical structure, quality gates, dashboard visibility, and professional deliverables.</p>
          </article>
        </div>

        <div class="mmg-inline-banner">
          <div>
            <p class="mmg-pill">Our Operating Belief</p>
            <h3>We’re Not Gatekeepers. We’re Door Openers.</h3>
            <p>Knowledge grows when it is shared. Opportunity grows when doors are opened.</p>
          </div>
          <a class="mmg-button mmg-button--primary" href="/pages/about-mindset-media-group">Read the MMG Story</a>
        </div>
      </div>
    </section>

    <section id="questions" class="mmg-section mmg-reveal" data-mmg-section="questions">
      <div class="mmg-shell mmg-faq-layout">
        <div class="mmg-section-heading">
          <p class="mmg-pill">Common Questions</p>
          <h2>Start With Clarity.</h2>
          <p>You do not need to know the internal system or memorize the right prompt. Begin with the objective and choose the next step that fits where you are.</p>
        </div>
        <div class="mmg-faq-list">
          <details>
            <summary>What can Mindset Media Group help me build?</summary>
            <p>Books, guides, digital products, publishing assets, creator systems, brand materials, educational resources, and other knowledge-based deliverables.</p>
          </details>
          <details>
            <summary>Do I need to know which product or service I need?</summary>
            <p>No. Start with what you want to accomplish. The ecosystem is structured to connect that objective to the most relevant resource, service, or guided pathway.</p>
          </details>
          <details>
            <summary>What happens after I purchase a publishing service?</summary>
            <p>Your order creates a project record, provides onboarding and upload instructions, and moves through validation, approval, production, quality assurance, and organized dashboard delivery.</p>
          </details>
          <details>
            <summary>How does Kairos fit into the experience?</summary>
            <p>Kairos is the coordination layer that organizes context, applies governing standards, identifies the next action, and supports visible execution across the MMG ecosystem.</p>
          </details>
        </div>
      </div>
    </section>

    <section id="next-step" class="mmg-section mmg-final mmg-reveal" data-mmg-section="next-step">
      <div class="mmg-shell mmg-final__inner">
        <p class="mmg-pill">Mindset Media Group™</p>
        <h2>Choose Your Next Step.</h2>
        <p>Start with the guided library, use the free toolkit, open your customer dashboard, or begin a digital publishing project when the work is ready for professional production.</p>
        <div class="mmg-actions mmg-actions--center">
          <a class="mmg-button mmg-button--primary" href="/pages/knowledge-library">Explore the Knowledge Library</a>
          <a class="mmg-button mmg-button--secondary" href="/pages/publishing-services">Start a Publishing Project</a>
        </div>
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

const CSS_SOURCE = String.raw`:root{--mmg-ink:#172033;--mmg-muted:#5e6879;--mmg-blue:#2f66f5;--mmg-blue-dark:#1f4fce;--mmg-blue-soft:#edf3ff;--mmg-line:#dfe5ef;--mmg-soft:#f7f9fc;--mmg-white:#fff;--mmg-radius:28px;--mmg-shadow:0 18px 50px rgba(31,55,96,.09)}
.mmg-canonical-homepage-section{margin:0!important}.mmg-home{background:var(--mmg-white);color:var(--mmg-ink);font-family:var(--font-body-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);overflow:hidden}.mmg-home *{box-sizing:border-box}.mmg-home a{text-decoration:none}.mmg-home h1,.mmg-home h2,.mmg-home h3,.mmg-home p{margin-top:0}.mmg-home h1,.mmg-home h2,.mmg-home h3{color:var(--mmg-ink);font-family:var(--font-heading-family,var(--font-body-family,system-ui));letter-spacing:-.035em}.mmg-home h1{font-size:clamp(3rem,6.6vw,6rem);line-height:.98;margin-bottom:1.55rem;max-width:1000px}.mmg-home h2{font-size:clamp(2.35rem,4.8vw,4.35rem);line-height:1.02;margin-bottom:1.25rem;max-width:920px}.mmg-home h3{font-size:clamp(1.35rem,2vw,1.82rem);line-height:1.16;margin-bottom:.9rem}.mmg-home p{color:var(--mmg-muted);font-size:1.04rem;line-height:1.72}.mmg-shell{width:min(1180px,calc(100% - 40px));margin-inline:auto}.mmg-page-hero{background:linear-gradient(180deg,#fff 0%,#f8faff 100%);border-bottom:1px solid var(--mmg-line);padding:clamp(2rem,4vw,3.5rem) 0 clamp(5rem,9vw,8.2rem)}.mmg-home-link{align-items:center;color:var(--mmg-ink);display:inline-flex;flex-wrap:wrap;font-size:.85rem;font-weight:850;gap:.5rem;letter-spacing:.02em;margin-bottom:clamp(4rem,8vw,7rem)}.mmg-home-link span{color:var(--mmg-muted);font-weight:650}.mmg-hero-copy{max-width:1020px}.mmg-pill{align-items:center;background:var(--mmg-blue-soft);border:1px solid rgba(47,102,245,.14);border-radius:999px;color:var(--mmg-blue)!important;display:inline-flex;font-size:.76rem!important;font-weight:850;letter-spacing:.12em;line-height:1.25!important;margin-bottom:1.35rem!important;padding:.65rem .95rem;text-transform:uppercase}.mmg-hero-lead{color:var(--mmg-ink)!important;font-size:clamp(1.25rem,2.3vw,1.65rem)!important;line-height:1.52!important;max-width:900px}.mmg-hero-support{max-width:850px}.mmg-actions{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:2rem}.mmg-button{align-items:center;border:1px solid transparent;border-radius:999px;display:inline-flex;font-size:.92rem;font-weight:850;justify-content:center;min-height:52px;padding:.8rem 1.35rem;transition:background .2s ease,border-color .2s ease,box-shadow .2s ease,color .2s ease,transform .2s ease}.mmg-button:hover{transform:translateY(-2px)}.mmg-button:focus-visible,.mmg-home a:focus-visible,.mmg-home summary:focus-visible{outline:3px solid rgba(47,102,245,.34);outline-offset:4px}.mmg-button--primary{background:var(--mmg-blue);box-shadow:0 12px 28px rgba(47,102,245,.22);color:#fff}.mmg-button--primary:hover{background:var(--mmg-blue-dark);color:#fff}.mmg-button--secondary{background:#fff;border-color:var(--mmg-line);color:var(--mmg-ink)}.mmg-button--secondary:hover{border-color:#c5cedc;color:var(--mmg-blue-dark)}.mmg-section{padding:clamp(5rem,9vw,8rem) 0;scroll-margin-top:32px}.mmg-section--soft{background:var(--mmg-soft);border-bottom:1px solid var(--mmg-line);border-top:1px solid var(--mmg-line)}.mmg-section-heading{max-width:850px;margin-bottom:3rem}.mmg-card-grid{display:grid;gap:1rem}.mmg-card-grid--four{grid-template-columns:repeat(4,minmax(0,1fr))}.mmg-card-grid--three{grid-template-columns:repeat(3,minmax(0,1fr))}.mmg-card{background:#fff;border:1px solid var(--mmg-line);border-radius:var(--mmg-radius);display:flex;flex-direction:column;min-height:285px;padding:1.7rem;box-shadow:0 1px 0 rgba(17,34,63,.02);transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}.mmg-card--link{color:inherit}.mmg-card--link:hover{border-color:rgba(47,102,245,.35);box-shadow:var(--mmg-shadow);transform:translateY(-4px)}.mmg-card--accent{background:linear-gradient(145deg,#f5f8ff,#fff)}.mmg-card-chip{align-items:center;align-self:flex-start;background:var(--mmg-blue-soft);border-radius:999px;color:var(--mmg-blue);display:inline-flex;font-size:.72rem;font-weight:850;letter-spacing:.08em;margin-bottom:auto;min-height:32px;padding:.45rem .7rem;text-transform:uppercase}.mmg-card h3{margin-top:2.5rem}.mmg-card p{font-size:.95rem;line-height:1.65}.mmg-card-action{color:var(--mmg-blue);font-size:.9rem;font-weight:850;margin-top:auto;padding-top:1.2rem}.mmg-inline-banner{align-items:center;background:#fff;border:1px solid var(--mmg-line);border-radius:var(--mmg-radius);display:flex;gap:2rem;justify-content:space-between;margin-top:1rem;padding:2rem}.mmg-inline-banner h3{margin-bottom:.4rem}.mmg-inline-banner p:last-child{margin-bottom:0}.mmg-feature-panel{align-items:center;background:linear-gradient(145deg,#f7f9ff,#fff);border:1px solid var(--mmg-line);border-radius:32px;display:grid;gap:clamp(2.5rem,6vw,6rem);grid-template-columns:1.05fr .95fr;margin-top:1rem;padding:clamp(1.6rem,4vw,3.4rem)}.mmg-feature-panel__copy{max-width:650px}.mmg-mini-grid{display:grid;gap:.8rem;grid-template-columns:1fr 1fr}.mmg-mini-grid article{background:#fff;border:1px solid var(--mmg-line);border-radius:20px;min-height:170px;padding:1.25rem}.mmg-mini-grid span{color:var(--mmg-ink);display:block;font-size:.9rem;font-weight:850;margin-bottom:.65rem}.mmg-mini-grid p{font-size:.88rem;line-height:1.55;margin-bottom:0}.mmg-process{margin-top:clamp(5rem,9vw,8rem)}.mmg-process-grid{display:grid;gap:1rem;grid-template-columns:repeat(4,minmax(0,1fr))}.mmg-process-grid article{background:#fff;border:1px solid var(--mmg-line);border-radius:22px;padding:1.45rem}.mmg-process-grid article>span{color:var(--mmg-blue);display:block;font-size:.72rem;font-weight:850;letter-spacing:.1em;margin-bottom:1.5rem;text-transform:uppercase}.mmg-process-grid h3{font-size:1.25rem}.mmg-process-grid p{font-size:.9rem;line-height:1.58;margin-bottom:0}.mmg-feature-panel--kairos{background:linear-gradient(145deg,#eff4ff,#fff);grid-template-columns:.6fr 1.4fr}.mmg-kairos-mark{align-items:center;aspect-ratio:1;background:linear-gradient(145deg,var(--mmg-blue),#143b9f);border-radius:32%;box-shadow:0 24px 60px rgba(47,102,245,.22);color:#fff;display:flex;font-size:clamp(5rem,12vw,9rem);font-weight:900;justify-content:center;letter-spacing:-.08em;max-width:360px;width:100%}.mmg-check-grid{display:grid;gap:.7rem;grid-template-columns:1fr 1fr;margin:1.8rem 0}.mmg-check-grid span{background:#fff;border:1px solid var(--mmg-line);border-radius:999px;color:var(--mmg-ink);font-size:.85rem;font-weight:750;padding:.7rem .9rem}.mmg-check-grid span:before{color:var(--mmg-blue);content:"✓";font-weight:900;margin-right:.5rem}.mmg-faq-layout{display:grid;gap:clamp(3rem,7vw,7rem);grid-template-columns:.8fr 1.2fr}.mmg-faq-list{display:grid}.mmg-faq-list details{border-top:1px solid var(--mmg-line);padding:1.3rem 0}.mmg-faq-list details:last-child{border-bottom:1px solid var(--mmg-line)}.mmg-faq-list summary{color:var(--mmg-ink);cursor:pointer;font-size:1.04rem;font-weight:850;padding-right:2rem;position:relative}.mmg-faq-list summary:after{content:"+";position:absolute;right:.2rem}.mmg-faq-list details[open] summary:after{content:"−"}.mmg-faq-list details p{font-size:.95rem;margin:1rem 0 0;max-width:680px}.mmg-final{background:linear-gradient(180deg,#f8faff,#fff);border-top:1px solid var(--mmg-line);text-align:center}.mmg-final__inner{max-width:900px}.mmg-final__inner .mmg-pill{justify-content:center}.mmg-final__inner h2{margin-inline:auto}.mmg-final__inner>p:not(.mmg-pill){font-size:clamp(1.1rem,2vw,1.32rem);margin-inline:auto;max-width:740px}.mmg-actions--center{justify-content:center}.mmg-reveal{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}.mmg-reveal.is-visible{opacity:1;transform:none}@media(max-width:1020px){.mmg-card-grid--four,.mmg-process-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mmg-card-grid--three{grid-template-columns:repeat(2,minmax(0,1fr))}.mmg-card-grid--three>.mmg-card:last-child:nth-child(odd){grid-column:1/-1}.mmg-feature-panel,.mmg-feature-panel--kairos,.mmg-faq-layout{grid-template-columns:1fr}.mmg-kairos-mark{margin:auto}.mmg-inline-banner{align-items:flex-start;flex-direction:column}}@media(max-width:680px){.mmg-shell{width:min(100% - 28px,1180px)}.mmg-page-hero{padding-top:1.5rem}.mmg-home-link{align-items:flex-start;flex-direction:column;margin-bottom:4rem}.mmg-home h1{font-size:clamp(2.75rem,14vw,4.25rem)}.mmg-home h2{font-size:clamp(2.15rem,11vw,3.2rem)}.mmg-card-grid--four,.mmg-card-grid--three,.mmg-process-grid,.mmg-mini-grid{grid-template-columns:1fr}.mmg-card-grid--three>.mmg-card:last-child:nth-child(odd){grid-column:auto}.mmg-card{min-height:260px}.mmg-feature-panel{padding:1.25rem}.mmg-check-grid{grid-template-columns:1fr}.mmg-actions .mmg-button{width:100%}.mmg-inline-banner{padding:1.5rem}}@media(prefers-reduced-motion:reduce){.mmg-reveal{opacity:1;transform:none;transition:none}.mmg-button,.mmg-card{transition:none}}`;

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
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
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
    const readBack = await waitForCanonicalReadBack(request, env, prepared);
    const readBackMap = new Map((readBack?.evidence?.files || []).map((file) => [file.filename, file]));
    for (const candidate of prepared) {
      const actual = readBackMap.get(candidate.filename);
      if (!actual) {
        throw httpError(502, "canonical_homepage_readback_missing", `Shopify returned no read-back source for ${candidate.filename}.`);
      }

      if (candidate.filename === TEMPLATE_FILE) {
        let expectedDocument;
        let actualDocument;
        try {
          expectedDocument = parseShopifyJson(candidate.content);
          actualDocument = parseShopifyJson(actual.content);
        } catch {
          throw httpError(502, "canonical_homepage_template_json_invalid", "Shopify returned an invalid canonical homepage JSON template.");
        }
        const expectedSemanticSha256 = await semanticHash(expectedDocument);
        const actualSemanticSha256 = await semanticHash(actualDocument);
        if (actualSemanticSha256 !== expectedSemanticSha256) {
          throw httpError(502, "canonical_homepage_template_semantic_mismatch", "Shopify changed the canonical homepage template structure during write-back.");
        }
        candidate.expectedSourceSha256 = candidate.afterSha256;
        candidate.afterSha256 = actual.sha256;
        candidate.afterBytes = actual.bytes;
        candidate.semanticSha256 = actualSemanticSha256;
        candidate.readBackVerification = "semantic-json";
        continue;
      }

      if (actual.content !== candidate.content || actual.sha256 !== candidate.afterSha256) {
        throw httpError(502, "canonical_homepage_readback_mismatch", `Shopify did not preserve the canonical source for ${candidate.filename}.`);
      }
      candidate.afterSha256 = actual.sha256;
      candidate.afterBytes = actual.bytes;
      candidate.readBackVerification = "exact-bytes";
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
    summary: `Kairos ${mode === "repair" ? "repaired" : "installed"} the publishing-services-derived MMG homepage framework in the verified non-live Kairos Staging theme and confirmed semantic JSON read-back for the template and exact byte read-back for Liquid, CSS, and JavaScript.`,
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
      templateReadBack: "semantic-json",
      exactByteReadBackFiles: [SECTION_FILE, CSS_FILE, JS_FILE],
      templateSections: ["mmg_canonical_homepage"],
      requiredSectionIDs: ["pathways", "resources", "services", "subscriptions", "kairos", "mission", "questions", "next-step"],
      singlePrimaryHeadingDesigned: true,
      responsiveStylesIncluded: true,
      interactionScriptIncluded: true,
      reducedMotionSupported: true,
      publishingServicesFrameworkApplied: true,
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

async function waitForCanonicalReadBack(request, env, prepared) {
  let lastError = null;
  let lastObserved = [];
  for (let attempt = 1; attempt <= READ_BACK_ATTEMPTS; attempt += 1) {
    try {
      const readBack = await inspectStagingSource(null, request, env, KAIROS_CANONICAL_HOMEPAGE_BUILD, MANAGED_FILES);
      const readBackMap = new Map((readBack?.evidence?.files || []).map((file) => [file.filename, file]));
      const observed = [];
      let matched = true;
      for (const candidate of prepared) {
        const actual = readBackMap.get(candidate.filename);
        if (!actual) {
          matched = false;
          observed.push(`${candidate.filename}:missing`);
          break;
        }
        if (candidate.filename === TEMPLATE_FILE) {
          const expectedDocument = parseShopifyJson(candidate.content);
          const actualDocument = parseShopifyJson(actual.content);
          const expectedSemanticSha256 = await semanticHash(expectedDocument);
          const actualSemanticSha256 = await semanticHash(actualDocument);
          observed.push(`${candidate.filename}:${actualSemanticSha256}`);
          if (actualSemanticSha256 !== expectedSemanticSha256) {
            matched = false;
            break;
          }
          continue;
        }
        observed.push(`${candidate.filename}:${actual.sha256}`);
        if (actual.content !== candidate.content || actual.sha256 !== candidate.afterSha256) {
          matched = false;
          break;
        }
      }
      lastObserved = observed;
      if (matched) return readBack;
    } catch (error) {
      lastError = error;
    }
    if (attempt < READ_BACK_ATTEMPTS) await delay(READ_BACK_DELAY_MS);
  }
  const detail = lastError instanceof Error ? ` Last read error: ${lastError.message}` : '';
  throw httpError(502, 'canonical_homepage_readback_mismatch', `Shopify did not expose the current canonical homepage revision after ${READ_BACK_ATTEMPTS} read-back attempts. Observed ${lastObserved.join(', ') || 'no readable files'}.${detail}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
