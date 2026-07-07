import { runQuickLaunch } from "./quick-launch.js";
import { queueOfflineCommand } from "./offline-queue.js";
import { pushNotification } from "./notifications.js";

const intentMap = [
  { patterns: ["audit", "website", "site"], action: "site-audit", label: "Website Audit" },
  { patterns: ["shopify", "commerce", "judge", "review"], action: "shopify", label: "Shopify Preflight" },
  { patterns: ["revenue", "funnel", "popup", "discount", "email"], action: "revenue", label: "Revenue Funnel" },
  { patterns: ["bundle", "package"], action: "bundle", label: "Bundle Builder" },
  { patterns: ["vault", "lead magnet", "free"], action: "vault", label: "Free Vault" },
  { patterns: ["knowledge", "taxonomy", "article", "library"], action: "knowledge", label: "Knowledge Taxonomy" },
  { patterns: ["customer", "portal", "license", "download"], action: "customer", label: "Customer Portal" },
  { patterns: ["milestone", "validate", "validation"], action: "milestone", label: "Milestone Validation" },
  { patterns: ["golden", "snapshot", "baseline"], action: "golden", label: "Golden Master" }
];

export function resolveIntentCommand(input) {
  const text = String(input || "").toLowerCase();
  return intentMap.find(item => item.patterns.some(pattern => text.includes(pattern))) || null;
}

export function runIntentCommand(input) {
  const intent = resolveIntentCommand(input);
  if (!intent) {
    queueOfflineCommand("Unresolved Operator Command", input || "No command text provided.");
    pushNotification("Command queued for routing", "Kairos could not resolve the intent, so it was queued offline.", "Warning");
    return { status: "Queued", intent: null };
  }

  const result = runQuickLaunch(intent.action);
  pushNotification("Intent command executed", `${intent.label} matched and executed.`, "Success");
  return { status: "Executed", intent, result };
}
