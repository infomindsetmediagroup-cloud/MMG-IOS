import { getCommandCenterStore, updateWorkItem } from "./executive-command-center-store.js";

const HANDLED_ACTIONS = new Set(["website.change.package", "shopify.theme.files.upsert"]);
const REQUEST_TIMEOUT_MS = 75000;
const BUILD = "command-center-website-proposal-resilience-20260711-38";

recoverInterruptedWebsiteProposal();

window.addEventListener("kairos:execute-approved-action", event => {
  const action = event.detail || {};
  if (!action.id || action.id !== "WEB-002") return;
  if (!HANDLED_ACTIONS.has(action.actionType)) return;
  if ((action.phase || "prepare") === "execute") return;

  event.stopImmediatePropagation();
  prepareWebsiteProposal(action);
}, true);

async function prepareWebsiteProposal(action) {
  dispatchStatus(action.id, "Working", 40, "", null, "prepare");

  const progressTimer = setTimeout(() => {
    dispatchStatus(action.id, "Working", 65, "", null, "prepare");
  }, 12000);

  try {
    const response = await fetch("/api/theme-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-MMG-Client-Build": BUILD,
      },
      credentials: "include",
      body: JSON.stringify({
        objective: `${action.objective}\n\nUse authenticated Shopify Admin GraphQL evidence from the current published main theme. Prepare the smallest safe homepage-only mutation package. Do not use public storefront probing as source evidence. Return complete replacement content, current precondition hashes, explicit homepage-only scope, rollback evidence, and non-homepage regression criteria.`,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body = await readJSON(response);
    if (!response.ok) {
      throw new Error(body?.error?.message || body?.message || `Theme planning returned HTTP ${response.status}.`);
    }

    const files = Array.isArray(body?.mutationPlan?.files) ? body.mutationPlan.files : [];
    const validEvidence = body?.sourceEvidence?.adapter === "graphql-admin" && body?.sourceEvidence?.themeId;
    const validFiles = files.length > 0 && files.every(file =>
      typeof file?.key === "string" && file.key &&
      typeof file?.value === "string" && file.value.length > 0 &&
      typeof file?.expectedSha256 === "string" && file.expectedSha256.length >= 32
    );

    if (!validEvidence || !validFiles) {
      const reason = body?.summary || body?.message || "Shopify Admin evidence did not produce a complete executable homepage proposal.";
      dispatchStatus(action.id, "Needs Attention", 45, reason, {
        ...body,
        routedEndpoint: "/api/theme-plan",
        build: BUILD,
      }, "prepare");
      return;
    }

    dispatchStatus(action.id, "Proposal Ready", 100, "", {
      ...body,
      routedEndpoint: "/api/theme-plan",
      build: BUILD,
    }, "prepare");
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    const message = timedOut
      ? "Shopify theme planning did not complete within 75 seconds. The request was stopped safely. Retry once; no theme files were changed."
      : error instanceof Error ? error.message : "Shopify theme planning failed before producing a proposal.";
    dispatchStatus(action.id, "Needs Attention", 45, message, null, "prepare");
  } finally {
    clearTimeout(progressTimer);
  }
}

function recoverInterruptedWebsiteProposal() {
  const item = getCommandCenterStore().work.find(work => work.id === "WEB-002");
  if (!item || item.status !== "Working") return;

  updateWorkItem("WEB-002", {
    status: "Needs Attention",
    progress: 45,
    error: "The previous Shopify proposal request was interrupted before it returned a terminal result. Retry to run the bounded /api/theme-plan request.",
    updatedAt: "Interrupted proposal request recovered safely",
  });
}

function dispatchStatus(id, status, progress, error = "", result = null, phase = "prepare") {
  window.dispatchEvent(new CustomEvent("kairos:approved-action-status", {
    detail: { id, status, progress, error, result, phase },
  }));
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}
