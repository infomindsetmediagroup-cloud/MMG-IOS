import { quickLaunchActions, runQuickLaunch } from "./quick-launch.js";
import { runIntentCommand } from "./intent-command.js";
import { pushNotification } from "./notifications.js";

const paletteKey = "kairos.command.palette.v1";

export function getPaletteHistory() {
  try {
    return JSON.parse(localStorage.getItem(paletteKey) || "[]");
  } catch {
    return [];
  }
}

export function savePaletteHistory(entry) {
  const next = [entry, ...getPaletteHistory()].slice(0, 20);
  localStorage.setItem(paletteKey, JSON.stringify(next));
  return next;
}

export function searchPalette(query) {
  const term = String(query || "").toLowerCase();
  if (!term) return quickLaunchActions.slice(0, 8);
  return quickLaunchActions.filter(action => action.title.toLowerCase().includes(term) || action.id.toLowerCase().includes(term));
}

export function executePaletteCommand(command) {
  const text = String(command || "").trim();
  if (!text) return null;

  const direct = quickLaunchActions.find(action => action.id === text || action.title.toLowerCase() === text.toLowerCase());
  const result = direct ? runQuickLaunch(direct.id) : runIntentCommand(text);
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    command: text,
    status: direct ? "Direct" : "Intent",
    createdAt: new Date().toLocaleString()
  };
  savePaletteHistory(entry);
  pushNotification("Palette command executed", text, "Success");
  return { entry, result };
}
