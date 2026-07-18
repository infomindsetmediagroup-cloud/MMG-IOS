export const SECTION_SOURCE_B = String.raw`              <li>Business resources</li>
              <li>Custom project support</li>
            </ul>
            <a class="mmg-card__link" href="/pages/contact">Start a custom project <span aria-hidden="true">→</span></a>
          </article>
        </div>
      </div>
    </section>

    <section id="subscriptions" class="mmg-section mmg-section--soft mmg-reveal" data-mmg-section="subscriptions">
      <div class="mmg-shell mmg-split">
        <div>
          <p class="mmg-pill">Personalized Learning</p>
          <h2>Keep building with a cadence that fits you.</h2>
          <p>Choose weekly, bi-weekly, or monthly delivery and receive curated digital resources aligned to your role, interests, and current objectives.</p>
          <a class="mmg-button mmg-button--primary" href="/pages/contact">Explore Subscriptions</a>
        </div>
        <div class="mmg-check-card" aria-label="Subscription cadence options">
          <div><span>✓</span><p><strong>Weekly</strong><br>Maintain momentum with one focused package every week.</p></div>
          <div><span>✓</span><p><strong>Bi-weekly</strong><br>Balance consistent progress with time to apply each resource.</p></div>
          <div><span>✓</span><p><strong>Monthly</strong><br>Receive a curated monthly package aligned to your priorities.</p></div>
        </div>
      </div>
    </section>

    <section id="kairos" class="mmg-section mmg-reveal" data-mmg-section="kairos">
      <div class="mmg-shell">
        <div class="mmg-feature-panel">
          <div>
            <p class="mmg-pill mmg-pill--light">Kairos</p>
            <h2>Objectives become guided execution.</h2>
            <p>Kairos is the intelligence and orchestration layer behind the MMG ecosystem. Describe what you want to accomplish, and Kairos organizes the relevant knowledge, tools, services, and next actions around the objective.</p>
            <a class="mmg-button mmg-button--light" href="/pages/customer-portal">Enter the Customer Portal</a>
          </div>
          <div class="mmg-check-card mmg-check-card--dark">
            <div><span>✓</span><p>Organizes context around the objective</p></div>
            <div><span>✓</span><p>Identifies the strongest next action</p></div>
            <div><span>✓</span><p>Coordinates approved work across the ecosystem</p></div>
            <div><span>✓</span><p>Preserves visible progress and deliverables</p></div>
          </div>
        </div>
      </div>
    </section>

    <section id="mission" class="mmg-section mmg-section--soft mmg-reveal" data-mmg-section="mission">
      <div class="mmg-shell">
        <div class="mmg-section-heading">
          <p class="mmg-pill">Our Operating Belief</p>
          <h2>We’re not gatekeepers. We’re door openers.</h2>
          <p>Mindset Media Group exists to reduce friction, make professional knowledge and production more accessible, and help people turn useful ideas into work that lasts.</p>
        </div>
        <div class="mmg-card-grid mmg-card-grid--three">
          <article class="mmg-card"><span class="mmg-card__icon" aria-hidden="true">01</span><h3>Clarity</h3><p>Understand what comes next without unnecessary complexity.</p></article>
          <article class="mmg-card"><span class="mmg-card__icon" aria-hidden="true">02</span><h3>Execution</h3><p>Move ideas into completed, professional assets and deliverables.</p></article>
          <article class="mmg-card"><span class="mmg-card__icon" aria-hidden="true">03</span><h3>Momentum</h3><p>See progress, preserve value, and keep building from what you create.</p></article>
        </div>
      </div>
    </section>

    <section id="questions" class="mmg-section mmg-reveal" data-mmg-section="questions">
      <div class="mmg-shell">
        <div class="mmg-section-heading">
          <p class="mmg-pill">Common Questions</p>
          <h2>Start with clarity.</h2>
        </div>
        <div class="mmg-faq-list">
          <details><summary>What can Mindset Media Group help me build?</summary><p>Books, guides, digital products, publishing assets, creator systems, brand materials, and other knowledge-based deliverables supported by practical education and professional services.</p></details>
          <details><summary>Do I need to know which product or service I need?</summary><p>No. Start with the objective. The ecosystem is designed to connect that objective to the right pathway, resource, service, or guided workflow.</p></details>
          <details><summary>How does Kairos fit into the experience?</summary><p>Kairos organizes context, identifies the next action, and coordinates approved work through a visible execution process.</p></details>
        </div>
      </div>
    </section>

    <section id="next-step" class="mmg-section mmg-section--soft mmg-reveal" data-mmg-section="next-step">
      <div class="mmg-shell">
        <div class="mmg-section-heading">
          <p class="mmg-pill">Continue Your Journey</p>
          <h2>Explore the complete ecosystem.</h2>
          <p>Choose the next destination based on the work you are ready to begin.</p>
        </div>
        <div class="mmg-card-grid mmg-card-grid--four">
          <a class="mmg-card mmg-card--journey" href="/collections/all"><h3>Shop</h3><p>Books, guides, templates, and digital resources.</p><span class="mmg-card__link">Browse products →</span></a>
          <a class="mmg-card mmg-card--journey" href="/pages/publishing-services"><h3>Publishing Services</h3><p>Professional support from manuscript to delivery.</p><span class="mmg-card__link">View services →</span></a>
          <a class="mmg-card mmg-card--journey" href="/pages/knowledge-library"><h3>Knowledge Library</h3><p>Connected education, standards, and resources.</p><span class="mmg-card__link">Open library →</span></a>
          <a class="mmg-card mmg-card--journey" href="/pages/contact"><h3>Contact MMG</h3><p>Ask a question or begin a custom project.</p><span class="mmg-card__link">Get support →</span></a>
        </div>
        <div class="mmg-final-cta">
          <p class="mmg-pill mmg-pill--light">Your Next Move</p>
          <h2>Start with what you know.</h2>
          <p>Choose a path, explore the resources, or let the MMG ecosystem help organize the next step.</p>
          <div class="mmg-actions mmg-actions--center">
            <a class="mmg-button mmg-button--light" href="#pathways">Choose Your Path</a>
            <a class="mmg-button mmg-button--ghost" href="/pages/contact">Start a Project</a>
          </div>
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
