#!/usr/bin/env node

const endpoint = process.env.KAIROS_RUNTIME_BASE_URL?.replace(/\/$/, "");
const token = process.env.KAIROS_RUNTIME_TOKEN;

if (!endpoint) {
  console.error("KAIROS_RUNTIME_BASE_URL is required.");
  process.exit(2);
}

if (!token) {
  console.error("KAIROS_RUNTIME_TOKEN is required.");
  process.exit(2);
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  const healthResponse = await fetch(`${endpoint}/api/health`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const healthBody = await readJSON(healthResponse);

  if (!healthResponse.ok || healthBody.status !== "ready") {
    console.error("Kairos health check failed.", {
      status: healthResponse.status,
      body: healthBody,
    });
    process.exit(1);
  }

  const runtimeResponse = await fetch(`${endpoint}/api/kairos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      objective: "Return a concise confirmation that the Kairos live runtime smoke test completed successfully.",
      department: "Executive Operations",
      routingConfidence: 1,
      executionPlan: [
        "Validate the authorized production request path.",
        "Return a concise non-fabricated confirmation.",
      ],
      governanceNote: "This is an automated production smoke test. Do not claim any external action was completed.",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const runtimeBody = await readJSON(runtimeResponse);

  if (
    !runtimeResponse.ok ||
    typeof runtimeBody.message !== "string" ||
    !runtimeBody.message.trim() ||
    typeof runtimeBody.requestId !== "string" ||
    typeof runtimeBody.auditId !== "string"
  ) {
    console.error("Kairos authorized runtime request failed.", {
      status: runtimeResponse.status,
      body: runtimeBody,
    });
    process.exit(1);
  }

  console.log("Kairos live runtime smoke test passed.", {
    department: runtimeBody.department,
    requestId: runtimeBody.requestId,
    auditId: runtimeBody.auditId,
  });
}

main().catch((error) => {
  console.error("Kairos live runtime smoke test encountered an unexpected failure.", {
    name: error?.name,
    message: error?.message,
  });
  process.exit(1);
});
