import { evaluatePolicy } from "./kairos-policy-engine-v1.js";

export const KAIROS_WEBSITE_HEALTH_WORKFLOW_BUILD = "kairos-website-health-workflow-v1";

const WORKFLOW_ID = "website.health.v1";
const AGENT_ID = "website-operations-agent.v1";
const DEFAULT_TARGET_URL = "https://themindsetmediagroup.com/";
const DEFAULT_ALLOWED_ORIGIN = "https://themindsetmediagroup.com";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BODY_BYTES = 262_144;
const MAX_REDIRECTS = 3;

export async function executeWebsiteHealthWorkflow(input = {}, env = {}, options = {}) {
  const environment = env.KAIROS_ENVIRONMENT || "production";
  const globalKillSwitch = env.KAIROS_KILL_SWITCH || "disabled";
  const checkedAt = nowIso(options.now);

  const inspectionPolicy = evaluatePolicy({
    agent: AGENT_ID,
    workflowId: WORKFLOW_ID,
    action: "website.inspect",
    riskClass: "low",
    environment,
    globalKillSwitch,
  });

  if (inspectionPolicy.decision !== "ALLOW_AUTONOMOUS") {
    return {
      workflowId: WORKFLOW_ID,
      status: "blocked",
      policyDecision: inspectionPolicy,
      checkedAt,
      build: KAIROS_WEBSITE_HEALTH_WORKFLOW_BUILD,
    };
  }

  const allowedOrigins = parseAllowedOrigins(env.KAIROS_WEBSITE_HEALTH_ALLOWED_ORIGINS);
  const target = validateTargetUrl(input.targetUrl || DEFAULT_TARGET_URL, allowedOrigins);
  if (!target.valid) {
    return {
      workflowId: WORKFLOW_ID,
      status: "rejected",
      error: {
        code: target.code,
        message: target.error,
      },
      policyDecision: inspectionPolicy,
      checkedAt,
      build: KAIROS_WEBSITE_HEALTH_WORKFLOW_BUILD,
    };
  }

  const timeoutMs = boundedInteger(
    options.timeoutMs ?? env.KAIROS_WEBSITE_HEALTH_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    100,
    30_000,
  );
  const maxBodyBytes = boundedInteger(
    options.maxBodyBytes ?? env.KAIROS_WEBSITE_HEALTH_MAX_BODY_BYTES,
    DEFAULT_MAX_BODY_BYTES,
    1_024,
    1_048_576,
  );

  const healthCheckResult = await performHealthChecks(target.url, {
    allowedOrigins,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    maxBodyBytes,
    timeoutMs,
  });

  if (healthCheckResult.status === "healthy") {
    return {
      workflowId: WORKFLOW_ID,
      status: "passed",
      targetUrl: target.url.href,
      incidentsDetected: 0,
      healthCheck: healthCheckResult,
      policyDecision: inspectionPolicy,
      checkedAt,
      build: KAIROS_WEBSITE_HEALTH_WORKFLOW_BUILD,
    };
  }

  const incident = classifyIncident(healthCheckResult, options.randomUUID);
  const incidentPolicy = evaluatePolicy({
    agent: AGENT_ID,
    workflowId: WORKFLOW_ID,
    action: "incident.record",
    riskClass: "low",
    environment,
    globalKillSwitch,
  });
  const proposalPolicy = evaluatePolicy({
    agent: AGENT_ID,
    workflowId: WORKFLOW_ID,
    action: "repair.propose",
    riskClass: "low",
    environment,
    globalKillSwitch,
  });

  const proposal = proposalPolicy.decision === "ALLOW_AUTONOMOUS"
    ? generateRepairProposal(incident, options.randomUUID)
    : null;

  const auditPersistence = incidentPolicy.decision === "ALLOW_AUTONOMOUS"
    ? await persistIncident(env.KAIROS_AUTONOMY_AUDIT, incident, proposal)
    : { status: "skipped", reason: incidentPolicy.reasonCode };

  return {
    workflowId: WORKFLOW_ID,
    status: "degraded",
    targetUrl: target.url.href,
    incident,
    proposal,
    policyDecisions: {
      inspect: inspectionPolicy,
      recordIncident: incidentPolicy,
      proposeRepair: proposalPolicy,
    },
    auditPersistence,
    recordedAt: checkedAt,
    build: KAIROS_WEBSITE_HEALTH_WORKFLOW_BUILD,
  };
}

async function performHealthChecks(initialUrl, options) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("website_health_timeout"), options.timeoutMs);
  let currentUrl = initialUrl;

  try {
    if (typeof options.fetchImpl !== "function") {
      return unhealthy("FETCH_UNAVAILABLE", { error: "Fetch is unavailable in the current runtime." }, startedAt);
    }

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const request = new Request(currentUrl.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const response = await options.fetchImpl(request);

      if (isRedirect(response.status)) {
        if (redirectCount === MAX_REDIRECTS) {
          return unhealthy("TOO_MANY_REDIRECTS", { statusCode: response.status }, startedAt);
        }

        const location = response.headers.get("Location");
        if (!location) {
          return unhealthy("INVALID_REDIRECT", { statusCode: response.status }, startedAt);
        }

        const nextUrl = new URL(location, currentUrl);
        if (!isAllowedUrl(nextUrl, options.allowedOrigins)) {
          return unhealthy(
            "REDIRECT_TARGET_NOT_ALLOWED",
            { statusCode: response.status, redirectOrigin: nextUrl.origin },
            startedAt,
          );
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        return unhealthy("HTTP_ERROR", { statusCode: response.status }, startedAt);
      }

      const contentType = response.headers.get("Content-Type") || "";
      if (contentType && !contentType.toLowerCase().includes("text/html")) {
        return unhealthy("UNEXPECTED_CONTENT_TYPE", { statusCode: response.status, contentType }, startedAt);
      }

      const body = await readBoundedText(response, options.maxBodyBytes);
      const normalized = body.text.toLowerCase();
      const containsErrorShell = normalized.includes("<title>error</title>")
        || normalized.includes("cf-error-details")
        || normalized.includes("application error")
        || normalized.includes("internal server error");

      if (!body.text || body.text.trim().length < 100 || containsErrorShell) {
        return unhealthy(
          "BLANK_OR_ERROR_SHELL",
          {
            statusCode: response.status,
            bodyBytes: body.bytes,
            bodyTruncated: body.truncated,
          },
          startedAt,
        );
      }

      return {
        status: "healthy",
        statusCode: response.status,
        finalUrl: currentUrl.href,
        bodyBytesInspected: body.bytes,
        bodyTruncated: body.truncated,
        latencyMs: Date.now() - startedAt,
      };
    }

    return unhealthy("TOO_MANY_REDIRECTS", {}, startedAt);
  } catch (error) {
    const timedOut = controller.signal.aborted;
    return unhealthy(
      timedOut ? "TIMEOUT" : "NETWORK_ERROR",
      {
        error: timedOut
          ? `Health check exceeded ${options.timeoutMs}ms.`
          : error instanceof Error
            ? error.message
            : "Unknown network failure.",
      },
      startedAt,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedText(response, maxBodyBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    const encoded = new TextEncoder().encode(text);
    return {
      text: new TextDecoder().decode(encoded.slice(0, maxBodyBytes)),
      bytes: Math.min(encoded.byteLength, maxBodyBytes),
      truncated: encoded.byteLength > maxBodyBytes,
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    const remaining = maxBodyBytes - bytes;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel("body_limit_reached");
      break;
    }

    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    bytes += chunk.byteLength;

    if (value.byteLength > remaining) {
      truncated = true;
      await reader.cancel("body_limit_reached");
      break;
    }
  }

  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder().decode(combined),
    bytes,
    truncated,
  };
}

function classifyIncident(result, randomUUID) {
  const incidentClass = result.statusCode
    ? `HTTP_${result.statusCode}`
    : INCIDENT_CLASS_BY_REASON[result.reason] || "NETWORK_ERROR";

  return {
    incidentId: `inc_${secureUuid(randomUUID)}`,
    class: incidentClass,
    reason: result.reason,
    details: result,
  };
}

function generateRepairProposal(incident, randomUUID) {
  const remediation = REMEDIATION_BY_CLASS[incident.class]
    || REMEDIATION_BY_REASON[incident.reason]
    || [
      "Inspect the latest Worker and storefront deployment evidence.",
      "Reproduce the failure in a non-production environment.",
      "Prepare a reversible pull request; do not deploy without required approval.",
    ];

  return {
    proposalId: `prop_${secureUuid(randomUUID)}`,
    incidentId: incident.incidentId,
    title: `Repair proposal for ${incident.class}`,
    steps: remediation,
    riskClass: "low",
    executionAuthorized: false,
  };
}

async function persistIncident(binding, incident, proposal) {
  if (!binding || typeof binding.put !== "function") {
    return { status: "not_configured" };
  }

  try {
    await binding.put(
      `website-health/${incident.incidentId}`,
      JSON.stringify({ incident, proposal }),
      { expirationTtl: 60 * 60 * 24 * 90 },
    );
    return { status: "recorded" };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Incident persistence failed.",
    };
  }
}

function parseAllowedOrigins(value) {
  const configured = typeof value === "string"
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  const origins = configured.length ? configured : [DEFAULT_ALLOWED_ORIGIN];
  return new Set(origins.map((origin) => new URL(origin).origin));
}

function validateTargetUrl(value, allowedOrigins) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return { valid: false, code: "TARGET_PROTOCOL_NOT_ALLOWED", error: "Website health targets must use HTTPS." };
    }
    if (!isAllowedUrl(url, allowedOrigins)) {
      return { valid: false, code: "TARGET_ORIGIN_NOT_ALLOWED", error: `Target origin ${url.origin} is not allowlisted.` };
    }
    return { valid: true, url };
  } catch {
    return { valid: false, code: "INVALID_TARGET_URL", error: "The website health target URL is invalid." };
  }
}

function isAllowedUrl(url, allowedOrigins) {
  return url.protocol === "https:" && allowedOrigins.has(url.origin);
}

function isRedirect(status) {
  return status >= 300 && status < 400;
}

function unhealthy(reason, details, startedAt) {
  return {
    status: "unhealthy",
    reason,
    ...details,
    latencyMs: Date.now() - startedAt,
  };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(numeric)));
}

function nowIso(now) {
  const value = now instanceof Date ? now : typeof now === "function" ? now() : new Date();
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString();
}

function secureUuid(randomUUID) {
  const generator = randomUUID || (() => globalThis.crypto.randomUUID());
  return generator();
}

const INCIDENT_CLASS_BY_REASON = Object.freeze({
  TIMEOUT: "TIMEOUT",
  NETWORK_ERROR: "NETWORK_ERROR",
  BLANK_OR_ERROR_SHELL: "CONTENT_INVALID",
  UNEXPECTED_CONTENT_TYPE: "CONTENT_INVALID",
  REDIRECT_TARGET_NOT_ALLOWED: "SECURITY_POLICY",
  INVALID_REDIRECT: "CONTENT_INVALID",
  TOO_MANY_REDIRECTS: "REDIRECT_LOOP",
  FETCH_UNAVAILABLE: "RUNTIME_CONFIGURATION",
});

const REMEDIATION_BY_CLASS = Object.freeze({
  HTTP_500: [
    "Inspect the latest Cloudflare Worker deployment logs and status checks.",
    "Reproduce against the prior known-good Worker version.",
    "Prepare a rollback or corrective pull request for executive approval.",
  ],
  HTTP_502: [
    "Inspect Cloudflare edge and upstream origin availability.",
    "Confirm DNS and Shopify storefront routing are intact.",
    "Prepare a reversible infrastructure repair for approval.",
  ],
  HTTP_503: [
    "Inspect Worker and storefront service availability.",
    "Verify the most recent deployment and dependent bindings.",
    "Prepare a reversible rollback or corrective pull request for approval.",
  ],
  TIMEOUT: [
    "Inspect DNS, Cloudflare edge, Worker execution, and storefront response latency.",
    "Compare the current deployment with the last known-good version.",
    "Prepare a bounded timeout or rollback repair for approval.",
  ],
  CONTENT_INVALID: [
    "Verify the storefront returned the expected HTML shell and required page markers.",
    "Inspect asset routing and Worker-first path handling.",
    "Prepare a content-shell repair with browser regression coverage.",
  ],
  SECURITY_POLICY: [
    "Do not follow the non-allowlisted redirect.",
    "Inspect storefront redirect configuration and DNS records.",
    "Require executive approval before changing routing or allowlists.",
  ],
});

const REMEDIATION_BY_REASON = Object.freeze({
  NETWORK_ERROR: [
    "Inspect DNS resolution, TLS negotiation, Cloudflare edge status, and upstream availability.",
    "Re-run the bounded health check from a controlled environment.",
    "Prepare a reversible repair only after the failure is reproduced.",
  ],
  REDIRECT_LOOP: [
    "Inspect Shopify and Cloudflare redirect rules for a cycle.",
    "Identify the last known-good routing configuration.",
    "Prepare a narrowly scoped redirect correction for approval.",
  ],
});
