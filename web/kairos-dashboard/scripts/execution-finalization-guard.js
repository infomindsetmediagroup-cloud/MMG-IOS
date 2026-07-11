import { getCommandCenterStore, recordCompletedKnowledge, unlockDependents, updateWorkItem } from "./executive-command-center-store.js";

window.addEventListener("kairos:approved-action-status", event => {
  const { id, status, result, error, phase } = event.detail || {};
  if (!id || phase !== "execute") return;

  if (status === "Completed") {
    const store = getCommandCenterStore();
    const work = store.work.find(item => item.id === id);
    updateWorkItem(id, {
      status: "Completed",
      progress: 100,
      error: "",
      proposal: null,
      evidence: result || null,
      executionCompleted: true,
      updatedAt: "Approved execution completed and verified",
    });
    if (work && result) recordCompletedKnowledge(work, result);
    unlockDependents(id);
    return;
  }

  if (["Needs Attention", "Failed"].includes(status)) {
    updateWorkItem(id, {
      status,
      progress: Number(event.detail?.progress) || 45,
      error: error || "Approved execution failed.",
      executionCompleted: false,
      updatedAt: new Date().toLocaleString(),
    });
  }
}, false);
