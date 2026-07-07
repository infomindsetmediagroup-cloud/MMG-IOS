import { saveRuntimeStore } from "./runtime-store.js";
import { saveTasks } from "./task-board.js";
import { pushNotification } from "./notifications.js";

export function importRuntimePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Kairos runtime payload.");
  }

  if (payload.runtime) saveRuntimeStore(payload.runtime);
  if (Array.isArray(payload.tasks)) saveTasks(payload.tasks);

  if (Array.isArray(payload.actions)) {
    localStorage.setItem("kairos.action.log.v1", JSON.stringify(payload.actions.slice(0, 20)));
  }

  if (Array.isArray(payload.notifications)) {
    localStorage.setItem("kairos.notifications.v1", JSON.stringify(payload.notifications.slice(0, 16)));
  }

  pushNotification("Runtime import complete", "Kairos browser runtime was restored from JSON.", "Success");
  return true;
}

export function readImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
