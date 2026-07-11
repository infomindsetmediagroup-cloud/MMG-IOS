import { SESSION_COOKIE, SESSION_TTL_SECONDS, bounded, constantTimeEqual, issueSession, json, readCookie, requireEnv, verifySession } from "./runtime-core.js";

export async function handleSession(request, env) {
  requireEnv(env, ["KAIROS_RUNTIME_TOKEN", "KAIROS_OPERATOR_PASSWORD"]);

  if (request.method === "GET") {
    const current = await verifySession(readCookie(request.headers.get("Cookie"), SESSION_COOKIE), env.KAIROS_RUNTIME_TOKEN);
    return current
      ? json({ status: "authenticated", session: current })
      : json({ status: "unauthenticated", code: "session_required" }, 401);
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return json({ status: "error", code: "invalid_json", message: "Request body must be valid JSON." }, 400); }
    const operator = bounded(body.operator, 80, "operator");
    const accessKey = bounded(body.accessKey, 512, "accessKey");
    if (!constantTimeEqual(accessKey, env.KAIROS_OPERATOR_PASSWORD)) {
      return json({ status: "unauthenticated", code: "invalid_credentials", message: "Operator access was denied." }, 401);
    }
    const issued = await issueSession(operator, env.KAIROS_RUNTIME_TOKEN);
    return json({ status: "authenticated", session: issued.session }, 201, {
      "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(issued.token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`,
    });
  }

  if (request.method === "DELETE") {
    return new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
        "Cache-Control": "no-store",
      },
    });
  }

  return json({ error: { code: "method_not_allowed", message: "Use GET, POST, or DELETE." } }, 405, { Allow: "GET, POST, DELETE" });
}
