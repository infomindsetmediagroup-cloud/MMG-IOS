import runtime from "./kairos-canonical-shopify-planner-v2.js";

const BUILD = "kairos-canonical-shopify-planner-20260715-3";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/shopify/staging/plan/jobs" && request.method === "POST") {
      const response = await runtime.fetch(request, env, ctx);
      const body = await safeJSON(response.clone());
      if (response.ok && body?.jobID && body?.pollURL && !body?.result) {
        const pollRequest = new Request(new URL(body.pollURL, request.url), {
          method: "GET",
          headers: request.headers,
        });
        const pollResponse = await runtime.fetch(pollRequest, env, ctx);
        const envelope = await safeJSON(pollResponse.clone());
        if (pollResponse.ok && envelope?.status === "completed" && envelope?.result) {
          return json({ ...body, build: BUILD, result: envelope.result, jobEnvelope: envelope }, response.status);
        }
      }
      return stamp(response);
    }
    return stamp(await runtime.fetch(request, env, ctx));
  },
};

async function safeJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Canonical-Planner-Transport", BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Canonical-Planner-Transport": BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
