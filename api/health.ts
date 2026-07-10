import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyDashboardCors } from "./cors.js";
import { buildHealthResponse } from "./health-core.js";

export default function handler(request: VercelRequest, response: VercelResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (applyDashboardCors(request, response)) return;

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    response.status(405).json({
      error: {
        code: "method_not_allowed",
        message: "Use GET for Kairos runtime health.",
      },
    });
    return;
  }

  const health = buildHealthResponse(process.env);
  response.status(health.status === "ready" ? 200 : 503).json(health);
}
