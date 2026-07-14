import { spawnSync } from "node:child_process";

const scripts = [
  "validate-operational-workspaces.mjs",
  "validate-production-baseline.mjs",
  "validate-workflow-runtime.mjs",
  "validate-objective-router.mjs",
  "validate-readiness-priority.mjs",
  "validate-readiness-advancement-register.mjs",
  "validate-readiness-verification.mjs",
  "validate-readiness-promotion.mjs",
  "validate-readiness-registry.mjs",
  "validate-readiness-post-verification.mjs",
  "validate-readiness-center-certification.mjs",
  "validate-readiness-system-certification.mjs",
  "validate-readiness-operational-assurance.mjs",
  "validate-readiness-operational-remediation.mjs",
  "validate-readiness-recovery-verification.mjs",
  "validate-readiness-assurance-renewal.mjs",
  "validate-readiness-certification-applicability.mjs",
  "validate-readiness-recertification.mjs",
  "validate-readiness-certificate-succession.mjs",
  "validate-executive-simple-mode.mjs",
  "validate-milestone-foundation-baseline.mjs",
  "validate-customer-experience-batch.mjs",
  "validate-customer-evidence-batch.mjs",
  "validate-content-production-batch.mjs",
  "validate-business-offer-launch-batch.mjs",
  "validate-business-growth-campaign-batch.mjs",
  "validate-business-revenue-decision-batch.mjs",
  "validate-knowledge-operations-batch.mjs",
  "validate-research-synthesis-batch.mjs",
  "validate-decision-record-operations.mjs",
  "validate-social-campaign-operations.mjs",
];

const failures = [];
const passed = [];
for (const script of scripts) {
  const result = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status === 0) {
    passed.push(script);
    continue;
  }
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const lines = combined.split(/\r?\n/).filter(Boolean);
  failures.push({ script, exitCode: result.status, evidence: lines.slice(-18) });
}

console.log(JSON.stringify({
  status: failures.length ? "failed" : "ready",
  runner: "kairos-production-validation-suite-20260714-2",
  total: scripts.length,
  passed: passed.length,
  failed: failures.length,
  passedScripts: passed,
  failures,
}, null, 2));

if (failures.length) process.exit(1);
