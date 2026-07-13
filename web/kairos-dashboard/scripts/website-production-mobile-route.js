const MOBILE_WEBSITE_BUILD = "kairos-mobile-website-route-20260713-1";
const MOBILE_WEBSITE_URL = `/web-003.html?v=${MOBILE_WEBSITE_BUILD}`;

function isMobileWebsiteViewport() {
  return window.matchMedia("(max-width: 760px)").matches ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function routeMobileWebsiteProject(event) {
  const button = event.target.closest?.('[data-child="website"]');
  if (!button || !isMobileWebsiteViewport()) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  document.querySelector("#website-production-overlay")?.remove();
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  window.location.assign(MOBILE_WEBSITE_URL);
}

// Register before the legacy overlay handler so mobile never mounts the injected workspace.
document.addEventListener("click", routeMobileWebsiteProject, true);

document.documentElement.dataset.mobileWebsiteRoute = MOBILE_WEBSITE_BUILD;
