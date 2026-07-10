import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  clearedSessionCookie,
  issueOperatorSession,
  readCookie,
  SESSION_COOKIE_NAME,
  sessionCookie,
  verifyOperatorPassword,
  verifyOperatorSession,
} from "./session-core.js";

export default function handler(request: VercelRequest, response: VercelResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  const runtimeToken = process.env.KAIROS_RUNTIME_TOKEN?.trim();
  const passwordHash = process.env.KAIROS_OPERATOR_PASSWORD_HASH?.trim();
  if (!runtimeToken || !passwordHash) {
    response.status(503).json({
      status: "error",
      code: "session_unavailable",
      message: "Kairos operator authentication is not configured.",
    });
    return;
  }

  if (request.method === "GET") {
    const token = readCookie(firstHeaderValue(request.headers.cookie), SESSION_COOKIE_NAME);
    const session = verifyOperatorSession(token, runtimeToken);
    if (!session) {
      response.status(401).json({ status: "unauthenticated", code: "session_required" });
      return;
    }
    response.status(200).json({ status: "authenticated", session });
    return;
  }

  if (request.method === "POST") {
    const body = isRecord(request.body) ? request.body : {};
    const operator = typeof body.operator === "string" ? body.operator : "";
    const password = typeof body.accessKey === "string" ? body.accessKey : "";
    if (!verifyOperatorPassword(password, passwordHash)) {
      response.status(401).json({
        status: "unauthenticated",
        code: "invalid_credentials",
        message: "Operator access was denied.",
      });
      return;
    }

    try {
      const issued = issueOperatorSession(operator, runtimeToken);
      response.setHeader("Set-Cookie", sessionCookie(issued.token, issued.session.expiresAt));
      response.status(201).json({ status: "authenticated", session: issued.session });
    } catch (error) {
      response.status(400).json({
        status: "error",
        code: "invalid_operator",
        message: error instanceof Error ? error.message : "Operator name is invalid.",
      });
    }
    return;
  }

  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", clearedSessionCookie());
    response.status(204).end();
    return;
  }

  response.setHeader("Allow", "GET, POST, DELETE");
  response.status(405).json({ status: "error", code: "method_not_allowed" });
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
