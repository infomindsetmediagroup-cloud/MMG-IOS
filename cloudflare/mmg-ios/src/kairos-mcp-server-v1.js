import { handleNativeMainMenuPublish } from "./kairos-native-main-menu-publisher-20260718.js";
import { handleThemeMenuHotfixPublish } from "./kairos-theme-menu-hotfix-publisher-20260718.js";

export const KAIROS_MCP_BUILD = "kairos-mcp-server-20260718-1";
export const KAIROS_MCP_PATH = "/mcp";

const PROTOCOL_VERSION = "2025-03-26";
const STOREFRONT = "https://themindsetmediagroup.com";
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "MCP-Protocol-Version": PROTOCOL_VERSION,
  "X-Kairos-MCP": KAIROS_MCP_BUILD,
};

const TOOLS = [
  {
    name: "kairos_deployment_identity",
    title: "Kairos deployment identity",
    description: "Use this when you need to verify which Kairos build and Git commit are currently deployed.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "kairos_verify_storefront_navigation",
    title: "Verify storefront navigation",
    description: "Use this when you need to inspect the live MMG storefront navigation and determine whether the canonical menu is visible.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true },
  },
  {
    name: "kairos_publish_native_navigation",
    title: "Publish Shopify native navigation",
    description: "Use this when the user explicitly approves replacing the Shopify navigation menu with the canonical MMG taxonomy.",
    inputSchema: {
      type: "object",
      properties: { confirmation: { type: "string", enum: ["PUBLISH_MMG_NATIVE_MAIN_MENU_NOW"] } },
      required: ["confirmation"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true },
  },
  {
    name: "kairos_publish_theme_navigation",
    title: "Publish navigation into live Shopify theme",
    description: "Use this when the user explicitly approves writing the canonical navigation override into Shopify's verified MAIN theme.",
    inputSchema: {
      type: "object",
      properties: { confirmation: { type: "string", enum: ["PUBLISH_MMG_THEME_MENU_HOTFIX_NOW"] } },
      required: ["confirmation"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true },
  },
];

export async function handleKairosMcp(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== KAIROS_MCP_PATH) return null;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const authError = authorize(request, env);
  if (authError) return authError;

  let rpc;
  try { rpc = await request.json(); }
  catch { return rpcError(null, -32700, "Parse error"); }

  const id = rpc?.id ?? null;
  const method = rpc?.method;

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "Kairos", title: "Kairos MMG Control Plane", version: KAIROS_MCP_BUILD },
      instructions: "Kairos controls the MMG Shopify and deployment workflow. Write tools require explicit confirmation and ChatGPT confirmation UI.",
    });
  }

  if (method === "notifications/initialized") return new Response(null, { status: 202, headers: JSON_HEADERS });
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (method === "tools/call") return handleToolCall(id, rpc?.params, env);

  return rpcError(id, -32601, `Method not found: ${String(method || "")}`);
}

async function handleToolCall(id, params, env) {
  const name = params?.name;
  const args = params?.arguments || {};
  try {
    if (name === "kairos_deployment_identity") {
      return toolResult(id, {
        status: "ok",
        mcpBuild: KAIROS_MCP_BUILD,
        deploymentSha: env.DEPLOYMENT_SHA || null,
        deployedAt: env.DEPLOYED_AT || null,
        shopifyStoreDomain: env.SHOPIFY_STORE_DOMAIN || null,
        storefrontOrigin: env.MMG_STOREFRONT_ORIGIN || STOREFRONT,
      });
    }

    if (name === "kairos_verify_storefront_navigation") {
      const target = `${env.MMG_STOREFRONT_ORIGIN || STOREFRONT}/?kairos_mcp_verify=${Date.now()}`;
      const r = await fetch(target, { headers: { "Cache-Control": "no-cache, no-store" } });
      const html = await r.text();
      const expected = ["Shop", "Create &amp; Learn", "Services", "Company", "Support"];
      const obsolete = ["Catalog", "Knowledge Library"];
      const expectedPresence = Object.fromEntries(expected.map(label => [label.replace("&amp;", "&"), html.includes(`>${label}<`) || html.includes(label)]));
      const obsoletePresence = Object.fromEntries(obsolete.map(label => [label, html.includes(`>${label}<`) || html.includes(label)]));
      return toolResult(id, {
        status: r.ok ? "completed" : "failed",
        httpStatus: r.status,
        url: target,
        expectedPresence,
        obsoletePresence,
        canonical: Object.values(expectedPresence).every(Boolean) && !Object.values(obsoletePresence).some(Boolean),
      });
    }

    if (name === "kairos_publish_native_navigation") {
      assertConfirmation(args.confirmation, "PUBLISH_MMG_NATIVE_MAIN_MENU_NOW");
      const req = new Request("https://kairos.internal/api/shopify/native-main-menu/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: args.confirmation }),
      });
      const r = await handleNativeMainMenuPublish(req, env);
      return proxyToolResponse(id, r);
    }

    if (name === "kairos_publish_theme_navigation") {
      assertConfirmation(args.confirmation, "PUBLISH_MMG_THEME_MENU_HOTFIX_NOW");
      const req = new Request("https://kairos.internal/api/shopify/theme-menu-hotfix/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: args.confirmation }),
      });
      const r = await handleThemeMenuHotfixPublish(req, env);
      return proxyToolResponse(id, r);
    }

    return rpcError(id, -32602, `Unknown tool: ${String(name || "")}`);
  } catch (error) {
    return toolResult(id, { status: "failed", error: { code: error?.code || "kairos_mcp_tool_failed", message: error instanceof Error ? error.message : String(error) } }, true);
  }
}

function authorize(request, env) {
  const expected = String(env.KAIROS_MCP_BEARER_TOKEN || "").trim();
  if (!expected) return response({ error: "kairos_mcp_not_configured", message: "KAIROS_MCP_BEARER_TOKEN is required." }, 503);
  const supplied = String(request.headers.get("Authorization") || "");
  if (supplied !== `Bearer ${expected}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...JSON_HEADERS, "WWW-Authenticate": "Bearer realm=\"Kairos MCP\"" },
    });
  }
  return null;
}

function assertConfirmation(actual, expected) {
  if (actual !== expected) {
    const e = new Error(`Exact confirmation required: ${expected}`);
    e.code = "confirmation_required";
    throw e;
  }
}

async function proxyToolResponse(id, r) {
  if (!(r instanceof Response)) throw new Error("Kairos publisher did not return a response.");
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { status: r.ok ? "completed" : "failed", raw: text }; }
  return toolResult(id, { httpStatus: r.status, ...data }, !r.ok);
}

function toolResult(id, structuredContent, isError = false) {
  return rpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError,
  });
}

function rpcResult(id, result) { return response({ jsonrpc: "2.0", id, result }); }
function rpcError(id, code, message, data) { return response({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }); }
function response(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS }); }
