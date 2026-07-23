import previousRuntime, { KairosProject as PreviousKairosProject } from "./kairos-production-entry-manuscript-online-v1.js";
import {
  DIGITAL_ASSET_V2_LABEL,
  KAIROS_DIGITAL_ASSET_V2_BUILD,
  MINIMUM_FINISHED_PAGES,
} from "./kairos-digital-asset-edition-v2-contract-v1.js";
import {
  KAIROS_DIGITAL_ASSET_V2_WRITER_BUILD,
  normalizeApprovedCoverToPNG,
  writeDigitalAssetEditionV2,
} from "./kairos-digital-asset-v2-manuscript-writer-v1.js";
import {
  KAIROS_MANUFACTURING_ORCHESTRATOR_BUILD,
  handleManufacturingOrchestrator,
} from "./kairos-manufacturing-orchestrator-v1.js";
import {
  handleCustomerDelivery,
  handleCustomerDeliveryObjectRequest,
} from "./kairos-customer-delivery-v1.js";

const BUILD = "kairos-production-entry-digital-asset-v2-20260723-7";
const CUSTOMER_DELIVERY_BUILD = "kairos-customer-delivery-20260723-1";
const PUBLISHER = "Mindset Media Group™";
const REGISTRY_OBJECT = "mmg-production-project-registry";

export class KairosProject extends PreviousKairosProject {
  async fetch(request) {
    const customerDelivery = await handleCustomerDeliveryObjectRequest(this.state, request, this.env);
    if (customerDelivery) return stamp(await sanitizeResponse(customerDelivery));
    const prepared = await prepareObjectRequest(request, this.env);
    const response = await super.fetch(prepared);
    return stamp(await sanitizeResponse(response));
  }
}

export default {
  async fetch(request, env, ctx) {
    const customerDelivery = await handleCustomerDelivery(request.clone(), env);
    if (customerDelivery) return stamp(await sanitizeResponse(customerDelivery));

    const manufacturing = await handleManufacturingOrchestrator(request.clone(), env);
    if (manufacturing) return stamp(await sanitizeResponse(manufacturing));

    await enforceExistingSetupForRun(request, env).catch(() => null);
    const response = await previousRuntime.fetch(request, env, ctx);
    return stamp(await sanitizeResponse(response));
  },

  async scheduled(controller, env, ctx) {
    if (typeof previousRuntime.scheduled === "function") {
      return previousRuntime.scheduled(controller, env, ctx);
    }
  },
};

async function prepareObjectRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "POST" && /^\/registry\/manuscripts\/[a-z0-9-]{8,}\/setup$/i.test(url.pathname)) {
    return rewriteSetupRequest(request);
  }
  if (request.method === "POST" && url.pathname === "/product-manufacturing/create") {
    return rewriteManufacturingRequest(request, env);
  }
  return request;
}

async function rewriteSetupRequest(request) {
  const contentType = String(request.headers.get("Content-Type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = await request.clone().json().catch(() => ({}));
    return jsonRequest(request, { ...body, authorName: PUBLISHER, notes: sanitizeText(body?.notes || "") });
  }
  if (contentType.includes("multipart/form-data")) {
    const source = await request.clone().formData();
    const output = new FormData();
    for (const [key, value] of source.entries()) {
      if (key !== "authorName" && key !== "notes") output.append(key, value);
    }
    output.set("authorName", PUBLISHER);
    output.set("notes", sanitizeText(source.get("notes") || ""));
    const headers = new Headers(request.headers);
    headers.delete("Content-Type");
    headers.delete("Content-Length");
    return new Request(request.url, { method: request.method, headers, body: output });
  }
  return request;
}

async function rewriteManufacturingRequest(request, env) {
  const body = await request.clone().json().catch(() => ({}));
  const manuscript = body?.manuscript || {};
  const objective = sanitizeText(body?.objective || "");
  const sourceText = sanitizeText(manuscript?.text || "");
  const written = await writeDigitalAssetEditionV2({
    title: sanitizeText(body?.title || "Untitled Digital Guide"),
    subtitle: sanitizeText(body?.subtitle || ""),
    manuscript: sourceText,
    env,
  });
  const manufacturingText = normalizeHeadingsForManufacturing(written.text);
  const cover = await normalizeApprovedCoverToPNG(body?.cover || {}, env);
  const directive = `${DIGITAL_ASSET_V2_LABEL}. The manuscript has completed the V2 source-grounded writing pass and now contains ${written.wordCount} words across ${written.chapterCount} expanded source chapters, estimated at ${written.estimatedPages} substantive pages. Manufacture the exact customer-facing release package without filler, duplicated passages, individual attribution, storefront content, or internal workflow commentary.`;

  return jsonRequest(request, {
    ...body,
    author: PUBLISHER,
    publisher: PUBLISHER,
    objective: `${objective} ${directive}`.trim(),
    manuscript: {
      ...manuscript,
      text: manufacturingText,
      digitalAssetEdition: "2.0",
      minimumFinishedPages: MINIMUM_FINISHED_PAGES,
      customerFacingOnly: true,
      originalSourcePreserved: true,
      v2Writer: {
        build: written.build,
        model: written.model,
        wordCount: written.wordCount,
        estimatedPages: written.estimatedPages,
        chapterCount: written.chapterCount,
        sectionCount: written.sectionCount,
        manufacturingWordCount: countWords(manufacturingText),
      },
    },
    cover,
  });
}

async function enforceExistingSetupForRun(request, env) {
  if (request.method !== "POST" || !env?.KAIROS_PROJECTS) return;
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/auto-pipeline\/run$/i);
  if (!match) return;
  const projectId = match[1];
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
  const currentResponse = await stub.fetch(`https://kairos.internal/registry/manuscripts/${projectId}/setup`);
  if (currentResponse.ok) {
    const current = await currentResponse.json().catch(() => null);
    const setup = current?.setup;
    if (setup) {
      await stub.fetch(`https://kairos.internal/registry/manuscripts/${projectId}/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Operation-Id": crypto.randomUUID(),
          "Idempotency-Key": `digital-asset-v2-${projectId}-${Date.now()}`,
        },
        body: JSON.stringify({
          authorName: PUBLISHER,
          publicationTitle: sanitizeText(setup.publicationTitle || ""),
          service: setup.service,
          trimSize: "6x9",
          edition: setup.edition || "multi-format",
          isbnStatus: setup.isbnStatus || "not-decided",
          notes: sanitizeText(setup.notes || ""),
        }),
      });
    }
  }

  const pipelineResponse = await stub.fetch(`https://kairos.internal/registry/manuscripts/${projectId}/auto-pipeline`);
  if (pipelineResponse.ok) {
    const record = await pipelineResponse.json().catch(() => null);
    if (record) {
      await stub.fetch(`https://kairos.internal/registry/manuscripts/${projectId}/auto-pipeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...record,
          status: "v2-rebuild-required",
          signature: null,
          updatedAt: new Date().toISOString(),
          nextAction: "Regenerate the customer package with the current Digital Asset Edition V2 build.",
        }),
      });
    }
  }
}

async function sanitizeResponse(response) {
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json") && !contentType.includes("text/")) return response;
  const text = await response.text();
  const sanitized = sanitizeText(text);
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(sanitized, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizeHeadingsForManufacturing(value) {
  return normalizeWinAnsi(String(value || ""))
    .replace(/^#{1,3}\s+(Introduction\b.*)$/gim, "Chapter 0: $1")
    .replace(/^#{1,3}\s+Chapter\s+(\d+)\s*[\-–—:]\s*(.+)$/gim, "Chapter $1: $2")
    .replace(/^#{1,3}\s+Part\s+(\d+)\s*[\-–—:]\s*(.+)$/gim, "Part $1: $2")
    .replace(/^#{1,3}\s+(?=(?:Chapter\s+\d+|Part\s+\d+)\b)/gim, "")
    .replace(/^#{1,3}\s+(.+)$/gm, "$1")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function normalizeWinAnsi(value) {
  return String(value || "")
    .replace(/[☐□◻▢]/g, "[ ]")
    .replace(/[☑☒✓✔]/g, "[x]")
    .replace(/[→⇒]/g, "->")
    .replace(/[←⇐]/g, "<-")
    .replace(/[↔⇔]/g, "<->")
    .replace(/[★☆]/g, "*")
    .replace(/[◆◇]/g, "-")
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF\u2010-\u2027\u2030\u2032\u2033\u20AC\u2122]/g, "");
}

function countWords(value) {
  return (String(value || "").match(/\b[\p{L}\p{N}’'-]+\b/gu) || []).length;
}

function sanitizeText(value) {
  return String(value == null ? "" : value)
    .replace(/Michael\s+King/gi, PUBLISHER)
    .replace(/\bAuthor\s*:\s*Mindset Media Group™/gi, `Published by: ${PUBLISHER}`);
}

function jsonRequest(request, body) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
  });
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Digital-Asset-Edition", "V2");
  headers.set("X-Kairos-Digital-Asset-Contract", KAIROS_DIGITAL_ASSET_V2_BUILD);
  headers.set("X-Kairos-Digital-Asset-Writer", KAIROS_DIGITAL_ASSET_V2_WRITER_BUILD);
  headers.set("X-Kairos-Manufacturing-Orchestrator", KAIROS_MANUFACTURING_ORCHESTRATOR_BUILD);
  headers.set("X-Kairos-Customer-Delivery", CUSTOMER_DELIVERY_BUILD);
  headers.set("X-Kairos-Digital-Asset-Entry", BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
