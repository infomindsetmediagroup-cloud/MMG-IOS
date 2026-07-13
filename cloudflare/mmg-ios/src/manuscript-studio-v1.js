import { intelligenceConfigured, parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";

const MAX_CHARS = 180000;

export async function handleManuscriptRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/manuscript/capabilities" && request.method === "GET") {
    return json({
      status: intelligenceConfigured(env) ? "ready" : "needs-configuration",
      version: "manuscript-studio-v2",
      supportedInput: [
        "text/plain",
        "text/markdown",
        "application/rtf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/pdf"
      ],
      maxCharacters: MAX_CHARS,
      intelligenceRuntime: "kairos-private-runtime",
      intelligenceConfigured: intelligenceConfigured(env),
      stages: ["intake", "text_extraction", "editorial_analysis", "revision_proposed", "customer_review", "revision_approved", "kdp_readiness_review", "ready_for_export"],
      limitations: ["PDF files must contain selectable text; OCR is not enabled.", "Final acceptance remains with Amazon KDP."],
    });
  }

  if (url.pathname === "/api/manuscript/review" && request.method === "POST") {
    if (!intelligenceConfigured(env)) {
      return json({ status: "blocked", error: { code: "kairos_inference_not_configured", message: "Kairos private intelligence runtime must be connected before manuscript review can run." } }, 503);
    }

    const body = await request.json();
    const title = String(body?.title || "Untitled manuscript").trim().slice(0, 200);
    const manuscript = String(body?.manuscript || "");
    if (manuscript.length < 50) return json({ status: "needs-input", error: { code: "manuscript_required", message: "Provide at least 50 characters of manuscript text." } }, 400);
    if (manuscript.length > MAX_CHARS) return json({ status: "needs-input", error: { code: "manuscript_too_large", message: `This live review supports up to ${MAX_CHARS.toLocaleString()} characters per pass.` } }, 413);

    const source = body?.source && typeof body.source === "object" ? {
      name: String(body.source.name || "").slice(0, 260),
      format: String(body.source.format || "text").slice(0, 20),
      checksum: String(body.source.checksum || "").slice(0, 128),
      pages: Number(body.source.pages || 0) || undefined,
    } : null;

    const inference = await runKairosIntelligence(env, {
      temperature: 0.1,
      maxTokens: 16000,
      system: "You are Kairos Publishing Studio for Mindset Media Group. Perform a conservative professional manuscript edit. Preserve the author's meaning, facts, and voice. Correct grammar, spelling, punctuation, consistency, chapter and heading structure, front matter, back matter, paragraph flow, and obvious Amazon KDP readiness concerns. Do not invent facts, citations, people, claims, or content. Return JSON only with keys: summary, issues (array of objects with category, severity, location, problem, recommendation), revisedManuscript, kdpReadiness (object with status, blockingIssues, warnings, checklist), disclaimer. kdpReadiness.status must be ready, ready_with_warnings, or revision_required. The disclaimer must say this is an MMG KDP-readiness review and Amazon KDP makes final acceptance decisions.",
      user: `TITLE: ${title}\nSOURCE FORMAT: ${source?.format || "text"}\n\nMANUSCRIPT:\n${manuscript}`,
    });

    const result = parseStrictJSON(inference.text);
    validateEditorialResult(result);
    return json({
      status: "customer_review",
      reviewID: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title,
      source,
      originalChecksum: await sha256(manuscript),
      intelligence: { provider: inference.provider, model: inference.model },
      result,
    });
  }

  return null;
}

function validateEditorialResult(result) {
  if (!result || typeof result !== "object") throw Object.assign(new Error("Kairos returned an invalid editorial result."), { code: "invalid_editorial_result", statusCode: 502 });
  if (typeof result.revisedManuscript !== "string") throw Object.assign(new Error("Kairos did not return a revised manuscript."), { code: "revised_manuscript_missing", statusCode: 502 });
  if (!Array.isArray(result.issues)) result.issues = [];
  if (!result.kdpReadiness || typeof result.kdpReadiness !== "object") result.kdpReadiness = { status: "revision_required", blockingIssues: [], warnings: ["KDP readiness details were incomplete."], checklist: [] };
  if (!result.disclaimer) result.disclaimer = "This is an MMG KDP-readiness review. Amazon KDP makes final acceptance decisions.";
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
