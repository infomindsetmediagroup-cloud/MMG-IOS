import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomUUID } from "node:crypto";
import { applyDashboardCors } from "./cors.js";
import { requireShopifyConfiguration } from "./actions-core.js";
import {
  KairosHttpError,
  authorizeRequest,
  errorEnvelope,
  extractResponseText,
  requireRuntimeEnvironment,
} from "./kairos-core.js";
import { parseThemeMutationRequest, SHOPIFY_THEME_FILES_UPSERT } from "./theme-mutation-core.js";
import { readCookie, SESSION_COOKIE_NAME, verifyOperatorSession } from "./session-core.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 45_000;
const MAX_SOURCE_BYTES = 180_000;
const CANDIDATE_KEYS = ["templates/index.json", "layout/theme.liquid", "config/settings_data.json"];

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (applyDashboardCors(request, response)) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(405).json(errorEnvelope(new KairosHttpError(405, "method_not_allowed", "Use POST to compile a Shopify mutation plan.")));
    return;
  }

  try {
    const runtime = requireRuntimeEnvironment(process.env);
    const cookieToken = readCookie(firstHeaderValue(request.headers.cookie), SESSION_COOKIE_NAME);
    const session = verifyOperatorSession(cookieToken, runtime.KAIROS_RUNTIME_TOKEN);
    if (!session) authorizeRequest(firstHeaderValue(request.headers.authorization), runtime.KAIROS_RUNTIME_TOKEN);
    const objective = readObjective(request.body);
    const shopify = requireShopifyConfiguration(process.env);
    const theme = await readMainTheme(shopify);
    const sources = await readThemeSources(shopify, theme.id);
    if (!sources.length) throw new KairosHttpError(502, "theme_sources_unavailable", "Kairos could not read the published theme sources required to prepare a safe mutation plan.");

    const requestId = randomUUID();
    const providerResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Client-Request-Id": requestId,
      },
      body: JSON.stringify({
        model: runtime.OPENAI_MODEL,
        instructions: [
          "You are Kairos Website Operations compiling an exact Shopify production mutation proposal.",
          "Use only the supplied current published-theme source files. Return complete replacement content, never partial patches or ellipses.",
          "Change the fewest files necessary. Preserve valid Liquid and JSON. Do not invent assets, snippets, settings, routes, products, or application blocks.",
          "The plan will be shown for executive approval and then executed byte-for-byte. If the requested change cannot be safely represented in the supplied files, return an empty files array and explain the blocker in risks.",
        ].join(" "),
        input: [{
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify({ objective, theme, sources }) }],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "shopify_theme_mutation_plan",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["summary", "recommendedChanges", "affectedAssets", "expectedBenefits", "risks", "rollbackPlan", "acceptanceCriteria", "mutationPlan"],
              properties: {
                summary: { type: "string" },
                recommendedChanges: { type: "array", items: { type: "string" } },
                affectedAssets: { type: "array", items: { type: "string" } },
                expectedBenefits: { type: "array", items: { type: "string" } },
                risks: { type: "array", items: { type: "string" } },
                rollbackPlan: { type: "array", items: { type: "string" } },
                acceptanceCriteria: { type: "array", items: { type: "string" } },
                mutationPlan: {
                  type: "object",
                  additionalProperties: false,
                  required: ["themeId", "files"],
                  properties: {
                    themeId: { type: "string" },
                    files: {
                      type: "array",
                      maxItems: 3,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["key", "value", "expectedSha256"],
                        properties: {
                          key: { type: "string" },
                          value: { type: "string" },
                          expectedSha256: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const providerBody = await readJSON(providerResponse);
    if (!providerResponse.ok) throw new KairosHttpError(providerResponse.status === 429 ? 429 : 502, providerResponse.status === 429 ? "rate_limited" : "provider_error", "Kairos could not compile the Shopify mutation plan.");
    const plan = parseProviderPlan(extractResponseText(providerBody));
    validateSourceGrounding(plan, theme.id, sources);
    parseThemeMutationRequest({
      actionType: SHOPIFY_THEME_FILES_UPSERT,
      objective,
      approval: { approved: true, actor: session?.operator || "plan-validator", approvedAt: new Date().toISOString() },
      mutation: plan.mutationPlan,
    });

    response.status(200).json({
      ...plan,
      actionID: randomUUID(),
      completedAt: new Date().toISOString(),
      requestId,
      auditId: randomUUID(),
      sourceEvidence: {
        themeId: theme.id,
        themeName: theme.name,
        role: theme.role,
        files: sources.map(source => ({ key: source.key, sha256: source.sha256, bytes: Buffer.byteLength(source.value, "utf8") })),
      },
      executionContext: {
        authorizationMode: session ? "session" : "gateway-recovery",
        operator: session?.operator,
        sessionId: session?.sessionId ?? "gateway-recovery",
      },
    });
  } catch (caught) {
    const error = normalizeError(caught);
    response.status(error.statusCode).json(errorEnvelope(error));
  }
}

interface ShopifyConfig { storeDomain: string; accessToken: string; apiVersion: string }
interface ThemeSource { key: string; value: string; sha256: string }
interface Plan { mutationPlan: { themeId: string; files: Array<{ key: string; value: string; expectedSha256: string }> }; [key: string]: unknown }

async function readMainTheme(configuration: ShopifyConfig): Promise<{ id: string; name: string; role: string }> {
  const response = await shopifyFetch(configuration, "/themes.json?role=main", { method: "GET" });
  const body = await readJSON(response);
  const themes = isRecord(body) && Array.isArray(body.themes) ? body.themes : [];
  const theme = themes.find(entry => isRecord(entry) && entry.role === "main");
  if (!theme) throw new KairosHttpError(502, "main_theme_unavailable", "Shopify did not return the published theme.");
  return { id: String(theme.id), name: typeof theme.name === "string" ? theme.name : "Published theme", role: "main" };
}

async function readThemeSources(configuration: ShopifyConfig, themeId: string): Promise<ThemeSource[]> {
  const listingResponse = await shopifyFetch(configuration, `/themes/${themeId}/assets.json?fields=key`, { method: "GET" });
  const listing = await readJSON(listingResponse);
  const assets = isRecord(listing) && Array.isArray(listing.assets) ? listing.assets : [];
  const keys = assets.map(asset => isRecord(asset) && typeof asset.key === "string" ? asset.key : "").filter(Boolean);
  const cssKey = keys.find(key => /^assets\/(base|theme|styles?|application).*\.css$/i.test(key));
  const selected = [...CANDIDATE_KEYS, ...(cssKey ? [cssKey] : [])].filter(key => keys.includes(key));
  const sources: ThemeSource[] = [];
  let total = 0;
  for (const key of selected) {
    const response = await shopifyFetch(configuration, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, { method: "GET" });
    const body = await readJSON(response);
    const asset = isRecord(body) && isRecord(body.asset) ? body.asset : null;
    if (!response.ok || !asset || typeof asset.value !== "string") continue;
    const bytes = Buffer.byteLength(asset.value, "utf8");
    if (total + bytes > MAX_SOURCE_BYTES) continue;
    total += bytes;
    sources.push({ key, value: asset.value, sha256: sha256(asset.value) });
  }
  return sources;
}

function validateSourceGrounding(plan: Plan, themeId: string, sources: ThemeSource[]): void {
  if (!isRecord(plan.mutationPlan) || plan.mutationPlan.themeId !== themeId || !Array.isArray(plan.mutationPlan.files)) {
    throw new KairosHttpError(502, "invalid_mutation_plan", "Kairos returned a mutation plan for the wrong theme or an invalid file set.");
  }
  if (plan.mutationPlan.files.length < 1) throw new KairosHttpError(409, "mutation_plan_blocked", "Kairos could not produce a safe source-grounded mutation from the available theme files.");
  const byKey = new Map(sources.map(source => [source.key, source]));
  for (const file of plan.mutationPlan.files) {
    const source = byKey.get(file.key);
    if (!source || file.expectedSha256 !== source.sha256) throw new KairosHttpError(502, "ungrounded_mutation_plan", `The proposed mutation for ${file.key} is not grounded in the current published source.`);
    if (!file.value || file.value.includes("...") || file.value.includes("[existing content]")) throw new KairosHttpError(502, "incomplete_mutation_content", `The proposed replacement for ${file.key} is incomplete.`);
  }
}

function parseProviderPlan(text: string): Plan {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.mutationPlan)) throw new Error("invalid");
    return parsed as Plan;
  } catch {
    throw new KairosHttpError(502, "invalid_plan_response", "Kairos returned an invalid structured mutation plan.");
  }
}

function readObjective(value: unknown): string {
  if (!isRecord(value) || typeof value.objective !== "string" || !value.objective.trim() || value.objective.length > 8_000) {
    throw new KairosHttpError(400, "invalid_objective", "A bounded website-change objective is required.");
  }
  return value.objective.trim();
}

function shopifyFetch(configuration: ShopifyConfig, path: string, init: RequestInit): Promise<Response> {
  return fetch(`https://${configuration.storeDomain}/admin/api/${configuration.apiVersion}${path}`, {
    ...init,
    headers: { "X-Shopify-Access-Token": configuration.accessToken, Accept: "application/json", ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(20_000),
  });
}

async function readJSON(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}
function firstHeaderValue(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function normalizeError(caught: unknown): KairosHttpError {
  if (caught instanceof KairosHttpError) return caught;
  if (caught instanceof Error && (caught.name === "TimeoutError" || caught.name === "AbortError")) return new KairosHttpError(504, "theme_plan_timeout", "Kairos took too long to compile the mutation plan.");
  return new KairosHttpError(500, "theme_plan_failed", "Kairos could not compile the Shopify mutation plan.");
}
