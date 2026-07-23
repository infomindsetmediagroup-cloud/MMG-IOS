export const KAIROS_PUBLISHING_EXPERIENCE_BUILD = "kairos-publishing-experience-20260723-1";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const APPROVAL = "APPROVE PACKAGE";

export async function handlePublishingExperience(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/experience\/approve-package$/i);
  if (!match) return null;
  if (request.method !== "POST") return json({ status: "failed", error: { code: "method_not_allowed", message: "Package approval requires POST." } }, 405);
  if (!env?.KAIROS_PROJECTS) return json({ status: "failed", error: { code: "storage_unavailable", message: "Kairos project storage is not configured." } }, 503);

  try {
    const body = await request.json().catch(() => ({}));
    if (String(body?.confirmation || "") !== APPROVAL) {
      return json({ status: "failed", error: { code: "package_approval_required", message: `confirmation must equal ${APPROVAL}.` } }, 403);
    }

    const projectId = match[1];
    const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
    const currentResponse = await stub.fetch(`https://kairos.internal/registry/manuscripts/${projectId}/auto-pipeline`);
    const current = await currentResponse.json().catch(() => null);
    if (!currentResponse.ok || !current) return json({ status: "failed", error: { code: "package_not_ready", message: "Build and preview the production package before approval." } }, 409);
    if (current.status !== "production-ready" && current.status !== "package-approved") {
      return json({ status: "failed", error: { code: "package_state_invalid", message: "The production package is not ready for approval." } }, 409);
    }
    if (!current.vault?.integrity?.passed || !current.vault?.packageDownloadURL) {
      return json({ status: "failed", error: { code: "vault_integrity_failed", message: "The package cannot be approved until the Asset Vault integrity check passes." } }, 409);
    }

    const approvedAt = new Date().toISOString();
    const next = {
      ...current,
      status: "package-approved",
      packageApproval: {
        approved: true,
        approvedAt,
        approvedBy: String(body?.actor || "MMG Executive").slice(0, 120),
        signature: current.signature,
        assetCount: Number(current.vault?.assetCount || current.vault?.assets?.length || 0),
        integrityPassed: true,
        immutableVersion: true,
      },
      updatedAt: approvedAt,
      nextAction: "The approved job is complete in the Admin Asset Vault. Preview the Shopify product when ready.",
    };
    const saved = await stub.fetch(`https://kairos.internal/registry/manuscripts/${projectId}/auto-pipeline`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!saved.ok) return json({ status: "failed", error: { code: "package_approval_save_failed", message: "Kairos could not preserve the package approval." } }, 502);
    return json(next);
  } catch (error) {
    return json({ status: "failed", error: { code: "package_approval_failed", message: error instanceof Error ? error.message : "Package approval failed." } }, 500);
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Publishing-Experience": KAIROS_PUBLISHING_EXPERIENCE_BUILD,
    },
  });
}
