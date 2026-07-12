import kernel from "./kairos-kernel-worker-v19.js";

const BUILD = "kairos-kernel-20260712-20";

export default {
  async fetch(request, env, ctx) {
    const response = await kernel.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-v20");

    if (new URL(request.url).pathname === "/api/health" || new URL(request.url).pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v20";
      body.experience = {
        ...(body.experience || {}),
        legacyStagingApprovalFlow: "disabled",
        guidedWebsiteApprovalFlow: "exclusive",
      };
      return json(body, response.status);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

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
      "X-Kairos-Kernel": "standalone-v20",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
