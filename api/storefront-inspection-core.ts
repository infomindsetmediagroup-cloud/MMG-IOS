import { randomUUID } from "node:crypto";

const ALLOWED_HOST = "themindsetmediagroup.com";
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 8_000;

export interface PageInspection {
  url: string;
  status: number;
  finalUrl: string;
  title?: string;
  description?: string;
  canonical?: string;
  h1: string[];
  links: string[];
  assets: string[];
  issues: string[];
}

export interface StorefrontInspection {
  auditId: string;
  startedAt: string;
  completedAt: string;
  source: "live-storefront";
  storefront: string;
  sitemapUrls: string[];
  inspectedCount: number;
  discoveredCount: number;
  pages: PageInspection[];
  errors: Array<{ url: string; message: string }>;
}

export function isStorefrontAuditObjective(objective: string): boolean {
  const text = objective.toLowerCase();
  return (
    (text.includes("audit") || text.includes("inspect") || text.includes("crawl")) &&
    (text.includes("website") || text.includes("storefront") || text.includes("shopify") || text.includes(ALLOWED_HOST))
  );
}

export async function inspectStorefront(limit = DEFAULT_LIMIT): Promise<StorefrontInspection> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
  const auditId = randomUUID();
  const startedAt = new Date().toISOString();
  const sitemapUrls: string[] = [];
  const discovered = new Set<string>([`https://${ALLOWED_HOST}/`]);
  const errors: Array<{ url: string; message: string }> = [];

  await discoverSitemaps(`https://${ALLOWED_HOST}/sitemap.xml`, sitemapUrls, discovered, errors, 0);

  const urls = [...discovered].slice(0, safeLimit);
  const pages: PageInspection[] = [];
  for (const url of urls) {
    try {
      pages.push(await inspectPage(url));
    } catch (error) {
      errors.push({ url, message: error instanceof Error ? error.message : "Inspection failed." });
    }
  }

  return {
    auditId,
    startedAt,
    completedAt: new Date().toISOString(),
    source: "live-storefront",
    storefront: `https://${ALLOWED_HOST}`,
    sitemapUrls,
    inspectedCount: pages.length,
    discoveredCount: discovered.size,
    pages,
    errors,
  };
}

async function discoverSitemaps(
  url: string,
  sitemapUrls: string[],
  discovered: Set<string>,
  errors: Array<{ url: string; message: string }>,
  depth: number,
): Promise<void> {
  if (depth > 2 || sitemapUrls.includes(url) || sitemapUrls.length >= 20) return;
  sitemapUrls.push(url);
  try {
    const response = await safeFetch(url);
    if (!response.ok) throw new Error(`Sitemap returned HTTP ${response.status}.`);
    const xml = await response.text();
    const locations = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeXml(match[1]));
    for (const location of locations) {
      const normalized = normalizeAllowedUrl(location);
      if (!normalized) continue;
      if (/\.xml(?:\?|$)/i.test(normalized)) {
        await discoverSitemaps(normalized, sitemapUrls, discovered, errors, depth + 1);
      } else {
        discovered.add(normalized);
      }
    }
  } catch (error) {
    errors.push({ url, message: error instanceof Error ? error.message : "Sitemap discovery failed." });
  }
}

async function inspectPage(url: string): Promise<PageInspection> {
  const response = await safeFetch(url);
  const finalUrl = normalizeAllowedUrl(response.url) ?? url;
  const contentType = response.headers.get("content-type") ?? "";
  const issues: string[] = [];
  if (response.status >= 400) issues.push(`HTTP ${response.status}`);
  if (!contentType.includes("text/html")) {
    return { url, status: response.status, finalUrl, h1: [], links: [], assets: [], issues: [...issues, "Non-HTML response"] };
  }

  const html = (await response.text()).slice(0, 2_000_000);
  const title = firstText(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = metaContent(html, "description");
  const canonical = linkHref(html, "canonical");
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => cleanText(match[1])).filter(Boolean).slice(0, 10);
  const links = extractUrls(html, /<a\b[^>]*\bhref=["']([^"'#]+)["']/gi, finalUrl);
  const assets = [
    ...extractUrls(html, /<(?:img|script)\b[^>]*\b(?:src)=["']([^"']+)["']/gi, finalUrl),
    ...extractUrls(html, /<link\b[^>]*\bhref=["']([^"']+)["']/gi, finalUrl),
  ];

  if (!title) issues.push("Missing title");
  if (!description) issues.push("Missing meta description");
  if (!canonical) issues.push("Missing canonical");
  if (h1.length === 0) issues.push("Missing H1");
  if (h1.length > 1) issues.push(`Multiple H1 headings (${h1.length})`);
  if (finalUrl !== url) issues.push(`Redirected to ${finalUrl}`);

  return {
    url,
    status: response.status,
    finalUrl,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(canonical ? { canonical } : {}),
    h1,
    links: links.slice(0, 250),
    assets: [...new Set(assets)].slice(0, 250),
    issues,
  };
}

async function safeFetch(url: string): Promise<Response> {
  const normalized = normalizeAllowedUrl(url);
  if (!normalized) throw new Error("URL is outside the MMG storefront allowlist.");
  return fetch(normalized, {
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.1",
      "User-Agent": "MMG-Kairos-Storefront-Inspector/1.0",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function normalizeAllowedUrl(value: string): string | null {
  try {
    const url = new URL(value, `https://${ALLOWED_HOST}`);
    if (url.protocol !== "https:" || url.hostname !== ALLOWED_HOST) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function firstText(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern);
  const text = match ? cleanText(match[1]) : "";
  return text || undefined;
}

function metaContent(html: string, name: string): string | undefined {
  const patterns = [
    new RegExp(`<meta\\b[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const value = firstText(html, pattern);
    if (value) return value;
  }
  return undefined;
}

function linkHref(html: string, rel: string): string | undefined {
  const patterns = [
    new RegExp(`<link\\b[^>]*rel=["'][^"']*${rel}[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<link\\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*${rel}[^"']*["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeXml(match[1].trim());
  }
  return undefined;
}

function extractUrls(html: string, pattern: RegExp, base: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(decodeXml(match[1]), base);
      if (url.protocol === "http:" || url.protocol === "https:") urls.push(url.toString());
    } catch {}
  }
  return [...new Set(urls)];
}

function cleanText(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
