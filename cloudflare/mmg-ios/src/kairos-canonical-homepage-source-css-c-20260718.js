export const CSS_SOURCE_C = String.raw`
/* Shopify native shell integration */
.shopify-section-group-header-group,
.shopify-section-group-header-group .header-wrapper,
.shopify-section-group-header-group .header,
header.header,
.header-wrapper {
  background:#0f172a!important;
  color:#fff!important;
}
.shopify-section-group-header-group .header-wrapper,
.header-wrapper { border-bottom-color:rgba(255,255,255,.14)!important; }
.header__heading-link,
.header__heading-link .h2,
.header__icon,
.header__icon .icon,
.header__menu-item,
.header__menu-item span,
.header__inline-menu .link,
header-drawer summary,
header-drawer summary .icon { color:#fff!important; }
.header__icon:hover,
.header__menu-item:hover,
.header__menu-item:hover span { color:#dbeafe!important; }
.header__icon .icon path,
.header__icon .icon circle,
.header__icon .icon line,
header-drawer .icon path,
header-drawer .icon line { stroke:currentColor!important; }
.cart-count-bubble { background:#2563eb!important;color:#fff!important; }
.menu-drawer { background:#fff!important; }
.menu-drawer__menu-item { color:#172033!important;font-weight:760!important; }
.menu-drawer__menu-item:hover,
.menu-drawer__menu-item:focus,
.menu-drawer__menu-item[aria-current='page'] { background:#f3f6fb!important;color:#1d4ed8!important; }
.mmg-native-portal-link { margin:10px 16px 0!important;border-radius:12px!important;background:#2563eb!important;color:#fff!important;justify-content:center!important; }
.mmg-native-portal-link:hover,
.mmg-native-portal-link:focus { background:#1d4ed8!important;color:#fff!important; }

.shopify-section-group-footer-group,
.shopify-section-group-footer-group .footer,
footer.footer,
.footer { background:#000!important;color:#fff!important;border-top:0!important; }
.footer *,
.footer a,
.footer p,
.footer h2,
.footer h3,
.footer .link,
.footer .copyright__content { color:#fff!important; }
.footer a:hover { color:#bfdbfe!important; }
.footer__payment,
.list-payment,
[class*='payment-icons'],
[class*='payment_icons'] { display:none!important; }
.footer__copyright { text-align:center!important;width:100%!important; }
.mmg-footer-credit { display:block!important;font-size:.9rem!important;letter-spacing:.01em!important; }
`;