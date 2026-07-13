export const KAIROS_CANONICAL_HOMEPAGE_VERSION = "kairos-canonical-homepage-v1";
export const CANONICAL_HOMEPAGE_SECTION_TYPE = "mmg-canonical-homepage";
export const CANONICAL_HOMEPAGE_SECTION_FILE = "sections/mmg-canonical-homepage.liquid";
export const CANONICAL_HOMEPAGE_CSS_FILE = "assets/mmg-canonical-homepage.css";
export const CANONICAL_HOMEPAGE_TEMPLATE_FILE = "templates/index.json";
export const CANONICAL_HOMEPAGE_FILENAMES = Object.freeze([
  CANONICAL_HOMEPAGE_TEMPLATE_FILE,
  CANONICAL_HOMEPAGE_SECTION_FILE,
  CANONICAL_HOMEPAGE_CSS_FILE,
]);

export const CANONICAL_HOMEPAGE_SECTION_SOURCE = String.raw`
{{ 'mmg-canonical-homepage.css' | asset_url | stylesheet_tag }}

{% liquid
  assign library_url = section.settings.library_url | default: '/pages/knowledge-library'
  assign toolkit_url = section.settings.toolkit_url | default: '/pages/free-creator-toolkit'
  assign publishing_url = section.settings.publishing_url | default: '/pages/publishing-services'
  assign kairos_url = section.settings.kairos_url | default: 'https://mmg-ios.info-mindsetmediagroup.workers.dev'
  assign tiktok_url = section.settings.tiktok_url | default: 'https://www.tiktok.com/@mindset.media.group'
%}

<div class="mmg-home" id="mmg-home-{{ section.id }}">
  <section class="mmg-hero" aria-labelledby="mmg-home-title-{{ section.id }}">
    <div class="mmg-hero__copy">
      <p class="mmg-kicker"><span></span> Mindset Media Group × Kairos</p>
      <h1 id="mmg-home-title-{{ section.id }}">Your knowledge<br>has <em>value.</em></h1>
      <p class="mmg-hero__promise">Discover it. Build it. Share it with the world.</p>
      <p class="mmg-lede">MMG helps creators, authors, entrepreneurs, and everyday builders turn experience and ideas into books, digital resources, practical systems, and long-term assets. Kairos keeps the work organized and guides the next action.</p>
      <div class="mmg-actions">
        <a class="mmg-button mmg-button--primary" href="#mmg-path-{{ section.id }}">Find your path <span aria-hidden="true">↓</span></a>
        <a class="mmg-button" href="{{ toolkit_url }}">Start free <span aria-hidden="true">↗</span></a>
      </div>
      <div class="mmg-trust" aria-label="MMG operating principles"><span>✓ Practical guidance</span><span>✓ Professional production</span><span>✓ Clear next steps</span></div>
    </div>
    <div class="mmg-system" aria-label="Kairos knowledge-to-asset workflow">
      <div class="mmg-system__head"><span>Kairos operating path</span><b>Live system</b></div>
      <div class="mmg-system__core">
        <i class="mmg-orbit mmg-orbit--one"></i><i class="mmg-orbit mmg-orbit--two"></i>
        <div class="mmg-core"><span>K</span><small>Kairos</small></div>
        <article class="mmg-node mmg-node--one"><small>Input</small><strong>Your idea</strong></article>
        <article class="mmg-node mmg-node--two"><small>Context</small><strong>Your knowledge</strong></article>
        <article class="mmg-node mmg-node--three"><small>Output</small><strong>A finished asset</strong></article>
      </div>
      <div class="mmg-system__foot"><span>Idea</span><b>→</b><span>Structure</span><b>→</b><span>Execution</span><b>→</b><span>Delivery</span></div>
    </div>
  </section>

  <section class="mmg-section mmg-path" id="mmg-path-{{ section.id }}">
    <div class="mmg-intro"><p class="mmg-kicker">The guided path</p><h2>Start where you are.<br><span>Build what comes next.</span></h2><p>You do not need the entire future mapped out. Choose the stage that matches your work today, then move through a connected system.</p></div>
    <div class="mmg-path__grid">
      <article><small>01</small><i>◇</i><h3>Discover</h3><p>Find the knowledge, experience, or idea worth developing before choosing a product or platform.</p></article>
      <article><small>02</small><i>⌘</i><h3>Build</h3><p>Turn scattered insight into a useful system, message, manuscript, resource, or offer.</p></article>
      <article><small>03</small><i>□</i><h3>Publish</h3><p>Move finished work through disciplined production, quality review, and professional delivery.</p></article>
      <article><small>04</small><i>↗</i><h3>Grow</h3><p>Learn from real response, strengthen what works, and compound value through consistent execution.</p></article>
    </div>
  </section>

  <section class="mmg-section mmg-build">
    <div class="mmg-heading"><div><p class="mmg-kicker">Choose what you want to build</p><h2>One ecosystem.<br>Multiple ways forward.</h2></div><p>Every pathway combines education, practical tools, and production support so the next step connects to the larger body of work.</p></div>
    <div class="mmg-build__grid">
      <a class="mmg-build-card mmg-build-card--dark" href="{{ publishing_url }}"><div><b>BK</b><small>01</small></div><span>Books + Publishing</span><h3>Turn expertise into a finished publication.</h3><p>Develop the idea, shape the manuscript, manufacture the files, and prepare the work for release.</p><strong>Explore publishing ↗</strong></a>
      <a class="mmg-build-card" href="/collections/all"><div><b>AI</b><small>02</small></div><span>Practical AI</span><h3>Use AI with purpose and judgment.</h3><p>Learn prompt systems and responsible workflows for writing, research, planning, and production.</p><strong>Browse AI guides ↗</strong></a>
      <a class="mmg-build-card" href="{{ toolkit_url }}"><div><b>CR</b><small>03</small></div><span>Creator Growth</span><h3>Build a repeatable publishing practice.</h3><p>Strengthen hooks, content systems, audience trust, creator discipline, and measurable improvement.</p><strong>Open creator tools ↗</strong></a>
      <a class="mmg-build-card" href="{{ library_url }}"><div><b>BS</b><small>04</small></div><span>Business Systems</span><h3>Package knowledge into useful assets.</h3><p>Connect your message, products, services, customer journey, and long-term body of work.</p><strong>Enter the library ↗</strong></a>
    </div>
  </section>

  <section class="mmg-section mmg-learn">
    <div><p class="mmg-kicker">Learn before you scale</p><h2>Clear systems over noise.</h2><p>Books, guides, templates, and frameworks help you make better decisions before you spend more time, money, or attention.</p><a class="mmg-link" href="{{ library_url }}">Browse the Knowledge Library ↗</a></div>
    <div class="mmg-books" aria-label="MMG learning collection"><article><small>MMG</small><b>The Creator’s<br>Bible</b><span>Creator systems</span></article><article><small>MMG</small><b>AI Prompting<br>for Beginners</b><span>Practical AI</span></article><article><small>MMG</small><b>The Failure<br>Advantage</b><span>Mindset systems</span></article></div>
  </section>

  <section class="mmg-section mmg-toolkit">
    <div class="mmg-toolkit__visual"><div class="mmg-window"><div class="mmg-window__bar"><i></i><i></i><i></i><small>MMG FREE CREATOR TOOLKIT</small></div><div class="mmg-window__body"><p>Creator operating system</p><h3>Learn. Create.<br>Publish. Repeat.</h3><span></span><span></span><span></span><div><b>Prompts</b><b>Hooks</b><b>Templates</b><b>Checklist</b></div></div></div></div>
    <div class="mmg-toolkit__copy"><p class="mmg-kicker">Free creator toolkit</p><h2>Get a useful system before you buy anything.</h2><p>Start with practical resources for better ideas, stronger openings, faster creation, and more intentional publishing.</p><ul><li><span>✓</span><p><b>Prompts</b>Generate sharper hooks, scripts, captions, plans, and content angles.</p></li><li><span>✓</span><p><b>Hooks</b>Improve the first seconds with direct, curiosity-driven opening lines.</p></li><li><span>✓</span><p><b>Templates</b>Find practical CapCut direction for faster short-form production.</p></li><li><span>✓</span><p><b>Checklist</b>Review the cover, hook, caption, purpose, and next action before publishing.</p></li></ul><a class="mmg-button mmg-button--primary" href="{{ toolkit_url }}">Open the free toolkit ↗</a></div>
  </section>

  <section class="mmg-section mmg-ecosystem">
    <div class="mmg-intro mmg-intro--center"><p class="mmg-kicker">A connected knowledge ecosystem</p><h2>Every asset should lead<br>somewhere useful.</h2><p>MMG is designed as a connected journey—not a shelf of unrelated products.</p></div>
    <div class="mmg-ecosystem__grid"><a href="{{ library_url }}"><small>01</small><b>Learn</b><span>Books, guides, systems</span></a><a href="{{ toolkit_url }}"><small>02</small><b>Create</b><span>Prompts, hooks, tools</span></a><div class="mmg-ecosystem__core"><small>MMG</small><b>Knowledge<br>Ecosystem</b></div><a href="{{ publishing_url }}"><small>03</small><b>Publish</b><span>Books, covers, assets</span></a><a href="{{ kairos_url }}"><small>04</small><b>Execute</b><span>Guided by Kairos</span></a></div>
  </section>

  <section class="mmg-section mmg-production">
    <div class="mmg-heading"><div><p class="mmg-kicker">The production pathway</p><h2>From idea to finished asset.</h2></div><a class="mmg-button" href="{{ publishing_url }}">Explore publishing services ↗</a></div>
    <div class="mmg-production__grid"><article><small>01</small><h3>Choose</h3><p>Select the learning resource or production support that fits the project’s current stage.</p></article><article><small>02</small><h3>Guide</h3><p>Use the MMG Project Guide to capture the objective, files, context, and acceptance standard.</p></article><article><small>03</small><h3>Produce</h3><p>Move through planning, production, review, revision, quality assurance, and approval.</p></article><article><small>04</small><h3>Deliver</h3><p>Receive finished assets, production evidence, and a clear recommendation for what comes next.</p></article></div>
  </section>

  <section class="mmg-section mmg-road"><div><p class="mmg-kicker">Road to 1M</p><h2>Built in public.<br>One useful post at a time.</h2><p>MMG grows through daily publishing, practical testing, visible learning, and honest improvement. The journey becomes evidence that disciplined execution compounds.</p><a class="mmg-link" href="{{ tiktok_url }}">Follow the build on TikTok ↗</a></div><div class="mmg-meter"><header><span>Audience journey</span><b>In progress</b></header><strong>1M</strong><i><span></span></i><footer><span>Publish</span><span>Study</span><span>Improve</span><span>Compound</span></footer></div></section>

  <section class="mmg-section mmg-follow"><div class="mmg-intro"><p class="mmg-kicker">Continue through MMG</p><h2>Keep moving through<br>the system.</h2></div><div class="mmg-follow__grid"><a href="{{ tiktok_url }}"><i>♪</i><small>Daily build</small><h3>@mindset.media.group</h3><p>Creator education, practical AI, publishing, products, and lessons from the Road to 1M.</p><b>Follow on TikTok ↗</b></a><a href="{{ library_url }}"><i>⌑</i><small>Knowledge</small><h3>The MMG Library</h3><p>Books, guides, templates, digital downloads, and practical resources connected by purpose.</p><b>Browse resources ↗</b></a><a href="{{ publishing_url }}"><i>◇</i><small>Production</small><h3>Publishing Services</h3><p>Professional support for books, covers, interiors, editorial refinement, and release assets.</p><b>Start a project ↗</b></a></div></section>

  <section class="mmg-section mmg-founder"><div class="mmg-founder__mark"><span>MK</span><i></i></div><div><p class="mmg-kicker">Built from the ground up</p><blockquote>“Knowledge becomes powerful when it helps someone take action.”</blockquote><p>From professional Honda technician to creator, publisher, and builder, Michael King built MMG around discipline, recovery, execution, faith, and the conviction that practical experience deserves to become useful work.</p><a class="mmg-link" href="/pages/founder">Read the founder story ↗</a></div></section>

  <section class="mmg-section mmg-final"><p class="mmg-kicker">Choose your next step</p><h2>Your knowledge has value.<br><span>Build what comes next.</span></h2><p>Start with a free tool, explore the library, or bring a serious publishing project into production.</p><div class="mmg-actions"><a class="mmg-button mmg-button--primary" href="{{ toolkit_url }}">Start with the free toolkit ↗</a><a class="mmg-button" href="{{ publishing_url }}">Start a publishing project ↗</a></div></section>
</div>

{% schema %}
{
  "name": "MMG canonical homepage",
  "tag": "section",
  "class": "mmg-canonical-homepage-section",
  "settings": [
    { "type": "url", "id": "library_url", "label": "Knowledge Library link" },
    { "type": "url", "id": "toolkit_url", "label": "Free Toolkit link" },
    { "type": "url", "id": "publishing_url", "label": "Publishing Services link" },
    { "type": "url", "id": "kairos_url", "label": "Kairos link" },
    { "type": "url", "id": "tiktok_url", "label": "TikTok link" }
  ],
  "presets": [{ "name": "MMG canonical homepage" }]
}
{% endschema %}
`;

export const CANONICAL_HOMEPAGE_CSS_SOURCE = String.raw`
.mmg-home{--ink:#06111c;--paper:#f4f7f8;--muted:#607080;--line:#dbe3e8;--cyan:#47d7ff;--blue:#087fdd;color:var(--ink);background:var(--paper);font-family:Arial,Helvetica,sans-serif}.mmg-home *{box-sizing:border-box}.mmg-home a{color:inherit}.mmg-hero{min-height:760px;display:grid;grid-template-columns:1.02fr .98fr;align-items:center;gap:7vw;padding:90px clamp(24px,7vw,108px);overflow:hidden;background:var(--ink);color:#fff}.mmg-kicker{display:flex;align-items:center;gap:10px;margin:0 0 22px;color:#0870c7;font-size:11px;font-weight:850;letter-spacing:.2em;text-transform:uppercase}.mmg-hero .mmg-kicker{color:#86e5ff}.mmg-kicker>span{width:27px;height:1px;background:var(--cyan)}.mmg-hero h1{margin:0;font-size:clamp(58px,7.3vw,112px);line-height:.89;letter-spacing:-.075em}.mmg-hero h1 em{position:relative;color:#eafcff;font-style:normal}.mmg-hero h1 em:after{content:"";position:absolute;left:3px;right:-5px;bottom:-7px;height:5px;border-radius:10px;background:linear-gradient(90deg,var(--cyan),var(--blue))}.mmg-hero__promise{margin:30px 0 0;color:#c5e9f5;font-size:clamp(20px,2.1vw,30px);font-weight:700}.mmg-lede{max-width:680px;margin:20px 0 0;color:#99aab6;font-size:16px;line-height:1.75}.mmg-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.mmg-button{min-height:50px;display:inline-flex;align-items:center;justify-content:center;gap:12px;padding:0 20px;border:1px solid #315065;border-radius:12px;color:#d9e8f1!important;background:rgba(255,255,255,.035);font-size:12px;font-weight:820;text-decoration:none!important}.mmg-button--primary{border-color:transparent;background:linear-gradient(135deg,var(--cyan),#1099ed);color:#04101a!important}.mmg-trust{display:flex;flex-wrap:wrap;gap:20px;margin-top:28px;color:#718692;font-size:10px;font-weight:750;text-transform:uppercase}.mmg-trust span::first-letter{color:#63e0b2}.mmg-system{min-height:510px;overflow:hidden;border:1px solid rgba(91,196,241,.23);border-radius:32px;background:linear-gradient(145deg,rgba(15,41,59,.75),rgba(5,17,28,.9))}.mmg-system__head{height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;border-bottom:1px solid rgba(255,255,255,.08);color:#b8cbd6;font-size:10px;font-weight:800;text-transform:uppercase}.mmg-system__head b{color:#63e0b2}.mmg-system__core{position:relative;min-height:385px;display:grid;place-items:center}.mmg-orbit{position:absolute;border:1px solid rgba(71,215,255,.17);border-radius:50%}.mmg-orbit--one{width:270px;height:270px}.mmg-orbit--two{width:390px;height:390px;border-style:dashed}.mmg-core{z-index:2;width:130px;height:130px;display:grid;place-items:center;border:1px solid rgba(71,215,255,.5);border-radius:35px;background:#092235;transform:rotate(45deg)}.mmg-core span,.mmg-core small{transform:rotate(-45deg)}.mmg-core span{position:absolute;font-size:52px;font-weight:900}.mmg-core small{position:absolute;bottom:15px;color:#73dfff;font-size:8px;text-transform:uppercase}.mmg-node{position:absolute;width:142px;padding:13px;border:1px solid rgba(255,255,255,.1);border-radius:15px;background:#091e2d}.mmg-node small,.mmg-node strong{display:block}.mmg-node small{color:#608093;font-size:8px;text-transform:uppercase}.mmg-node strong{margin-top:5px;color:#dbeaf2;font-size:11px}.mmg-node--one{left:7%;top:13%}.mmg-node--two{right:5%;top:26%}.mmg-node--three{left:11%;bottom:11%}.mmg-system__foot{min-height:64px;display:flex;align-items:center;justify-content:center;gap:10px;border-top:1px solid rgba(255,255,255,.08);color:#748997;font-size:8px;text-transform:uppercase}.mmg-system__foot b{color:#2c789e}.mmg-section{padding:105px clamp(24px,7vw,108px)}.mmg-intro{max-width:680px}.mmg-intro--center{margin:auto;text-align:center}.mmg-intro--center .mmg-kicker{justify-content:center}.mmg-home h2{margin:0;font-size:clamp(40px,5vw,72px);line-height:.98;letter-spacing:-.055em}.mmg-intro h2 span,.mmg-final h2 span{color:#6f8290}.mmg-intro>p:last-child,.mmg-heading>p,.mmg-learn>div>p,.mmg-toolkit__copy>p,.mmg-road>div>p,.mmg-founder>div>p{color:var(--muted);font-size:15px;line-height:1.75}.mmg-path{background:#f8fafb}.mmg-path__grid{display:grid;grid-template-columns:repeat(4,1fr);margin-top:60px;border:1px solid var(--line);border-radius:28px;overflow:hidden}.mmg-path__grid article{min-height:275px;padding:25px;border-right:1px solid var(--line);background:#fff}.mmg-path__grid article:last-child{border:0}.mmg-path__grid small{color:#91a0aa}.mmg-path__grid i{width:54px;height:54px;display:grid;place-items:center;margin-top:34px;border:1px solid #c8e8f5;border-radius:16px;background:#f1fbff;color:var(--blue);font-style:normal;font-size:20px}.mmg-path__grid h3{margin:20px 0 10px;font-size:23px}.mmg-path__grid p{color:var(--muted);font-size:13px;line-height:1.7}.mmg-build{background:#fff}.mmg-heading{display:flex;align-items:end;justify-content:space-between;gap:45px}.mmg-heading>p{max-width:480px}.mmg-build__grid{display:grid;grid-template-columns:repeat(2,1fr);gap:15px;margin-top:60px}.mmg-build-card{min-height:390px;display:block;padding:30px;border:1px solid var(--line);border-radius:28px;background:#eefaff;text-decoration:none!important}.mmg-build-card:nth-child(3){background:#f2f8f6}.mmg-build-card:nth-child(4){background:#f7f5fb}.mmg-build-card--dark{background:var(--ink);color:#fff!important}.mmg-build-card>div{display:flex;justify-content:space-between}.mmg-build-card>div b{width:54px;height:54px;display:grid;place-items:center;border:1px solid rgba(8,127,221,.25);border-radius:17px;color:var(--blue)}.mmg-build-card--dark>div b{color:var(--cyan)}.mmg-build-card label{display:block;margin-top:50px;color:var(--blue);font-size:10px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}.mmg-build-card h3{max-width:480px;margin:12px 0;font-size:clamp(28px,3vw,42px);line-height:1.05;letter-spacing:-.045em}.mmg-build-card p{max-width:500px;color:#657783;font-size:13px;line-height:1.7}.mmg-build-card--dark p{color:#91a5b2}.mmg-build-card>strong{display:block;margin-top:25px;color:var(--blue);font-size:11px}.mmg-build-card--dark>strong{color:var(--cyan)}.mmg-learn{display:grid;grid-template-columns:.85fr 1.15fr;align-items:center;gap:65px;background:#edf2f4}.mmg-link{display:inline-block;margin-top:12px;color:#0069b8!important;font-size:12px;font-weight:850;text-decoration:none!important}.mmg-books{min-height:430px;position:relative}.mmg-books article{position:absolute;width:235px;height:340px;display:flex;flex-direction:column;justify-content:space-between;padding:27px;border-radius:6px 17px 17px 6px;color:#fff;box-shadow:-18px 30px 48px rgba(6,17,28,.17)}.mmg-books article:nth-child(1){z-index:3;left:5%;top:45px;background:linear-gradient(145deg,#06131f,#0a5f91);transform:rotate(-6deg)}.mmg-books article:nth-child(2){z-index:2;left:35%;top:16px;background:linear-gradient(145deg,#11345b,#158bc4);transform:rotate(2deg)}.mmg-books article:nth-child(3){z-index:1;left:63%;top:58px;background:linear-gradient(145deg,#1b1732,#6047a2);transform:rotate(8deg)}.mmg-books b{font-size:27px;line-height:1.03}.mmg-books small,.mmg-books span{font-size:9px;font-weight:800;text-transform:uppercase}.mmg-toolkit{display:grid;grid-template-columns:1.08fr .92fr;align-items:center;gap:75px;background:#fff}.mmg-toolkit__visual{min-height:510px;display:grid;place-items:center;border-radius:32px;background:var(--ink)}.mmg-window{width:82%;overflow:hidden;border:1px solid rgba(71,215,255,.3);border-radius:18px;background:#0b2030;transform:rotate(-2deg)}.mmg-window__bar{height:43px;display:flex;align-items:center;gap:6px;padding:0 14px;border-bottom:1px solid rgba(255,255,255,.08)}.mmg-window__bar i{width:7px;height:7px;border-radius:50%;background:#334b5a}.mmg-window__bar small{margin-left:auto;color:#628093;font-size:7px}.mmg-window__body{padding:36px}.mmg-window__body>p{color:var(--cyan);font-size:9px;font-weight:850;text-transform:uppercase}.mmg-window__body h3{margin:15px 0 25px;color:#fff;font-size:clamp(34px,4vw,58px);line-height:.95}.mmg-window__body>span{display:block;width:85%;height:5px;margin-top:7px;border-radius:10px;background:#18394d}.mmg-window__body>span:nth-of-type(2){width:70%}.mmg-window__body>div{display:flex;flex-wrap:wrap;gap:7px;margin-top:25px}.mmg-window__body>div b{padding:8px;border:1px solid #22516b;border-radius:8px;color:#b3d5e6;font-size:8px;text-transform:uppercase}.mmg-toolkit__copy ul{display:grid;gap:13px;margin:25px 0;padding:0;list-style:none}.mmg-toolkit__copy li{display:grid;grid-template-columns:25px 1fr;gap:9px}.mmg-toolkit__copy li>span{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:#e3f8f0;color:#16805c}.mmg-toolkit__copy li p{margin:0;color:#687884;font-size:12px}.mmg-toolkit__copy li b{display:block;color:var(--ink)}.mmg-ecosystem{background:#f0f4f5}.mmg-ecosystem__grid{max-width:900px;display:grid;grid-template-columns:1fr 1fr 1.2fr 1fr 1fr;align-items:center;gap:10px;margin:60px auto}.mmg-ecosystem__grid>a{min-height:125px;padding:20px;border:1px solid #d3e0e5;border-radius:18px;background:#fff;text-decoration:none!important}.mmg-ecosystem__grid>a small,.mmg-ecosystem__grid>a b,.mmg-ecosystem__grid>a span{display:block}.mmg-ecosystem__grid>a small{color:var(--blue)}.mmg-ecosystem__grid>a b{margin-top:10px;font-size:19px}.mmg-ecosystem__grid>a span{color:#72838f;font-size:10px}.mmg-ecosystem__core{width:180px;height:180px;display:grid;place-content:center;text-align:center;border-radius:50%;background:var(--ink);color:#fff}.mmg-ecosystem__core small{color:var(--cyan)}.mmg-ecosystem__core b{margin-top:8px;font-size:21px}.mmg-production{background:#fff}.mmg-production .mmg-button{border-color:#bed1dc;color:#1d536f!important}.mmg-production__grid{display:grid;grid-template-columns:repeat(4,1fr);margin-top:60px;border:1px solid var(--line);border-radius:25px;overflow:hidden}.mmg-production__grid article{min-height:260px;padding:25px;border-right:1px solid var(--line);background:#f9fbfc}.mmg-production__grid small{color:var(--blue)}.mmg-production__grid h3{margin:65px 0 10px;font-size:25px}.mmg-production__grid p{color:#687986;font-size:12px;line-height:1.7}.mmg-road{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:80px;background:#071b2a;color:#fff}.mmg-road .mmg-kicker,.mmg-road .mmg-link{color:var(--cyan)!important}.mmg-road>div>p{color:#8fa6b5}.mmg-meter{padding:35px;border:1px solid rgba(71,215,255,.2);border-radius:26px}.mmg-meter header,.mmg-meter footer{display:flex;justify-content:space-between;color:#78909d;font-size:9px;text-transform:uppercase}.mmg-meter header b{color:#63e0b2}.mmg-meter>strong{display:block;margin:40px 0 25px;color:transparent;-webkit-text-stroke:1px rgba(112,220,255,.55);font-size:clamp(100px,14vw,180px);line-height:.75}.mmg-meter>i{height:8px;display:block;padding:2px;border:1px solid #24475c;border-radius:10px}.mmg-meter>i span{display:block;width:18%;height:100%;background:linear-gradient(90deg,var(--cyan),#63e0b2)}.mmg-meter footer{margin-top:12px}.mmg-follow{background:#f5f7f8}.mmg-follow__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:50px}.mmg-follow__grid>a{min-height:320px;padding:27px;border:1px solid var(--line);border-radius:24px;background:#fff;text-decoration:none!important}.mmg-follow__grid i{width:46px;height:46px;display:grid;place-items:center;border-radius:14px;background:#eef8fc;color:var(--blue);font-style:normal;font-size:19px}.mmg-follow__grid small{display:block;margin-top:45px;color:var(--blue);font-size:9px;font-weight:850;text-transform:uppercase}.mmg-follow__grid h3{margin:10px 0;font-size:25px}.mmg-follow__grid p{min-height:68px;color:#697a86;font-size:12px;line-height:1.65}.mmg-follow__grid b{color:#0069b8;font-size:10px}.mmg-founder{display:grid;grid-template-columns:.7fr 1.3fr;align-items:center;gap:85px;background:#fff}.mmg-founder__mark{position:relative;aspect-ratio:1;display:grid;place-items:center;overflow:hidden;border-radius:50%;background:var(--ink);color:#fff}.mmg-founder__mark span{z-index:2;font-size:clamp(70px,10vw,130px);font-weight:900}.mmg-founder__mark i{position:absolute;width:70%;height:70%;border:1px solid rgba(71,215,255,.3);border-radius:50%;box-shadow:0 0 0 50px rgba(71,215,255,.04)}.mmg-founder blockquote{margin:0;font-size:clamp(36px,4.2vw,61px);font-weight:780;line-height:1.06;letter-spacing:-.055em}.mmg-final{text-align:center;background:#071826;color:#fff}.mmg-final .mmg-kicker,.mmg-final .mmg-actions{justify-content:center}.mmg-final .mmg-kicker{color:var(--cyan)}.mmg-final>p:not(.mmg-kicker){max-width:590px;margin:25px auto;color:#91a6b3;line-height:1.7}
@media(max-width:1050px){.mmg-hero{grid-template-columns:1fr}.mmg-system{width:min(100%,700px)}.mmg-path__grid,.mmg-production__grid{grid-template-columns:repeat(2,1fr)}.mmg-learn,.mmg-toolkit{grid-template-columns:1fr}.mmg-toolkit__visual{order:2}.mmg-ecosystem__grid{grid-template-columns:1fr 1fr}.mmg-ecosystem__core{grid-column:1/-1;grid-row:1;margin:auto}}
@media(max-width:700px){.mmg-hero,.mmg-section{padding:74px 20px}.mmg-hero h1{font-size:clamp(55px,18vw,80px)}.mmg-system{min-height:440px}.mmg-system__core{min-height:320px}.mmg-orbit--two{width:310px;height:310px}.mmg-core{width:105px;height:105px}.mmg-node{width:118px;padding:10px}.mmg-heading{display:block}.mmg-heading>p,.mmg-heading>.mmg-button{margin-top:20px}.mmg-path__grid,.mmg-build__grid,.mmg-production__grid,.mmg-follow__grid{grid-template-columns:1fr}.mmg-books{min-height:390px;transform:scale(.78);transform-origin:left center;width:125%}.mmg-books article{width:210px;height:310px}.mmg-books article:nth-child(1){left:0}.mmg-books article:nth-child(2){left:30%}.mmg-books article:nth-child(3){left:59%}.mmg-toolkit{gap:45px}.mmg-toolkit__visual{min-height:420px}.mmg-ecosystem__grid{grid-template-columns:1fr 1fr}.mmg-road,.mmg-founder{grid-template-columns:1fr;gap:45px}.mmg-founder__mark{width:min(86vw,420px)}}
@media(prefers-reduced-motion:reduce){.mmg-home{scroll-behavior:auto}}
.mmg-build-card>span{display:block;margin-top:50px;color:var(--blue);font-size:10px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}
`;

const DEFAULT_SETTINGS = Object.freeze({
  library_url: "/pages/knowledge-library",
  toolkit_url: "/pages/free-creator-toolkit",
  publishing_url: "/pages/publishing-services",
  kairos_url: "https://mmg-ios.info-mindsetmediagroup.workers.dev",
  tiktok_url: "https://www.tiktok.com/@mindset.media.group",
});

export function buildCanonicalHomepagePackage(document, objective = "") {
  validateTemplate(document);
  const candidate = structuredClone(document);
  const existing = Object.entries(candidate.sections).find(([, section]) => section?.type === CANONICAL_HOMEPAGE_SECTION_TYPE);
  const sectionId = existing?.[0] || uniqueSectionId(candidate.sections);
  const previousSection = existing?.[1];

  candidate.sections[sectionId] = {
    ...(previousSection && typeof previousSection === "object" ? previousSection : {}),
    type: CANONICAL_HOMEPAGE_SECTION_TYPE,
    disabled: false,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(previousSection?.settings && typeof previousSection.settings === "object" ? previousSection.settings : {}),
    },
  };

  const previousOrder = Array.isArray(candidate.order) ? candidate.order.filter(id => id !== sectionId) : [];
  for (const id of previousOrder) {
    if (candidate.sections[id] && typeof candidate.sections[id] === "object") {
      candidate.sections[id] = { ...candidate.sections[id], disabled: true };
    }
  }
  candidate.order = [sectionId, ...previousOrder];

  const templateSource = `${JSON.stringify(candidate, null, 2)}\n`;
  return {
    version: KAIROS_CANONICAL_HOMEPAGE_VERSION,
    mode: "canonical-package",
    sectionId,
    objective: String(objective || ""),
    document: candidate,
    files: [
      { filename: CANONICAL_HOMEPAGE_TEMPLATE_FILE, content: templateSource },
      { filename: CANONICAL_HOMEPAGE_SECTION_FILE, content: `${CANONICAL_HOMEPAGE_SECTION_SOURCE.trim()}\n` },
      { filename: CANONICAL_HOMEPAGE_CSS_FILE, content: `${CANONICAL_HOMEPAGE_CSS_SOURCE.trim()}\n` },
    ],
    summary: "Install the canonical MMG homepage journey on the non-live Kairos Staging theme.",
    strategy: "Install a native Shopify section and scoped stylesheet, make the canonical section the only enabled homepage journey, preserve every prior section for rollback, verify all three files by read-back, and leave the live theme unchanged.",
    changes: [
      {
        filename: CANONICAL_HOMEPAGE_SECTION_FILE,
        purpose: "Add the complete MMG and Kairos canonical homepage experience as a native Online Store 2.0 section.",
        changeType: "create-or-update",
        expectedOutcome: "The staging theme contains the complete eleven-section guided homepage.",
      },
      {
        filename: CANONICAL_HOMEPAGE_CSS_FILE,
        purpose: "Add the responsive, section-scoped canonical homepage design system.",
        changeType: "create-or-update",
        expectedOutcome: "The homepage renders correctly from mobile through large desktop without leaking styles into the Shopify theme.",
      },
      {
        filename: CANONICAL_HOMEPAGE_TEMPLATE_FILE,
        purpose: "Enable the canonical homepage section and retain the previous homepage sections in a disabled, reversible state.",
        changeType: "modify",
        expectedOutcome: "Kairos Staging displays the canonical journey while Shopify header, footer, cart, applications, and integrations remain theme-controlled.",
      },
    ],
    risks: [
      "The staging theme must permit theme file writes through Shopify's Admin API.",
      "Destination pages configured in section settings must exist before production publication.",
      "Publication to the live theme remains a separate executive approval.",
    ],
    acceptanceCriteria: [
      "The canonical homepage is installed only on the verified non-live Kairos Staging theme.",
      "The page contains exactly one primary H1 and the eleven required content sections.",
      "MMG is presented as the ecosystem and Kairos as the guided execution layer.",
      "The Liquid section, CSS asset, and homepage template match their approved SHA-256 hashes after Shopify read-back.",
      "All previous homepage sections remain present and disabled for reversible staging review.",
      "The live MAIN theme remains unchanged.",
      "No OpenAI service, API, model, route, or fallback is used.",
    ],
    rollbackPlan: [
      "Restore the exact pre-change templates/index.json.",
      "Restore any pre-existing canonical Liquid or CSS files byte-for-byte.",
      "Delete canonical Liquid or CSS files that did not exist before installation.",
      "Verify every restored or deleted staging file and confirm the live MAIN theme is unchanged.",
    ],
    evidenceNotes: [
      `Canonical section ID: ${sectionId}.`,
      `Prior homepage sections preserved: ${previousOrder.length}.`,
      "Package generation is deterministic and provider-independent.",
    ],
  };
}

function uniqueSectionId(sections) {
  const base = "mmg_canonical_homepage";
  if (!sections[base]) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}_${index}`;
    if (!sections[candidate]) return candidate;
  }
  throw new Error("Kairos could not allocate a canonical homepage section ID.");
}

function validateTemplate(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Homepage template must be an object.");
  if (!document.sections || typeof document.sections !== "object" || Array.isArray(document.sections)) throw new Error("Homepage template sections must be an object.");
  if (!Array.isArray(document.order)) throw new Error("Homepage template order must be an array.");
  if (new Set(document.order).size !== document.order.length) throw new Error("Homepage template order contains duplicate section IDs.");
  if (document.order.some(id => !document.sections[id])) throw new Error("Homepage template order references an unknown section ID.");
}

