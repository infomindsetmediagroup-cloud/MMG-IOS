export const CSS_SOURCE_C = String.raw`
.mmg-ecosystem-nav{position:sticky;top:0;z-index:30;background:rgba(255,255,255,.96);border-bottom:1px solid var(--hub-line);backdrop-filter:blur(16px)}
.mmg-ecosystem-nav__inner{width:min(1240px,calc(100% - 48px));min-height:70px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:2rem}
.mmg-ecosystem-nav__brand{font-weight:850;color:var(--hub-navy);letter-spacing:-.025em;text-decoration:none}
.mmg-ecosystem-nav__links{display:flex;align-items:center;gap:1.4rem}
.mmg-ecosystem-nav__links a{font-size:1rem;font-weight:760;color:var(--hub-muted);text-decoration:none}
.mmg-ecosystem-nav__links a:hover{color:var(--hub-ink)}
.mmg-ecosystem-nav__portal{color:var(--hub-blue)!important}
.mmg-ecosystem-nav__toggle{display:none;border:0;background:none;color:var(--hub-ink);font:inherit;font-weight:820}
@media(max-width:900px){.mmg-ecosystem-nav__inner{width:min(100% - 36px,1240px)}.mmg-ecosystem-nav__toggle{display:block}.mmg-ecosystem-nav__links{display:none;position:absolute;left:18px;right:18px;top:62px;flex-direction:column;align-items:stretch;gap:.2rem;background:#fff;border:1px solid var(--hub-line);border-radius:20px;padding:.8rem;box-shadow:0 20px 60px rgba(15,23,42,.14)}.mmg-ecosystem-nav__links.is-open{display:flex}.mmg-ecosystem-nav__links a{padding:.85rem 1rem;border-radius:14px}.mmg-ecosystem-nav__links a:hover{background:var(--hub-soft)}}
@media(max-width:640px){.mmg-ecosystem-nav__inner{width:min(100% - 28px,1240px)}}
`;