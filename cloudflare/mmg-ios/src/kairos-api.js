import { bounded, json, readJson, requireEnv, requireSession, runtimeError } from "./runtime-core.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";

export async function handleKairos(request, env) {
  if (request.method !== "POST") return json({ error: { code: "method_not_allowed", message: "Use POST." } }, 405);
  const session = await requireSession(request, env);
  requireEnv(env, ["OPENAI_API_KEY", "OPENAI_MODEL"]);
  const body = await readJson(request);
  const objective = bounded(body.objective, 8000, "objective");
  const department = typeof body.department === "string" ? body.department.slice(0, 160) : "Executive Office";
  const requestId = crypto.randomUUID();

  const provider = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "X-Client-Request-Id": requestId,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      instructions: [
        "You are Kairos, the MMG operating system.",
        "Return a concise executive response, not a production listing.",
        "Lead with one short decision-oriented paragraph and no more than five brief bullets.",
        "Keep technical implementation detail out of the visible summary unless explicitly requested.",
        "Never claim an external action without direct evidence.",
      ].join(" "),
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: JSON.stringify({
            objective,
            department,
            executionPlan: Array.isArray(body.executionPlan) ? body.executionPlan.slice(0, 8) : [],
            governanceNote: typeof body.governanceNote === "string" ? body.governanceNote.slice(0, 2000) : "",
          }),
        }],
      }],
    }),
  });

  const payload = await safeJson(provider);
  if (!provider.ok) {
    throw runtimeError(provider.status === 429 ? 429 : 502, provider.status === 429 ? "rate_limited" : "provider_error", "Kairos could not complete the provider request.");
  }

  return json({
    message: extractText(payload),
    department,
    requestId,
    auditId: crypto.randomUUID(),
    executionContext: {
      authorizationMode: "session",
      operator: session.operator,
      sessionId: session.sessionId,
    },
  });
}

export async function callStructuredOpenAI(env, instructions, input, schema, schemaName) {
  requireEnv(env, ["OPENAI_API_KEY", "OPENAI_MODEL"]);
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] }],
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
    }),
  });
  const payload = await safeJson(response);
  if (!response.ok) throw runtimeError(response.status === 429 ? 429 : 502, "provider_error", "Kairos could not complete the structured provider request.");
  try { return JSON.parse(extractText(payload)); }
  catch { throw runtimeError(502, "invalid_provider_response", "Kairos returned an invalid structured response."); }
}

function extractText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  throw runtimeError(502, "empty_provider_response", "Kairos returned no usable response.");
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}
