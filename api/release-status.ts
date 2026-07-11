import type { VercelRequest, VercelResponse } from "@vercel/node";

const COMMAND_CENTER_BUILD = "command-center-recovery-20260711-2";

export default function handler(request: VercelRequest, response: VercelResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ status: "error", code: "method_not_allowed" });
    return;
  }

  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unknown";
  const environment = process.env.VERCEL_ENV?.trim() || "development";

  response.status(200).json({
    status: "ready",
    environment,
    build: process.env.KAIROS_BUILD_ID?.trim() || COMMAND_CENTER_BUILD,
    commit,
    runtimeReady: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL && process.env.KAIROS_RUNTIME_TOKEN),
    sessionReady: Boolean(process.env.KAIROS_RUNTIME_TOKEN && (process.env.KAIROS_OPERATOR_PASSWORD_HASH || process.env.KAIROS_OPERATOR_PASSWORD)),
    kairosReady: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL && process.env.KAIROS_RUNTIME_TOKEN),
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID || null,
  });
}
