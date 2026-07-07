import { pushNotification } from "./notifications.js";

const densityKey = "kairos.display.density.v1";

const densities = [
  { id: "comfortable", label: "Comfortable", detail: "Standard command center spacing." },
  { id: "compact", label: "Compact", detail: "Condensed cards and lists for faster scanning." },
  { id: "mobile", label: "Mobile", detail: "Touch-first density for phone operation." }
];

export function getDisplayDensity() {
  return localStorage.getItem(densityKey) || "comfortable";
}

export function setDisplayDensity(density) {
  const next = densities.some(item => item.id === density) ? density : "comfortable";
  localStorage.setItem(densityKey, next);
  document.body.dataset.density = next;
  pushNotification("Display density changed", `Kairos density set to ${next}.`, "Success");
  return next;
}

export function initializeDisplayDensity() {
  document.body.dataset.density = getDisplayDensity();
}

export function getDisplayDensityOptions() {
  return densities;
}
