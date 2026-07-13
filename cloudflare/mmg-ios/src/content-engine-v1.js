const TYPES = ["social_content", "product_asset_copy", "book_package"];

export async function handleContentEngineRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === "/api/content/capabilities" && request.method === "GET") {
    return json({
      status: "deferred",
      version: "content-engine-v2-launch-boundary",
      launchMode: "non-generative-production",
      supportedTypes: TYPES,
      intelligenceRuntime: "not-active",
      productionActions: {
        governedWebsiteRetool: "operational",
        shopifyExecution: "operational",
        assetOrganization: "operational",
        manuscriptIntake: "operational",
        docxExtraction: "operational",
        pdfTextExtraction: "operational",
        socialContentGeneration: "deferred",
        productAssetCopyGeneration: "deferred",
        bookGeneration: "deferred"
      },
      mediaGeneration: {
        image: "not-enabled",
        video: "not-enabled",
        audio: "not-enabled"
      },
      message: "Generative text production is deferred until an approved MMG intelligence runtime is activated. No external provider or fallback is used."
    });
  }

  if (url.pathname === "/api/content/generate" && request.method === "POST") {
    return json({
      status: "deferred",
      error: {
        code: "content_intelligence_deferred",
        message: "Social content, product-copy, and book generation are deferred for the current launch. Kairos will not route this work to an external model provider."
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
