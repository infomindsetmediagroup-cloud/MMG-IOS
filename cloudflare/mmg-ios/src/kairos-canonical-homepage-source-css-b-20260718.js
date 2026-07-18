export const CSS_SOURCE_B = String.raw`
/* Homepage refinement layer — larger editorial scale */
.mmg-home {
  font-size: 18px;
}
.mmg-home h1 {
  font-size: clamp(4rem, 7.8vw, 7rem);
  line-height: 0.96;
  max-width: 12ch;
}
.mmg-home h2 {
  font-size: clamp(2.9rem, 5.4vw, 4.8rem);
  line-height: 1.02;
}
.mmg-home h3 {
  font-size: clamp(1.55rem, 2.35vw, 2.1rem);
  line-height: 1.14;
}
.mmg-home p {
  font-size: clamp(1.12rem, 1.35vw, 1.24rem);
  line-height: 1.68;
}
.hub-shell {
  width: min(1240px, calc(100% - 48px));
}
.hub-hero {
  padding-top: clamp(5.5rem, 9vw, 8.5rem);
}
.hub-eyebrow-link {
  font-size: 1rem;
  margin-bottom: 2rem;
}
.hub-eyebrow,
.mmg-pill {
  font-size: 0.9rem !important;
  letter-spacing: 0.1em;
  padding: 0.78rem 1.08rem;
}
.hub-lead,
.mmg-hero__lead {
  font-size: clamp(1.45rem, 2.5vw, 1.9rem) !important;
  line-height: 1.5 !important;
  max-width: 900px;
}
.hub-button,
.mmg-button {
  min-height: 58px;
  padding: 0.95rem 1.65rem;
  font-size: 1.08rem;
}
.hub-access-card {
  padding: 2.5rem;
}
.hub-access-card__label {
  font-size: 0.9rem !important;
}
.hub-access-card h2 {
  font-size: clamp(2.2rem, 3.6vw, 3.25rem);
}
.hub-access-actions a {
  padding: 1.2rem;
  font-size: 1.05rem;
}
.hub-metrics article {
  padding: 1.5rem;
}
.hub-metrics strong {
  font-size: 1.2rem;
}
.hub-metrics span,
.hub-tabs a {
  font-size: 1rem;
}
.hub-tabs__inner {
  padding-block: 1.1rem;
}
.hub-section {
  padding: clamp(5.5rem, 9vw, 8.5rem) 0;
}
.hub-section-heading {
  max-width: 920px;
  margin-bottom: 3.3rem;
}
.hub-project-grid,
.hub-library-grid,
.hub-deliverable-grid {
  gap: 1.35rem;
}
.hub-project-card,
.hub-library-card,
.hub-deliverable-grid article,
.hub-support-card,
.mmg-card {
  padding: 2.15rem;
  border-radius: 28px;
}
.hub-project-card {
  min-height: 410px;
}
.hub-status {
  font-size: 0.86rem;
  padding: 0.58rem 0.84rem;
}
.hub-project-meta span {
  font-size: 0.92rem;
  padding: 0.55rem 0.8rem;
}
.hub-card-actions a,
.hub-library-card a,
.hub-deliverable-grid a,
.hub-support-card a,
.mmg-card__link,
.mmg-card-action {
  font-size: 1.04rem;
}
.hub-timeline article {
  padding: 1.5rem 1.6rem;
}
.hub-timeline h3 {
  font-size: 1.25rem;
}
.hub-timeline p,
.hub-message-list p,
.mmg-card p,
.mmg-mini-list li,
.mmg-check-card p,
.mmg-faq-list details p {
  font-size: 1.08rem;
}
.hub-timeline b,
.hub-library-card > span,
.hub-message-list span {
  font-size: 0.9rem;
}
.hub-library-card {
  min-height: 390px;
}
.hub-cover {
  font-size: 1.8rem;
  margin-bottom: 1.35rem;
}
.hub-deliverable-grid article {
  min-height: 300px;
}
.hub-kairos-panel,
.mmg-feature-panel {
  border-radius: 36px;
  padding: clamp(2.8rem, 5.5vw, 5rem);
}
.hub-message-list article {
  padding: 1.3rem;
}
.mmg-faq-list summary {
  font-size: 1.28rem;
  padding-block: 0.35rem;
}
.mmg-faq-list details {
  padding: 1.65rem 0;
}
@media (max-width: 980px) {
  .mmg-home { font-size: 17px; }
  .hub-shell { width: min(100% - 36px, 1240px); }
}
@media (max-width: 640px) {
  .mmg-home { font-size: 16px; }
  .hub-shell { width: min(100% - 28px, 1240px); }
  .mmg-home h1 { font-size: clamp(3.25rem, 16vw, 5rem); }
  .mmg-home h2 { font-size: clamp(2.45rem, 11.5vw, 3.55rem); }
  .mmg-home h3 { font-size: clamp(1.65rem, 7vw, 2.15rem); }
  .mmg-home p { font-size: 1.08rem; }
  .hub-eyebrow-link { font-size: 0.95rem; }
  .hub-eyebrow,
  .mmg-pill { font-size: 0.82rem !important; }
  .hub-button,
  .mmg-button { font-size: 1rem; min-height: 56px; }
  .hub-project-card,
  .hub-library-card,
  .hub-deliverable-grid article,
  .hub-support-card,
  .mmg-card { padding: 1.65rem; }
}
`;