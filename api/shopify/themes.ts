import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireOperatorSession, requireShopifyEnvironment, shopifyGraphQL } from "../shopify-core.js";

interface ThemesResponse {
  themes: {
    nodes: Array<{
      id: string;
      name: string;
      role: "MAIN" | "UNPUBLISHED" | "DEVELOPMENT" | string;
      updatedAt?: string;
    }>;
  };
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ status: "error", code: "method_not_allowed" });
    return;
  }

  try {
    const env = requireShopifyEnvironment();
    requireOperatorSession(request, env.runtimeToken);
    const data = await shopifyGraphQL<ThemesResponse>(env, `#graphql
      query KairosThemes {
        themes(first: 50) {
          nodes {
            id
            name
            role
            updatedAt
          }
        }
      }
    `);
    response.status(200).json({
      status: "ready",
      shop: env.shop,
      themes: data.themes.nodes,
    });
  } catch (error) {
    const unauthorized = error instanceof Error && error.name === "UnauthorizedError";
    response.status(unauthorized ? 401 : 503).json({
      status: "error",
      code: unauthorized ? "session_required" : "shopify_unavailable",
      message: error instanceof Error ? error.message : "Shopify publisher failed.",
    });
  }
}
