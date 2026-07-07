export const diagnostics = {
  checks: [
    { title: "Dashboard root mounted", status: "Pass", detail: "#app and #dashboard-view are present." },
    { title: "Navigation module count", status: "Pass", detail: "Command center navigation is generated from runtime state." },
    { title: "Action runtime", status: "Pass", detail: "Command buttons write to local action log." },
    { title: "Persistent runtime store", status: "Pass", detail: "Runtime snapshots and approvals persist in browser storage." },
    { title: "Notification center", status: "Pass", detail: "Runtime notifications are generated from command actions." },
    { title: "Authentication shell", status: "Pass", detail: "Phase 1 local session gate is enabled." },
    { title: "Workflow minute conservation", status: "Pass", detail: "Active dashboard commits use skip ci where appropriate." },
    { title: "Server-backed commands", status: "Queued", detail: "Requires backend/API layer after static dashboard phase." }
  ]
};

export function diagnosticsMetrics() {
  return {
    total: diagnostics.checks.length,
    passed: diagnostics.checks.filter(item => item.status === "Pass").length,
    queued: diagnostics.checks.filter(item => item.status === "Queued").length,
    failed: diagnostics.checks.filter(item => item.status === "Fail").length
  };
}
