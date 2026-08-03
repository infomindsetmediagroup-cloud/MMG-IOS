import {
  handleKairosDashboardRequest as handleKairosDashboardV1Request,
  KAIROS_DASHBOARD_BUILD as KAIROS_DASHBOARD_V1_BUILD,
  KAIROS_DASHBOARD_OVERVIEW_PATH,
  KAIROS_DASHBOARD_PATH,
} from "./kairos-dashboard-v1.js";
import { evaluateAutonomousOperationsActivation } from "./autonomy/kairos-autonomous-operations-cycle-v1.js";

export const KAIROS_DASHBOARD_BUILD =
  "kairos-dashboard-20260802-2-shopify-embed";

export { KAIROS_DASHBOARD_OVERVIEW_PATH, KAIROS_DASHBOARD_PATH };

export async function handleKairosDashboardRequest(
  request,
  env = {},
  ctx = {},
  options = {},
) {
  const response = await handleKairosDashboardV1Request(request, env, ctx, options);
  if (!response) return null;

  const headers = new Headers(response.headers);
  headers.delete("X-Frame-Options");
  headers.set("X-Kairos-Dashboard-Build", KAIROS_DASHBOARD_BUILD);

  const method = String(request?.method || "GET").toUpperCase();
  if (method === "HEAD" || response.body === null) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const contentType = String(headers.get("Content-Type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    return upgradeJsonResponse(request, response, headers, env, options);
  }

  if (contentType.includes("text/html")) {
    const body = (await response.text()).replaceAll(
      KAIROS_DASHBOARD_V1_BUILD,
      KAIROS_DASHBOARD_BUILD,
    );
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function upgradeJsonResponse(request, response, headers, env, options) {
  let value;
  try {
    value = JSON.parse(await response.text());
  } catch {
    return new Response(JSON.stringify({
      ok: false,
      build: KAIROS_DASHBOARD_BUILD,
      error: {
        code: "DASHBOARD_INVALID_RESPONSE",
        message: "The dashboard generated an invalid internal response.",
      },
    }), {
      status: 502,
      headers,
    });
  }

  if (isPlainObject(value)) {
    value.build = KAIROS_DASHBOARD_BUILD;
  }

  let pathname = "";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    pathname = "";
  }

  if (
    pathname === KAIROS_DASHBOARD_OVERVIEW_PATH
    && isPlainObject(value)
    && value.ok === true
  ) {
    const operationsEnv = readOwnValue(options, "operationsEnv") || env;
    let activation = null;
    try {
      activation = evaluateAutonomousOperationsActivation(operationsEnv, {
        workflowResolver: readOwnValue(options, "workflowResolver"),
      });
    } catch {
      activation = null;
    }

    const existingAutonomy = isPlainObject(value.autonomy)
      ? value.autonomy
      : Object.create(null);
    value.autonomy = {
      ...existingAutonomy,
      activationGate: "business-operations-v1",
      activationGateMatched: Boolean(activation?.projection?.activationGateMatched),
      ledgerConfigured: Boolean(activation?.projection?.ledgerConfigured),
      certificationComplete: Boolean(activation?.projection?.certificationComplete),
    };
  }

  return new Response(JSON.stringify(value), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function readOwnValue(options, key) {
  if (!options || typeof options !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    return descriptor && Object.hasOwn(descriptor, "value")
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}
