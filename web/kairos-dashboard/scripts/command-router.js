import { recordAction } from "./runtime-actions.js";
import { pushNotification } from "./notifications.js";

const commandKey = "kairos.command.router.v1";

const seedCommands = [
  { id: "CMD-WEB-AUDIT", title: "Run Website Audit", route: "Website Ops", status: "Available", description: "Queue site audit, backlog generation, and fix batch review." },
  { id: "CMD-SHOPIFY-PREP", title: "Prepare Shopify Queue", route: "Shopify", status: "Available", description: "Queue product, bundle, review, and discount checks." },
  { id: "CMD-VAULT-BUILD", title: "Build Free Vault", route: "Knowledge", status: "Available", description: "Queue lead magnet and vault access setup." },
  { id: "CMD-REVENUE-CAPTURE", title: "Create Capture Funnel", route: "Revenue", status: "Available", description: "Queue popup, offer, email capture, and conversion path." },
  { id: "CMD-GOLDEN-MASTER", title: "Create Golden Master", route: "System", status: "Available", description: "Create a local runtime snapshot of the current operating state." }
];

function readCommands() {
  try {
    return JSON.parse(localStorage.getItem(commandKey) || "null") || seedCommands;
  } catch {
    return seedCommands;
  }
}

export function getCommands() {
  return readCommands();
}

export function runCommand(id) {
  const command = readCommands().find(item => item.id === id);
  if (!command) return null;
  const event = recordAction(command.title, `${command.route}: ${command.description}`);
  pushNotification("Command routed", `${command.title} routed to ${command.route}.`, "Success");
  return { command, event };
}
