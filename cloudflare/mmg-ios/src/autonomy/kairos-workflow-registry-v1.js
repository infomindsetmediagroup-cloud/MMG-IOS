const WORKFLOW_REGISTRY = deepFreeze({
  "website.health.v1": {
    workflowId: "website.health.v1",
    version: 1,
    status: "active",
    owner: "Web Operations",
    riskClass: "low",
    agents: ["website-operations-agent.v1"],
    environments: ["development", "staging", "production"],
    triggers: ["website.health.schedule", "website.health.manual"],
    capabilities: [
      "website.read",
      "website.test",
      "github.issue.create",
      "github.branch.prepare",
      "github.pull_request.prepare",
    ],
    autonomousActions: [
      "website.inspect",
      "incident.record",
      "repair.propose",
    ],
    approvalRequiredActions: [
      "github.merge",
      "cloudflare.deploy.production",
    ],
    blockedActions: [
      "shopify.price.change",
      "shopify.product.publish",
      "customer.email.send",
    ],
  },
});

export function getWorkflowDefinition(workflowId) {
  if (typeof workflowId !== "string" || !workflowId.trim()) return null;
  const workflow = WORKFLOW_REGISTRY[workflowId.trim()];
  if (!workflow || workflow.status !== "active") return null;
  return workflow;
}

export function listActiveWorkflows() {
  return Object.values(WORKFLOW_REGISTRY).filter((workflow) => workflow.status === "active");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
