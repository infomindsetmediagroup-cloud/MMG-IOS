export const JS_SOURCE = String.raw`(() => {
  const root = document.querySelector('[data-mmg-canonical-homepage]');
  if (!root || root.dataset.enhanced === 'true') return;
  root.dataset.enhanced = 'true';

  const navigation = [
    ['Home', '/'],
    ['Knowledge Library', '/pages/knowledge-library'],
    ['Shop', '/collections/all'],
    ['Publishing Services', '/pages/publishing-services'],
    ['Membership', '/pages/membership'],
    ['Kairos', '/pages/kairos'],
    ['About', '/pages/about-mindset-media-group'],
    ['Contact', '/pages/contact'],
    ['Customer Portal', '/pages/customer-portal']
  ];

  const normalizedPath = (value) => {
    try {
      const path = new URL(value, window.location.origin).pathname.replace(/\/$/, '');
      return path || '/';
    } catch {
      return value;
    }
  };

  const hasLink = (list, href) => [...list.querySelectorAll('a[href]')]
    .some((link) => normalizedPath(link.href) === normalizedPath(href));

  function addDrawerLinks(list) {
    navigation.forEach(([label, href]) => {
      if (hasLink(list, href)) return;
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      link.className = 'menu-drawer__menu-item list-menu__item link link--text focus-inset';
      if (normalizedPath(location.pathname) === normalizedPath(href)) link.setAttribute('aria-current', 'page');
      item.appendChild(link);
      list.appendChild(item);
    });
  }

  function addDesktopLinks(list) {
    navigation.forEach(([label, href]) => {
      if (hasLink(list, href)) return;
      const item = document.createElement('li');
      const link = document.createElement('a');
      const text = document.createElement('span');
      link.href = href;
      link.className = 'header__menu-item list-menu__item link link--text focus-inset';
      text.textContent = label;
      link.appendChild(text);
      if (normalizedPath(location.pathname) === normalizedPath(href)) link.setAttribute('aria-current', 'page');
      item.appendChild(link);
      list.appendChild(item);
    });
  }

  function enhanceNativeHeader(attempt = 0) {
    const drawerList = document.querySelector('#menu-drawer .menu-drawer__menu, .menu-drawer__navigation .menu-drawer__menu, header-drawer ul.menu-drawer__menu');
    const desktopList = document.querySelector('header .header__inline-menu ul.list-menu--inline');

    if (drawerList) addDrawerLinks(drawerList);
    if (desktopList) addDesktopLinks(desktopList);

    if (!drawerList && !desktopList && attempt < 5) {
      window.setTimeout(() => enhanceNativeHeader(attempt + 1), 300);
    }
  }

  enhanceNativeHeader();

  const themeHeading = document.querySelector('header h1.header__heading, header .header__heading h1');
  if (themeHeading && !root.contains(themeHeading)) {
    const replacement = document.createElement('div');
    for (const attribute of themeHeading.attributes) replacement.setAttribute(attribute.name, attribute.value);
    while (themeHeading.firstChild) replacement.appendChild(themeHeading.firstChild);
    themeHeading.replaceWith(replacement);
  }

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