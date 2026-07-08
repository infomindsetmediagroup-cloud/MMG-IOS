import { recordAction } from "./runtime-actions.js";
import { pushNotification } from "./notifications.js";
import { moveTask } from "./task-board.js";

const portalKey = "kairos.customer.portal.runs.v1";
const profileKey = "kairos.customer.value.profile.v1";
const recommendationKey = "kairos.customer.value.recommendations.v1";
const maxPortalRuns = 10;
const maxRecommendations = 12;

const valueDiscoveryFields = [
  { id: "knowledgeExpertise", label: "Knowledge & Expertise", prompt: "What does this customer already know that could help someone else?" },
  { id: "skills", label: "Skills", prompt: "What practical, creative, technical, professional, or lived skills can be packaged?" },
  { id: "professionalExperience", label: "Professional Experience", prompt: "What work history, trade knowledge, leadership, or business experience creates credibility?" },
  { id: "lifeExperience", label: "Life Experience", prompt: "What lived experience, transformation, lessons, or perspective gives the customer a real point of view?" },
  { id: "interests", label: "Interests", prompt: "What topics, markets, audiences, or creative lanes does the customer care about?" },
  { id: "desiredOutcomes", label: "Desired Outcomes", prompt: "What is the customer trying to build: extra income, audience, product, service, confidence, or a body of work?" }
];

const emptyProfile = {
  knowledgeExpertise: "",
  skills: "",
  professionalExperience: "",
  lifeExperience: "",
  interests: "",
  desiredOutcomes: "",
  updatedAt: null,
  completionScore: 0
};

const portalBlueprint = [
  { title: "Portal entry route", status: "Ready", lane: "Access" },
  { title: "Free Vault member account type", status: "Ready", lane: "Accounts" },
  { title: "Product customer account type", status: "Needs Setup", lane: "Accounts" },
  { title: "Value Discovery profile step", status: "Ready", lane: "Onboarding" },
  { title: "Customer knowledge and expertise capture", status: "Ready", lane: "Onboarding" },
  { title: "Desired outcome capture", status: "Ready", lane: "Onboarding" },
  { title: "Kairos recommendation handoff", status: "Ready", lane: "Intelligence" },
  { title: "Download center structure", status: "Needs Setup", lane: "Delivery" },
  { title: "License record template", status: "Needs Setup", lane: "Licensing" },
  { title: "Purchase-to-vault handoff", status: "Needs Setup", lane: "Commerce" },
  { title: "Review follow-up workflow", status: "Needs Setup", lane: "Trust" },
  { title: "Support request intake", status: "Needs Setup", lane: "Support" }
];

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeBlueprintItem(item) {
  return {
    title: String(item?.title || "Untitled Portal Item"),
    status: String(item?.status || "Needs Setup"),
    lane: String(item?.lane || "Portal")
  };
}

function normalizeProfile(input = {}) {
  const base = { ...emptyProfile, ...(input && typeof input === "object" ? input : {}) };
  const profile = valueDiscoveryFields.reduce((next, field) => {
    next[field.id] = String(base[field.id] || "").trim();
    return next;
  }, {});
  profile.updatedAt = base.updatedAt ? String(base.updatedAt) : null;
  profile.completionScore = filledProfileScore(profile);
  return profile;
}

function normalizeRecommendation(item) {
  return {
    title: String(item?.title || "Untitled Recommendation"),
    lane: String(item?.lane || "Guidance"),
    detail: String(item?.detail || "No recommendation detail available yet.")
  };
}

function normalizeRecommendations(items) {
  return Array.isArray(items) ? items.map(normalizeRecommendation).slice(0, maxRecommendations) : [];
}

function normalizeRun(run) {
  const items = Array.isArray(run?.items) ? run.items.map(normalizeBlueprintItem) : portalBlueprint;
  const recommendations = normalizeRecommendations(run?.recommendations);
  const score = Number.isFinite(Number(run?.score)) ? Math.max(0, Math.min(100, Math.round(Number(run.score)))) : Math.round((items.filter(item => item.status === "Ready").length / items.length) * 100);
  const valueDiscoveryScore = Number.isFinite(Number(run?.valueDiscoveryScore)) ? Math.max(0, Math.min(100, Math.round(Number(run.valueDiscoveryScore)))) : 0;
  return {
    id: String(run?.id || makeId()),
    title: String(run?.title || "Customer Portal Build"),
    score,
    valueDiscoveryScore,
    items,
    recommendations,
    createdAt: String(run?.createdAt || new Date().toLocaleString())
  };
}

function readRuns() {
  const stored = readJson(portalKey, []);
  return Array.isArray(stored) ? stored.map(normalizeRun).slice(0, maxPortalRuns) : [];
}

export function getCustomerPortalRuns() {
  return readRuns();
}

export function getValueDiscoveryFields() {
  return valueDiscoveryFields;
}

export function getCustomerValueProfile() {
  return normalizeProfile(readJson(profileKey, emptyProfile));
}

function cleanProfile(input = {}) {
  return {
    ...normalizeProfile(input),
    updatedAt: new Date().toISOString()
  };
}

function filledProfileScore(profile) {
  const filled = valueDiscoveryFields.filter(field => String(profile?.[field.id] || "").trim().length > 0).length;
  return Math.round((filled / valueDiscoveryFields.length) * 100);
}

function splitSignals(value) {
  return String(value || "")
    .split(/[,\.\n]/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export function deriveKairosRecommendations(profile = getCustomerValueProfile()) {
  const normalizedProfile = normalizeProfile(profile);
  const expertise = splitSignals(normalizedProfile.knowledgeExpertise);
  const skills = splitSignals(normalizedProfile.skills);
  const interests = splitSignals(normalizedProfile.interests);
  const outcomes = splitSignals(normalizedProfile.desiredOutcomes);

  return [
    {
      title: "Create a Value Positioning Brief",
      lane: "Identity",
      detail: `Lead with: ${expertise[0] || "the customer's strongest knowledge area"}. Clarify who it helps and why it matters.`
    },
    {
      title: "Build the First Durable Asset",
      lane: "Asset Path",
      detail: `Package ${skills[0] || "the strongest skill"} into a guide, checklist, template, service outline, or content series.`
    },
    {
      title: "Map the Audience Path",
      lane: "Audience",
      detail: `Use ${interests[0] || "the customer's primary interest"} to define the first content lane and teaching angle.`
    },
    {
      title: "Choose the Next Execution Step",
      lane: "Execution",
      detail: `Move toward ${outcomes[0] || "the desired outcome"} with one draft, one review, and one publishable asset.`
    }
  ].map(normalizeRecommendation);
}

export function buildKairosRecommendations(profile = getCustomerValueProfile()) {
  const recommendations = deriveKairosRecommendations(profile);
  writeJson(recommendationKey, recommendations);
  return recommendations;
}

export function getKairosRecommendations() {
  const stored = normalizeRecommendations(readJson(recommendationKey, []));
  return stored.length ? stored : buildKairosRecommendations();
}

export function saveCustomerValueProfile(input) {
  const profile = cleanProfile(input);
  const score = filledProfileScore(profile);
  const profileWithScore = { ...profile, completionScore: score };
  writeJson(profileKey, profileWithScore);
  const recommendations = buildKairosRecommendations(profileWithScore);
  recordAction("Save Value Discovery Profile", `Customer Value Discovery profile saved with ${score}% completion.`);
  moveTask("TASK-004", "Active");
  pushNotification("Value Discovery profile saved", `Kairos generated ${recommendations.length} recommendations.`, score >= 80 ? "Success" : "Warning");
  return { profile: profileWithScore, recommendations };
}

export function runCustomerPortalBuild() {
  const profile = getCustomerValueProfile();
  const recommendations = buildKairosRecommendations(profile);
  const readyCount = portalBlueprint.filter(item => item.status === "Ready").length;
  const score = Math.round((readyCount / portalBlueprint.length) * 100);
  const run = normalizeRun({
    id: makeId(),
    title: "Customer Portal Build",
    score,
    valueDiscoveryScore: filledProfileScore(profile),
    items: portalBlueprint,
    recommendations,
    createdAt: new Date().toLocaleString()
  });

  writeJson(portalKey, [run, ...readRuns()].slice(0, maxPortalRuns));
  recordAction("Map Customer Portal", `Customer Portal build pass completed with ${score}% readiness and Value Discovery wired into recommendations.`);
  moveTask("TASK-004", "Active");
  pushNotification("Customer Portal build pass completed", `Customer Portal readiness: ${score}%.`, score >= 80 ? "Success" : "Warning");
  return run;
}
