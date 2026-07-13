const MAX_CHARS = 180000;
const MODEL = "gpt-5.6";

export async function handleManuscriptRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/manuscript/capabilities" && request.method === "GET") {
    return json({
      status: "ready",
      version: "manuscript-studio-v1",
      supportedInput: ["text/plain", "text/markdown", "application/rtf"],
      maxCharacters: MAX_CHARS,
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
      stages: ["intake", "editorial_analysis", "revision_proposed", "customer_review", "revision_approved", "kdp_readiness_review", "ready_for_export"],
      limitations: ["DOCX and PDF binary extraction are not enabled in this first live adapter.", "Final acceptance remains with Amazon KDP."],
    });
  }
  if (url.pathname === "/api/manuscript/review" && request.method === "POST") {
    if (!env.OPENAI_API_KEY) return json({ status: "blocked", error: { code: "openai_not_configured", message: "OPENAI_API_KEY is required for manuscript review." } }, 503);
    const body = await request.json();
    const title = String(body?.title || "Untitled manuscript").trim().slice(0, 200);
    const manuscript = String(body?.manuscript || "");
    if (manuscript.length < 50) return json({ status: "needs-input", error: { code: "manuscript_required", message: "Provide at least 50 characters of manuscript text." } }, 400);
    if (manuscript.length > MAX_CHARS) return json({ status: "needs-input", error: { code: "manuscript_too_large", message: `This live review supports up to ${MAX_CHARS.toLocaleString()} characters per pass.` } }, 413);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || MODEL,
        input: [
          { role: "system", content: [{ type: "input_text", text: "You are Kairos Publishing Studio for Mindset Media Group. Perform a conservative professional manuscript edit. Preserve the author's meaning and voice. Correct grammar, spelling, punctuation, consistency, chapter/heading structure, front matter, back matter, paragraph flow, and obvious KDP-readiness formatting concerns. Do not invent facts. Return strict JSON with keys: summary, issues (array of {category,severity,location,problem,recommendation}), revisedManuscript, kdpReadiness (object with status, blockingIssues, warnings, checklist), disclaimer. Status must be ready, ready_with_warnings, or revision_required. The disclaimer must state this is an MMG KDP-readiness review and Amazon KDP makes final acceptance decisions." }] },
          { role: "user", content: [{ type: "input_text", text: `TITLE: ${title}\n\nMANUSCRIPT:\n${manuscript}` }] },
        ],
        text: { format: { type: "json_object" } },
      }),
    });
    const data = await response.json();
    if (!response.ok) return json({ status: "failed", error: { code: "openai_review_failed", message: data?.error?.message || "The editorial review failed." } }, 502);
    const raw = data?.output_text || data?.output?.flatMap(x => x.content || []).find(x => x.type === "output_text")?.text || "{}";
    let result;
    try { result = JSON.parse(raw); } catch { return json({ status: "failed", error: { code: "invalid_editorial_response", message: "Kairos received an invalid editorial response." } }, 502); }
    return json({ status: "customer_review", reviewID: crypto.randomUUID(), createdAt: new Date().toISOString(), title, originalChecksum: await sha256(manuscript), result });
  }
  return null;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
