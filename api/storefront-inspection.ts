import type { VercelRequest, VercelResponse } from "@vercel/node";
import { inspectStorefront } from "./storefront-inspection-core.js";
import { readCookie, SESSION_COOKIE_NAME, verifyOperatorSession } from "./session-core.js";

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ status: "error", code: "method_not_allowed" });
    return;
  }

  const runtimeToken = process.env.KAIROS_RUNTIME_TOKEN?.trim();
  if (!runtimeToken) {
    response.status(503).json({ status: "error", code: "runtime_not_configured" });
    return;
  }

  const cookie = firstHeaderValue(request.headers.cookie);
  const sessionToken = readCookie(cookie, SESSION_COOKIE_NAME);
  const session = verifyOperatorSession(sessionToken, runtimeToken);
  if (!session) {
    response.status(401).json({ status: "error", code: "session_required" });
    return;
  }

  try {
    const requestedLimit = isRecord(request.body) && typeof request.body.limit === "number" ? request.body.limit : 40;
    const inspection = await inspectStorefront(requestedLimit);
    response.status(200).json({ status: "complete", inspection, executionContext: { subject: session.sub, role: session.role, sessionId: session.sessionId } });
  } catch (error) {
    response.status(502).json({
      status: "error",
      code: "inspection_failed",
      message: error instanceof Error ? error.message : "Storefront inspection failed.",
    });
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
