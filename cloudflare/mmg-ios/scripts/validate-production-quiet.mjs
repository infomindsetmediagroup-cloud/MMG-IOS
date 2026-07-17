import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUILD = "kairos-production-validation-orchestrator-20260717-1";
const here = dirname(fileURLToPath(import.meta.url));
const validators = [
  "validate-production-baseline.mjs",
  "validate-workflow-runtime.mjs",
  "validate-objective-router.mjs",
  "validate-creative-studio.mjs",
  "validate-publishing-studio.mjs",
  "validate-product-launch-studio.mjs",
  "validate-revenue-intelligence.mjs",
  "validate-growth-plan.mjs",
  "validate-offer-builder.mjs",
  "validate-campaign-operations.mjs",
  "validate-visitor-activity.mjs",
  "validate-customer-journey.mjs",
  "validate-customer-portal.mjs",
  "validate-deliverables.mjs",
  "validate-autonomous-prompt-controller.mjs",
  "validate-whole-homepage-planner.mjs",
];

const completed = [];
for (const validator of validators) {
  const result = spawnSync(process.execPath, [join(here, validator)], {
    cwd: join(here, ".."),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.status !== 0) {
    console.error(`[validate:production] ${BUILD} FAILED: ${validator}`);
    if (result.stdout?.trim()) console.error(result.stdout.trim());
    if (result.stderr?.trim()) console.error(result.stderr.trim());
    process.exit(result.status || 1);
  }
  completed.push(validator);
}

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  validatorsPassed: completed.length,
  validators: completed,
}, null, 2));
