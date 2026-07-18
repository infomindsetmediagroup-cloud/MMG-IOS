export const CSS_SOURCE_A = String.raw`
:root {
  --mmg-blue: #2266ff;
  --mmg-blue-dark: #1246bb;
  --mmg-ink: #141923;
  --mmg-muted: #5f6673;
  --mmg-line: #e3e7ed;
  --mmg-soft: #f5f7fa;
  --mmg-white: #ffffff;
  --mmg-radius: 24px;
  --mmg-shadow: 0 18px 50px rgba(21, 38, 74, 0.09);
}

.mmg-canonical-homepage-section { margin: 0 !important; }
.mmg-home {
  background: var(--mmg-white);
  color: var(--mmg-ink);
  font-family: var(--font-body-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow: hidden;
}
.mmg-home * { box-sizing: border-box; }
.mmg-home a { text-decoration: none; }
.mmg-home h1,
.mmg-home h2,
.mmg-home h3,
.mmg-home p { margin-top: 0; }
.mmg-home h1,
.mmg-home h2,
.mmg-home h3 {
  color: var(--mmg-ink);
  font-family: var(--font-heading-family, var(--font-body-family, system-ui));
  letter-spacing: -0.035em;
}
.mmg-home h1 {
  font-size: clamp(3rem, 7vw, 6.2rem);
  line-height: 0.98;
  margin-bottom: 1.5rem;
  max-width: 11ch;
}
.mmg-home h2 {
  font-size: clamp(2.25rem, 4.8vw, 4rem);
  line-height: 1.04;
  margin-bottom: 1.25rem;
  max-width: 15ch;
}
.mmg-home h3 {
  font-size: clamp(1.35rem, 2vw, 1.8rem);
  line-height: 1.16;
  margin-bottom: 0.8rem;
}
.mmg-home p {
  color: var(--mmg-muted);
  font-size: 1.04rem;
  line-height: 1.72;
}
.mmg-shell {
  margin-inline: auto;
  width: min(1120px, calc(100% - 40px));
}
.mmg-breadcrumb {
  color: var(--mmg-muted);
  display: inline-block;
  font-size: 0.82rem;
  font-weight: 750;
  margin-bottom: 2rem;
}
.mmg-breadcrumb:hover { color: var(--mmg-blue); }
.mmg-pill {
  background: #eaf1ff;
  border-radius: 999px;
  color: var(--mmg-blue) !important;
  display: inline-flex;
  font-size: 0.75rem !important;
  font-weight: 850;
  letter-spacing: 0.12em;
  line-height: 1.2 !important;
  margin-bottom: 1.25rem !important;
  padding: 0.62rem 0.9rem;
  text-transform: uppercase;
}
.mmg-pill--light {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff !important;
}
.mmg-hero {
  background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
  border-bottom: 1px solid var(--mmg-line);
  padding: clamp(4.5rem, 9vw, 8rem) 0 clamp(4.5rem, 8vw, 7rem);
}
.mmg-hero__lead {
  color: var(--mmg-ink) !important;
  font-size: clamp(1.2rem, 2.2vw, 1.55rem) !important;
  line-height: 1.55 !important;
  max-width: 780px;
}
.mmg-hero__support { max-width: 760px; }
.mmg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  margin-top: 2rem;
}
.mmg-actions--center { justify-content: center; }
.mmg-button {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 999px;
  display: inline-flex;
  font-size: 0.94rem;
  font-weight: 820;
  justify-content: center;
  min-height: 50px;
  padding: 0.78rem 1.35rem;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, color 0.2s ease;
}
.mmg-button:hover { transform: translateY(-2px); }
.mmg-button--primary {
  background: var(--mmg-blue);
  box-shadow: 0 12px 28px rgba(34, 102, 255, 0.22);
  color: #ffffff;
}
.mmg-button--primary:hover { background: var(--mmg-blue-dark); color: #ffffff; }
.mmg-button--secondary {
  background: #ffffff;
  border-color: var(--mmg-line);
  color: var(--mmg-ink);
}
.mmg-button--light { background: #ffffff; color: var(--mmg-blue-dark); }
.mmg-button--ghost { border-color: rgba(255, 255, 255, 0.4); color: #ffffff; }
.mmg-section {
  padding: clamp(4.5rem, 8vw, 7.5rem) 0;
  scroll-margin-top: 30px;
}
.mmg-section--soft {
  background: var(--mmg-soft);
  border-bottom: 1px solid var(--mmg-line);
  border-top: 1px solid var(--mmg-line);
}
.mmg-section-heading {
  margin-bottom: 2.6rem;
  max-width: 780px;
}
.mmg-card-grid {
  display: grid;
  gap: 1rem;
}
.mmg-card-grid--three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.mmg-card-grid--four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.mmg-card {
  background: #ffffff;
  border: 1px solid var(--mmg-line);
  border-radius: var(--mmg-radius);
  color: inherit;
  display: flex;
  flex-direction: column;
  min-height: 300px;
  padding: 1.8rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}
.mmg-card:hover {
  border-color: rgba(34, 102, 255, 0.28);
  box-shadow: var(--mmg-shadow);
  transform: translateY(-4px);
}
.mmg-card p { font-size: 0.97rem; }
.mmg-card__badge,
.mmg-card__icon {
  align-items: center;
  background: #eaf1ff;
  border-radius: 999px;
  color: var(--mmg-blue);
  display: inline-flex;
  font-size: 0.8rem;
  font-weight: 900;
`;
