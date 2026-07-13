const MAX_CHARS = 180000;

export async function handleManuscriptRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === "/api/manuscript/capabilities" && request.method === "GET") {
    return json({
      status: "intake-ready",
      version: "manuscript-studio-v4-production-intake",
      supportedInput: [
        "text/plain",
        "text/markdown",
        "application/rtf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/pdf"
      ],
      maxCharacters: MAX_CHARS,
      launchMode: "manuscript-production-intake",
      availableStages: ["intake", "text_extraction", "source_validation", "production_intake", "customer_review_preparation"],
      deferredStages: ["automated_editorial_analysis", "automated_revision_proposal", "automated_kdp_readiness_review"],
      capabilities: {
        txtIntake: "operational",
        markdownIntake: "operational",
        rtfIntake: "operational",
        docxExtraction: "operational",
        pdfTextExtraction: "operational",
        productionIntakeAdvance: "operational",
        pdfOCR: "not-enabled",
        automatedManuscriptEditorialReview: "deferred",
        automatedKdpReadinessReview: "deferred"
      },
      limitations: [
        "PDF files must contain selectable text; OCR is not enabled.",
        "Automated manuscript editing and KDP-readiness analysis are deferred until an approved MMG intelligence runtime is activated.",
        "Human editorial and production work may continue through the governed MMG workflow.",
        "Final acceptance remains with Amazon KDP."
      ]
    });
  }

  if (url.pathname === "/api/manuscript/intake/advance" && request.method === "POST") {
    const body = await request.json();
    const title = String(body?.title || "Untitled manuscript").trim().slice(0, 200);
    const manuscript = String(body?.manuscript || "");
    const source = body?.source && typeof body.source === "object" ? {
      name: String(body.source.name || "manuscript").slice(0, 260),
      format: String(body.source.format || "text").slice(0, 20),
      checksum: String(body.source.checksum || "").slice(0, 128),
      pages: Number(body.source.pages || 0) || undefined,
      size: Number(body.source.size || 0) || undefined,
    } : null;

    if (manuscript.trim().length < 50) {
      return json({ status: "needs-input", error: { code: "manuscript_required", message: "A validated extracted manuscript is required before production intake." } }, 400);
    }
    if (manuscript.length > MAX_CHARS) {
      return json({ status: "needs-input", error: { code: "manuscript_too_large", message: `Production intake supports up to ${MAX_CHARS.toLocaleString()} extracted characters in this launch build.` } }, 413);
    }

    const createdAt = new Date().toISOString();
    const wordCount = countWords(manuscript);
    const manuscriptChecksum = await sha256(manuscript);
    const projectID = `PUB-${crypto.randomUUID()}`;
    const intakeID = `INT-${crypto.randomUUID()}`;

    return json({
      status: "production_intake",
      projectID,
      intakeID,
      createdAt,
      title,
      manuscript: {
        source,
        wordCount,
        characterCount: manuscript.length,
        checksum: manuscriptChecksum,
        extractionStatus: "validated",
        preservedOriginal: true,
      },
      workflow: {
        currentStage: "production_intake",
        completedStages: ["manuscript_received", "text_extracted", "source_validated", "production_record_created"],
        nextStage: "project_setup",
        requiredNextActions: [
          "Confirm author and publication metadata",
          "Select the purchased or approved publishing service",
          "Upload customer-supplied cover artwork",
          "Assign the manuscript to the editorial and production queue",
          "Prepare the first customer review milestone"
        ],
        automatedIntelligenceUsed: false,
        externalActionTaken: false,
      },
      customerMessage: "Your manuscript has been accepted into MMG production intake. The project record is ready for setup and assignment.",
    });
  }

  if (url.pathname === "/api/manuscript/review" && request.method === "POST") {
    return json({
      status: "deferred",
      error: {
        code: "manuscript_intelligence_deferred",
        message: "Automated editing is deferred. Advance the extracted manuscript into MMG production intake to continue the project."
      }
    }, 503);
  }

  return null;
}

function countWords(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
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
