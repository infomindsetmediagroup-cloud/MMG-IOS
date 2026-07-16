import preservePlanner, { KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD } from "./kairos-homepage-preserve-planner-v1.js";
import { parseShopifyJson } from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD = "kairos-rendered-homepage-text-planner-20260716-1";

const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const PRIMARY_COPY_KEY = /(heading|title|subheading|text|description|copy|content|quote|eyebrow|kicker)/i;
const MAX_ATTEMPTS = 2;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== PLAN_ROUTE) {
      return json({ status: "not-found", build: KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD }, 404);
    }

    let payload;
    try {
      payload = await request.clone().json();
    } catch {
      return json({ status: "needs-attention", build: KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD, error: { code: "homepage_plan_payload_invalid", message: "The homepage text request was not valid JSON." } }, 400);
    }

    const originalObjective = String(payload?.objective || "").trim();
    let lastProof = null;
    let renderedLocations = [];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const attemptPayload = {
        ...payload,
        objective: attempt === 0 ? originalObjective : renderedRetryObjective(originalObjective, renderedLocations),
        renderedTextRequired: true,
        activeOrderedSectionsOnly: true,
        activeOrderedBlocksOnly: true,
      };
      const response = await preservePlanner.fetch(makeRequest(request, attemptPayload), env, ctx);
      const body = await readJSON(response);
      if (!response.ok || !body?.result) return stamp(response, { status: "planner-error", attempt: attempt + 1 });

      const proof = renderedTextProof(body.result);
      lastProof = proof;
      renderedLocations = proof.renderedPrimaryLocations;
      if (proof.verified) {
        return stamp(response, {
          status: "verified",
          attempt: attempt + 1,
          renderedOperationCount: proof.renderedOperations.length,
          renderedPrimaryOperationCount: proof.renderedPrimaryOperations.length,
          changedCharacterCount: proof.changedCharacterCount,
        });
      }
    }

    return json({
      status: "needs-attention",
      build: KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD,
      basePlannerBuild: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD,
      summary: "Kairos preserved the homepage framework but could not prove that the proposed copy changes affect rendered homepage text.",
      error: {
        code: "rendered_homepage_text_delta_missing",
        message: "Kairos will not report success for hidden, disabled, unordered, or non-rendered text settings. Run the text job again after confirming the published homepage exposes editable rendered copy.",
      },
      evidence: {
        renderedOperationCount: lastProof?.renderedOperations?.length || 0,
        renderedPrimaryOperationCount: lastProof?.renderedPrimaryOperations?.length || 0,
        changedCharacterCount: lastProof?.changedCharacterCount || 0,
      },
    }, 409);
  },
};

function renderedTextProof(result) {
  const patch = result?.plan?.templateTextPatch || {};
  const operations = Array.isArray(patch.operations) ? patch.operations : [];
  let document;
  try {
    document = parseShopifyJson(patch.publishedSource, "Published MAIN homepage rendered-text proof");
  } catch {
    return emptyProof();
  }

  const rendered = renderedLocationMap(document);
  const renderedOperations = [];
  const renderedPrimaryOperations = [];
  let changedCharacterCount = 0;

  for (const operation of operations) {
    const location = operationLocation(operation);
    const source = rendered.get(location);
    if (!source) continue;
    const before = String(operation?.before ?? "");
    const after = String(operation?.after ?? "");
    if (!after.trim() || after === before) continue;
    const verified = { ...operation, location, rendered: true, sectionIndex: source.sectionIndex, blockIndex: source.blockIndex, impact: source.impact };
    renderedOperations.push(verified);
    changedCharacterCount += textDifference(before, after);
    if (source.primary) renderedPrimaryOperations.push(verified);
  }

  return {
    verified: renderedOperations.length > 0 && renderedPrimaryOperations.length > 0 && changedCharacterCount > 0,
    renderedOperations,
    renderedPrimaryOperations,
    changedCharacterCount,
    renderedPrimaryLocations: [...rendered.values()].filter(item => item.primary).sort((a, b) => b.impact - a.impact).map(item => item.location).slice(0, 100),
  };
}

function renderedLocationMap(document) {
  const map = new Map();
  const order = Array.isArray(document?.order) ? document.order : [];
  order.forEach((sectionId, sectionIndex) => {
    const section = document?.sections?.[sectionId];
    if (!section || section.disabled === true) return;
    collectRenderedSettings(map, "section", sectionId, "", section?.settings, sectionIndex, -1);

    const blocks = section?.blocks && typeof section.blocks === "object" ? section.blocks : {};
    const blockOrder = Array.isArray(section?.block_order) && section.block_order.length ? section.block_order : Object.keys(blocks);
    blockOrder.forEach((blockId, blockIndex) => {
      const block = blocks?.[blockId];
      if (!block || block.disabled === true) return;
      collectRenderedSettings(map, "block", sectionId, blockId, block?.settings, sectionIndex, blockIndex);
    });
  });
  return map;
}

function collectRenderedSettings(map, scope, sectionId, blockId, settings, sectionIndex, blockIndex) {
  for (const [key, value] of Object.entries(settings || {})) {
    if (typeof value !== "string" || !value.trim()) continue;
    const location = `${scope}:${sectionId}:${blockId || "section"}:${key}`;
    const primary = PRIMARY_COPY_KEY.test(key);
    const impact = (primary ? 100 : 20) + Math.max(0, 40 - sectionIndex * 3) + (scope === "section" ? 10 : 0) + Math.min(20, Math.floor(value.trim().length / 20));
    map.set(location, { location, key, primary, impact, sectionIndex, blockIndex });
  }
}

function renderedRetryObjective(objective, locations) {
  const allowed = locations.length ? locations.map(location => `- ${location}`).join("\n") : "- No rendered primary-copy locations were detected.";
  return `${objective}\n\nRENDERED-COPY EXECUTION REQUIREMENT:\nThe previous proposal did not prove a visible homepage text change. Return at least one meaningful change to a rendered primary-copy setting from the exact allowed locations below. Do not select disabled sections, sections outside homepage order, blocks outside block_order, hidden settings, links, images, style settings, or unrelated labels. Preserve scope, sectionId, blockId, key, and before exactly.\n${allowed}`;
}

function makeRequest(request, payload) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Rendered-Text-Required", "true");
  return new Request(request.url, { method: "POST", headers, body: JSON.stringify(payload) });
}

function stamp(response, proof) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Rendered-Text-Planner", KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD);
  headers.set("X-Kairos-Base-Homepage-Planner", KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD);
  headers.set("X-Kairos-Rendered-Text-Delta", proof.status);
  headers.set("X-Kairos-Rendered-Text-Attempt", String(proof.attempt || 0));
  headers.set("X-Kairos-Rendered-Text-Operations", String(proof.renderedOperationCount || 0));
  headers.set("X-Kairos-Rendered-Primary-Operations", String(proof.renderedPrimaryOperationCount || 0));
  headers.set("X-Kairos-Changed-Character-Count", String(proof.changedCharacterCount || 0));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function operationLocation(operation) {
  return String(operation?.location || `${String(operation?.scope || "")}:${String(operation?.sectionId || "")}:${String(operation?.blockId || "") || "section"}:${String(operation?.key || "")}`);
}

function textDifference(before, after) {
  const left = String(before || "");
  const right = String(after || "");
  const max = Math.max(left.length, right.length);
  let changed = Math.abs(left.length - right.length);
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) if (left[index] !== right[index]) changed += 1;
  return Math.min(max, changed);
}

function emptyProof() {
  return { verified: false, renderedOperations: [], renderedPrimaryOperations: [], changedCharacterCount: 0, renderedPrimaryLocations: [] };
}

async function readJSON(response) {
  try { return await response.clone().json(); } catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Rendered-Text-Planner": KAIROS_RENDERED_HOMEPAGE_TEXT_PLANNER_BUILD,
      "X-Kairos-Base-Homepage-Planner": KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
