const SHOPIFY_API_VERSION = "2026-07";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_FILES = 300;
const MAX_EXCERPTS = 120;
const SOURCE_PATTERNS = [
  "layout/*.liquid",
  "templates/*.liquid",
  "templates/*.json",
  "sections/*.liquid",
  "snippets/*.liquid",
];

interface ShopifyEnvironment {
  SHOPIFY_CLIENT_ID?: string;
  SHOPIFY_CLIENT_SECRET?: string;
  SHOPIFY_SHOP_DOMAIN?: string;
}

interface ThemeFileEvidence {
  filename: string;
  excerpts: Array<{ line: number; text: string }>;
}

export interface ShopifyThemeInspection {
  source: "shopify-admin-graphql";
  apiVersion: string;
  theme: { id: string; name: string; role: string };
  filesScanned: number;
  matchedFiles: ThemeFileEvidence[];
}

export function isThemeSourceObjective(objective: string): boolean {
  const text = objective.toLowerCase();
  return (
    text.includes("shopify") &&
    (text.includes("theme source") || text.includes("liquid") || text.includes("root-cause") || text.includes("root cause"))
  );
}

export async function inspectShopifyThemeSource(env: ShopifyEnvironment): Promise<ShopifyThemeInspection> {
  const shop = normalizeShopDomain(env.SHOPIFY_SHOP_DOMAIN);
  const clientId = env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = env.SHOPIFY_CLIENT_SECRET?.trim();
  const missing = [
    ...(!shop ? ["SHOPIFY_SHOP_DOMAIN"] : []),
    ...(!clientId ? ["SHOPIFY_CLIENT_ID"] : []),
    ...(!clientSecret ? ["SHOPIFY_CLIENT_SECRET"] : []),
  ];
  if (missing.length) {
    throw new Error(`Missing Vercel Preview environment variables: ${missing.join(", ")}.`);
  }

  const accessToken = await requestAccessToken(shop, clientId, clientSecret);
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query: `query MainThemeSource($filenames: [String!]) {
        themes(first: 10, query: "role:MAIN") {
          nodes {
            id
            name
            role
            files(first: 500, filenames: $filenames) {
              nodes {
                filename
                body {
                  __typename
                  ... on OnlineStoreThemeFileBodyText { content }
                }
              }
            }
          }
        }
      }`,
      variables: { filenames: SOURCE_PATTERNS },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload: unknown = await readJSON(response);
  if (!response.ok) throw new Error(`Shopify GraphQL returned HTTP ${response.status}.`);
  if (!isRecord(payload)) throw new Error("Shopify GraphQL returned an invalid response.");
  if (Array.isArray(payload.errors) && payload.errors.length) {
    const messages = payload.errors
      .filter(isRecord)
      .map((error) => typeof error.message === "string" ? error.message : "")
      .filter(Boolean)
      .slice(0, 3);
    throw new Error(messages.length
      ? `Shopify GraphQL rejected the theme-source query: ${messages.join(" | ")}`
      : "Shopify GraphQL rejected the theme-source query.");
  }

  const themes = nestedArray(payload, ["data", "themes", "nodes"]);
  const theme = themes.find((item) => isRecord(item) && item.role === "MAIN");
  if (!isRecord(theme) || typeof theme.id !== "string" || typeof theme.name !== "string") {
    throw new Error("The published Shopify theme was not found.");
  }

  const files = nestedArray(theme, ["files", "nodes"]).slice(0, MAX_FILES);
  const matchedFiles: ThemeFileEvidence[] = [];
  let excerptCount = 0;
  for (const file of files) {
    if (!isRecord(file) || typeof file.filename !== "string" || !isRecord(file.body)) continue;
    const content = file.body.__typename === "OnlineStoreThemeFileBodyText" && typeof file.body.content === "string"
      ? file.body.content
      : "";
    if (!content) continue;
    const excerpts = findRelevantExcerpts(content, MAX_EXCERPTS - excerptCount);
    if (!excerpts.length) continue;
    matchedFiles.push({ filename: file.filename, excerpts });
    excerptCount += excerpts.length;
    if (excerptCount >= MAX_EXCERPTS) break;
  }

  return {
    source: "shopify-admin-graphql",
    apiVersion: SHOPIFY_API_VERSION,
    theme: { id: theme.id, name: theme.name, role: "MAIN" },
    filesScanned: files.length,
    matchedFiles,
  };
}

async function requestAccessToken(shop: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload: unknown = await readJSON(response);
  if (!response.ok || !isRecord(payload) || typeof payload.access_token !== "string") {
    throw new Error("Shopify client-credentials exchange failed.");
  }
  return payload.access_token;
}

function findRelevantExcerpts(content: string, limit: number): Array<{ line: number; text: string }> {
  if (limit <= 0) return [];
  const needles = [
    /<h1\b/i,
    /page\.title/i,
    /product\.title/i,
    /collection\.title/i,
    /product\.description/i,
    /content_for_header/i,
    /canonical_url/i,
    /page_description/i,
    /meta[^>]+description/i,
  ];
  const lines = content.split(/\r?\n/);
  const excerpts: Array<{ line: number; text: string }> = [];
  for (let index = 0; index < lines.length && excerpts.length < limit; index += 1) {
    if (!needles.some((needle) => needle.test(lines[index]))) continue;
    const start = Math.max(0, index - 2);
    const end = Math.min(lines.length, index + 3);
    excerpts.push({
      line: index + 1,
      text: lines.slice(start, end).join("\n").slice(0, 1_500),
    });
  }
  return excerpts;
}

function normalizeShopDomain(value: string | undefined): string | null {
  const domain = value?.trim().toLowerCase() ?? "";
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : null;
}

async function readJSON(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function nestedArray(value: unknown, path: string[]): unknown[] {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return [];
    current = current[key];
  }
  return Array.isArray(current) ? current : [];
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
