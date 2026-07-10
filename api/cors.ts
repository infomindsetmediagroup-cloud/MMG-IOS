import type { VercelRequest, VercelResponse } from "@vercel/node";

const DEFAULT_DASHBOARD_ORIGIN = "https://infomindsetmediagroup-cloud.github.io";

export function applyDashboardCors(request: VercelRequest, response: VercelResponse): boolean {
  const allowedOrigin = process.env.KAIROS_DASHBOARD_ORIGIN?.trim() || DEFAULT_DASHBOARD_ORIGIN;
  const origin = firstHeaderValue(request.headers.origin);

  if (origin === allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return true;
  }

  return false;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
