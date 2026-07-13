import runtime, { KairosProject } from "./kairos-production-entry-v7.js";
import { auditHomepageLinks } from "./kairos-link-lifecycle-engine-v1.js";

const BUILD = "kairos-production-entry-20260713-8";
const AUDIT_PATH = "/api/shopify/link-intelligence/audit";
const PLAN_PATH = "/api/shopify/staging/plan/jobs";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === AUDIT_PATH) {
      try {
        const origin = String(env.MMG_STOREFRONT_ORIGIN || "").trim();
        if (!origin) throw new Error("MMG storefront origin is not configured.");
        const report = await auditHomepageLinks(origin);
        return json({ status: "completed", build: BUILD, report });
      } catch (error) {
        return json({ status: "failed", build: BUILD, error: { code: "link_audit_failed", message: error instanceof Error ? error.message : "Link audit failed." } }, 502);
      }
    }

    if (request.method === "POST" && url.pathname === PLAN_PATH) {
      return planWithLinkIntelligence(request, env, ctx);
    }

    return stamp(await runtime.fetch(request, env, ctx));
  },
};

async function planWithLinkIntelligence(request, env, ctx) {
  const bodyText = await request.text();
  let payload = {};
  try { payload = bodyText ? JSON.parse(bodyText) : {}; } catch {}

  try {
    const origin = String(env.MMG_STOREFRONT_ORIGIN || "").trim();
    const report = origin ? await auditHomepageLinks(origin) : null;
    if (report) {
      const actionable = report.results
        .filter(item => item.lifecycleDecision !== "keep")
        .slice(0, 20)
        .map(item => ({
          label: item.label,
          currentURL: item.url,
          status: item.status,
          statusCode: item.statusCode,
          lifecycleDecision: item.lifecycleDecision,
          expectedStage: item.expectedStage,
          recommendedURL: item.recommendedURL,
          confidence: item.confidence,
          rationale: item.rationale,
        }));
      const intelligence = `\n\nKAIROS LINK LIFECYCLE INTELLIGENCE:\n${JSON.stringify({ summary: report.summary, actionable }, null, 2)}\n\nRULES: Repair broken links automatically only when confidence is at least 0.9 and the destination is verified. For lower-confidence lifecycle mismatches, include the correction in the proposal for executive approval. Never invent a route. Preserve the rendered design; change only existing URL values and comparable-length labels when required.`;
      payload.objective = `${String(payload.objective || "").trim()}${intelligence}`;
    }
  } catch (error) {
    payload.objective = `${String(payload.objective || "").trim()}\n\nLINK AUDIT WARNING: ${error instanceof Error ? error.message : "Audit unavailable"}. Do not guess or invent replacements.`;
  }

  const forwarded = new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: JSON.stringify(payload),
    redirect: request.redirect,
  });
  return stamp(await runtime.fetch(forwarded, env, ctx));
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Link-Intelligence", "homepage-audit-v1");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Link-Intelligence": "homepage-audit-v1",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
