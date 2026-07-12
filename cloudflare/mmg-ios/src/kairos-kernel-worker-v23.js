import kernel from "./kairos-kernel-worker-v22.js";

const BUILD = "kairos-kernel-20260712-23";
const JOB_TTL_SECONDS = 3600;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/execute/jobs" && request.method === "POST") {
      return submitAndPreserve(request, env, ctx);
    }

    const match = url.pathname.match(/^\/api\/shopify\/staging\/execute\/jobs\/([a-f0-9-]+)$/i);
    if (match && request.method === "GET") {
      return pollWithDiagnostics(request, env, ctx, match[1]);
    }

    const response = await kernel.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v23";
      body.capabilities = {
        ...(body.capabilities || {}),
        openaiExecutionFailureDiagnostics: "available",
      };
      return json(body, response.status);
    }
    return retag(response);
  },
};

async function submitAndPreserve(request, env, ctx) {
  const bodyText = await request.text();
  const delegated = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: bodyText,
  });
  const response = await kernel.fetch(delegated, env, ctx);
  const body = await safeJSON(response.clone());

  if (response.ok && body?.jobID) {
    const pollURL = new URL(body.pollURL || `/api/shopify/staging/execute/jobs/${body.jobID}`, request.url);
    const firstPoll = await kernel.fetch(new Request(pollURL, {
      method: "GET",
      headers: { Accept: "application/json", "X-MMG-Internal": BUILD },
    }), env, ctx);
    const firstState = await safeJSON(firstPoll);
    if (firstState?.openaiResponseID) {
      await caches.default.put(metadataRequest(request, body.jobID), new Response(JSON.stringify({
        jobID: body.jobID,
        openaiResponseID: firstState.openaiResponseID,
        savedAt: new Date().toISOString(),
      }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`,
        },
      }));
    }
  }

  return retag(response);
}

async function pollWithDiagnostics(request, env, ctx, jobID) {
  const response = await kernel.fetch(request, env, ctx);
  const body = await safeJSON(response.clone());

  if (body?.status !== "needs-attention" || body?.error?.code !== "openai_background_execution_failed") {
    return retag(response);
  }

  const metadataResponse = await caches.default.match(metadataRequest(request, jobID));
  const metadata = metadataResponse ? await safeJSON(metadataResponse) : {};
  const responseID = metadata?.openaiResponseID;
  const apiKey = String(env.OPENAI_API_KEY || "").trim();

  if (!responseID || !apiKey) return retag(response);

  try {
    const openaiResponse = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(responseID)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const openaiBody = await safeJSON(openaiResponse);
    const detail = extractOpenAIError(openaiBody);
    if (!detail) return retag(response);

    body.build = BUILD;
    body.kernel = "standalone-v23";
    body.error = {
      ...(body.error || {}),
      message: detail,
      openaiStatus: String(openaiBody?.status || "failed"),
      openaiResponseID: responseID,
    };
    body.summary = "OpenAI execution generation failed before any Shopify write. Exact failure details are shown below.";
    return json(body, Number(body?.httpStatus || 502));
  } catch {
    return retag(response);
  }
}

function extractOpenAIError(body) {
  const values = [
    body?.error?.message,
    body?.last_error?.message,
    body?.incomplete_details?.reason,
    body?.status_details?.message,
  ].filter(value => typeof value === "string" && value.trim());
  return values.length ? values.join(" | ").slice(0, 1800) : "";
}

function metadataRequest(request, jobID) {
  return new Request(new URL(`/_kairos/execution-job-metadata/${jobID}`, request.url).toString(), { method: "GET" });
}

function retag(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Kernel", "standalone-v23");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function safeJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { raw: text.slice(0, 2000) }; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Kernel": "standalone-v23",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
