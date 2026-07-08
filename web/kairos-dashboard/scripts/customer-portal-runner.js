import { recordAction } from "./runtime-actions.js";
import { pushNotification } from "./notifications.js";
import { moveTask } from "./task-board.js";

const portalKey = "kairos.customer.portal.runs.v1";
const profileKey = "kairos.customer.value.profile.v1";
const recommendationKey = "kairos.customer.value.recommendations.v1";

const valueDiscoveryFields = [
  { id: "knowledgeExpertise", label: "Knowledge & Expertise", prompt: "What does this customer already know that could help someone else?" },
  { id: "skills", label: "Skills", prompt: "What practical, creative, technical, professional, or lived skills can be packaged?" },
  { id: "professionalExperience", label: "Professional Experience", prompt: "What work history, trade knowledge, leadership, or business experience creates credibility?" },
  { id: "lifeExperience", label: "Life Experience", prompt: "What lived experience, transformation, lessons, or perspective gives the customer a real point of view?" },
  { id: "interests", label: "Interests", prompt: "What topics, markets, audiences, or creative lanes does the customer care about?" },
  { id: "desiredOutcomes", label: "Desired Outcomes", prompt: "What is the customer trying to build: extra income, audience, product, service, confidence, or a body of work?" }
];

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

function readRuns() {
  return readJson(portalKey, []);
}

export function getCustomerPortalRuns() {
  return readRuns();
}

export function getValueDiscoveryFields() {
  return valueDiscoveryFields;
}

export function getCustomerValueProfile() {
  return readJson(profileKey, {
    knowledgeExpertise: "",
    skills: "",
    professionalExperience: "",
    lifeExperience: "",
    interests: "",
    desiredOutcomes: "",
    updatedAt: null
  });
}

function cleanProfile(input = {}) {
  return valueDiscoveryFields.reduce((profile, field) => {
    profile[field.id] = String(input[field.id] || "").trim();
    return profile;
  }, { updatedAt: new Date().toISOString() });
}

function filledProfileScore(profile) {
  const filled = valueDiscoveryFields.filter(field => String(profile[field.id] || "").trim().length > 0).length;
  return Math.round((filled / valueDiscoveryFields.length) * 100);
}

function splitSignals(value) {
  return String(value || "")
    .split(/[,.\n]/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export function buildKairosRecommendations(profile = getCustomerValueProfile()) {
  const expertise = splitSignals(profile.knowledgeExpertise);
  const skills = splitSignals(profile.skills);
  const interests = splitSignals(profile.interests);
  const outcomes = splitSignals(profile.desiredOutcomes);

  const recommendations = [
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
  ];

  writeJson(recommendationKey, recommendations);
  return recommendations;
}

export function getKairosRecommendations() {
  return readJson(recommendationKey, buildKairosRecommendations());
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
  const run = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: "Customer Portal Build",
    score,
    valueDiscoveryScore: filledProfileScore(profile),
    items: portalBlueprint,
    recommendations,
    createdAt: new Date().toLocaleString()
  };

  writeJson(portalKey, [run, ...readRuns()].slice(0, 10));
  recordAction("Map Customer Portal", `Customer Portal build pass completed with ${score}% readiness and Value Discovery wired into recommendations.`);
  moveTask("TASK-004", "Active");
  pushNotification("Customer Portal build pass completed", `Customer Portal readiness: ${score}%.`, score >= 80 ? "Success" : "Warning");
  return run;
}
