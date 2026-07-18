export const CSS_SOURCE_B = String.raw`  height: 46px;
  justify-content: center;
  margin-bottom: 2.2rem;
  width: 46px;
}
.mmg-card__icon {
  border-radius: 14px;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  width: 52px;
}
.mmg-card__link {
  color: var(--mmg-blue);
  display: inline-flex;
  font-size: 0.9rem;
  font-weight: 820;
  gap: 0.35rem;
  margin-top: auto;
}
.mmg-card--service { min-height: 420px; }
.mmg-mini-list {
  color: var(--mmg-muted);
  display: grid;
  gap: 0.55rem;
  list-style: none;
  margin: 1rem 0 1.8rem;
  padding: 0;
}
.mmg-mini-list li {
  font-size: 0.92rem;
  padding-left: 1.35rem;
  position: relative;
}
.mmg-mini-list li::before {
  color: var(--mmg-blue);
  content: "✓";
  font-weight: 900;
  left: 0;
  position: absolute;
}
.mmg-split {
  align-items: center;
  display: grid;
  gap: clamp(3rem, 7vw, 7rem);
  grid-template-columns: 1fr 1fr;
}
.mmg-check-card {
  background: #ffffff;
  border: 1px solid var(--mmg-line);
  border-radius: var(--mmg-radius);
  box-shadow: var(--mmg-shadow);
  overflow: hidden;
}
.mmg-check-card > div {
  align-items: flex-start;
  display: grid;
  gap: 1rem;
  grid-template-columns: 32px 1fr;
  padding: 1.2rem 1.35rem;
}
.mmg-check-card > div + div { border-top: 1px solid var(--mmg-line); }
.mmg-check-card span {
  align-items: center;
  background: #eaf1ff;
  border-radius: 50%;
  color: var(--mmg-blue);
  display: flex;
  font-size: 0.78rem;
  font-weight: 900;
  height: 28px;
  justify-content: center;
  width: 28px;
}
.mmg-check-card p { font-size: 0.94rem; margin: 0; }
.mmg-feature-panel {
  align-items: center;
  background: linear-gradient(145deg, #2266ff, #153c9f);
  border-radius: 32px;
  display: grid;
  gap: clamp(2.5rem, 6vw, 6rem);
  grid-template-columns: 1fr 0.9fr;
  padding: clamp(2rem, 5vw, 4.5rem);
}
.mmg-feature-panel h2,
.mmg-feature-panel p { color: #ffffff; }
.mmg-check-card--dark {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: none;
}
.mmg-check-card--dark > div + div { border-color: rgba(255, 255, 255, 0.18); }
.mmg-check-card--dark span {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}
.mmg-check-card--dark p { color: #ffffff; }
.mmg-faq-list {
  border-bottom: 1px solid var(--mmg-line);
}
.mmg-faq-list details {
  border-top: 1px solid var(--mmg-line);
  padding: 1.25rem 0;
}
.mmg-faq-list summary {
  color: var(--mmg-ink);
  cursor: pointer;
  font-size: 1.05rem;
  font-weight: 820;
  padding-right: 2rem;
  position: relative;
}
.mmg-faq-list summary::after {
  content: "+";
  position: absolute;
  right: 0.3rem;
}
.mmg-faq-list details[open] summary::after { content: "−"; }
.mmg-faq-list details p {
  font-size: 0.96rem;
  margin: 1rem 0 0;
  max-width: 760px;
}
.mmg-card--journey {
  min-height: 250px;
  padding: 1.5rem;
}
.mmg-final-cta {
  background: linear-gradient(135deg, #2266ff, #12337f);
  border-radius: 32px;
  margin-top: clamp(3rem, 7vw, 6rem);
  padding: clamp(3rem, 7vw, 6rem) 1.5rem;
  text-align: center;
}
.mmg-final-cta h2,
.mmg-final-cta p { color: #ffffff; margin-inline: auto; }
.mmg-final-cta h2 { max-width: none; }
.mmg-final-cta > p:not(.mmg-pill) { max-width: 680px; }
.mmg-reveal {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.55s ease, transform 0.55s ease;
}
.mmg-reveal.is-visible { opacity: 1; transform: none; }
.mmg-button:focus-visible,
.mmg-home a:focus-visible,
.mmg-home summary:focus-visible {
  outline: 3px solid rgba(34, 102, 255, 0.4);
  outline-offset: 4px;
}

@media (max-width: 980px) {
  .mmg-card-grid--three,
  .mmg-card-grid--four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mmg-split,
  .mmg-feature-panel { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .mmg-shell { width: min(100% - 28px, 1120px); }
  .mmg-home h1 { font-size: clamp(2.8rem, 15vw, 4.4rem); }
  .mmg-home h2 { font-size: clamp(2.1rem, 11vw, 3rem); }
  .mmg-card-grid--three,
  .mmg-card-grid--four { grid-template-columns: 1fr; }
  .mmg-card,
  .mmg-card--service,
  .mmg-card--journey { min-height: 0; }
  .mmg-actions .mmg-button { width: 100%; }
  .mmg-feature-panel { border-radius: 24px; }
  .mmg-final-cta { border-radius: 24px; }
}

@media (prefers-reduced-motion: reduce) {
  .mmg-reveal { opacity: 1; transform: none; transition: none; }
  .mmg-button,
  .mmg-card { transition: none; }
}
`;
