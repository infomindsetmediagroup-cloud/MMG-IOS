export const KAIROS_REVENUE_REVIEW_CONTROLLER_BUILD = "kairos-revenue-review-controller-20260728-1";

export function createRevenueReviewController(options = {}) {
  const fetcher = options.fetcher || globalThis.fetch?.bind(globalThis);
  if (!fetcher) throw new Error("A revenue review fetcher is required.");

  async function loadLinks(runId, ttlSeconds = 900) {
    return request(`/api/kairos/revenue/first-runs/${encodeURIComponent(runId)}/review-links`, { ttlSeconds });
  }

  async function decide(runId, revenueProductId, assetId, decision, notes = "") {
    if (!new Set(["approved", "rejected"]).has(decision)) throw new Error("Decision must be approved or rejected.");
    if (decision === "rejected" && !String(notes).trim()) throw new Error("Rejection notes are required.");
    return request(`/api/kairos/revenue/first-runs/${encodeURIComponent(runId)}/review-asset`, { revenueProductId, assetId, decision, notes });
  }

  async function request(url, body) {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        Authorization: options.authorization || "",
        "CF-Access-Authenticated-User-Email": options.operatorEmail || "",
        "X-Kairos-Operator-Identity": options.operatorIdentityHash || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload?.error?.message || "Revenue review request failed."), { code: payload?.error?.code, status: response.status });
    return payload;
  }

  return Object.freeze({ loadLinks, decide, build: KAIROS_REVENUE_REVIEW_CONTROLLER_BUILD });
}
