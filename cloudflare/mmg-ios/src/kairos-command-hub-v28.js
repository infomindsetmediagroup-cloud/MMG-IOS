import runtime from "./kairos-kernel-worker-v25.js";

const BUILD = "kairos-command-hub-20260712-28";
const ACTIONS = new Set([
  "knowledge-library",
  "research-brief",
  "decision-record",
  "publishing-studio",
  "creative-studio",
  "product-launch",
  "revenue-intelligence",
  "growth-plan",
  "visitor-activity",
  "customer-portal",
  "deliverables",
  "work-queue",
  "release-control",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/hub/run" && request.method === "POST") return run(request, env);

    const response = await runtime.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safe(response.clone());
      body.build = BUILD;
      body.kernel = "command-hub-v28";
      body.capabilities = {
        ...(body.capabilities || {}),
        commandHubActions: "available",
        homepageRetoolWithoutOpenAIAPI: "operational",
      };
      return json(body, response.status);
    }
    return retag(response);
  },
};

async function run(request, env) {
  try {
    const payload = await request.json();
    const action = String(payload?.action || "");
    const objective = String(payload?.objective || "").trim();
    if (!ACTIONS.has(action)) return json({ error: { message: "This action is unavailable." } }, 404);
    if (objective.length < 3 || objective.length > 8000) return json({ error: { message: "Enter a clear objective for Kairos." } }, 400);
    if (!env.OPENAI_API_KEY) return json({ error: { message: "Kairos intelligence is not configured for this command-hub action." } }, 503);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: String(env.OPENAI_MODEL || "gpt-5.6"),
        instructions: `You are Kairos, the intelligence operating system for Mindset Media Group. Complete the requested ${title(action)} as a finished, production-ready internal deliverable. Apply MMG doctrine: cohesive ecosystem, experience-first, visible progress, knowledge stewardship, premium brand, customer value, concise executive communication, and evidence-backed claims. Do not expose internal routing. Do not claim external actions or analytics without evidence. Return the usable deliverable, not advice about creating it.`,
        input: objective,
        max_output_tokens: 3000,
      }),
      signal: AbortSignal.timeout(110000),
    });
    const body = await safe(response);
    if (!response.ok) return json({ error: { message: String(body?.error?.message || "Kairos could not complete this action.") } }, response.status);
    return json({
      status: "completed",
      action,
      title: title(action),
      summary: `${title(action)} completed.`,
      deliverable: text(body),
      completedAt: new Date().toISOString(),
      evidence: { responseID: body.id || null, build: BUILD },
    });
  } catch (error) {
    return json({ error: { message: error?.name === "TimeoutError" ? "Kairos is still working. Try again." : "Kairos could not complete this action." } }, 500);
  }
}

function title(action) {
  return action.split("-").map(part => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function text(body) {
  return body?.output_text || (body?.output || []).flatMap(item => item?.content || []).filter(item => item?.type === "output_text").map(item => item.text).join("\n\n") || "No readable deliverable returned.";
}

async function safe(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function retag(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Kernel", "command-hub-v28");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": BUILD } });
}
