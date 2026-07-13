const MAX_CHARS = 180000;

export async function handleManuscriptRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === "/api/manuscript/capabilities" && request.method === "GET") {
    return json({
      status: "intake-ready",
      version: "manuscript-studio-v3-launch-boundary",
      supportedInput: [
        "text/plain",
        "text/markdown",
        "application/rtf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/pdf"
      ],
      maxCharacters: MAX_CHARS,
      launchMode: "manuscript-intake-only",
      availableStages: ["intake", "text_extraction", "source_validation", "customer_review_preparation"],
      deferredStages: ["editorial_analysis", "revision_proposed", "kdp_readiness_review", "ready_for_export"],
      capabilities: {
        txtIntake: "operational",
        markdownIntake: "operational",
        rtfIntake: "operational",
        docxExtraction: "operational",
        pdfTextExtraction: "operational",
        pdfOCR: "not-enabled",
        manuscriptEditorialReview: "deferred",
        kdpReadinessReview: "deferred"
      },
      limitations: [
        "PDF files must contain selectable text; OCR is not enabled.",
        "Automated manuscript editing and KDP-readiness analysis are deferred until an approved MMG intelligence runtime is activated.",
        "Final acceptance remains with Amazon KDP."
      ]
    });
  }

  if (url.pathname === "/api/manuscript/review" && request.method === "POST") {
    return json({
      status: "deferred",
      error: {
        code: "manuscript_intelligence_deferred",
        message: "Manuscript intake and text extraction are available. Automated editing and KDP-readiness analysis are deferred for the current launch."
      }
    }, 503);
  }

  return null;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
