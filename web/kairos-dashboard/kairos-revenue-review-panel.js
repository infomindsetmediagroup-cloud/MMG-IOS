export const KAIROS_REVENUE_REVIEW_PANEL_BUILD = "kairos-revenue-review-panel-20260728-1";

export function renderKairosRevenueReviewPanel(root, payload = {}) {
  if (!root) throw new Error("Revenue review panel root is required.");
  const links = Array.isArray(payload.links) ? payload.links : [];
  root.replaceChildren();
  root.dataset.kairosRevenueReviewBuild = KAIROS_REVENUE_REVIEW_PANEL_BUILD;
  root.dataset.automaticPublication = "disabled";
  const section = document.createElement("section");
  section.className = "kairos-revenue-review";
  const heading = document.createElement("h2");
  heading.textContent = "Revenue Asset Review";
  const summary = document.createElement("p");
  summary.textContent = links.length ? `${links.length} generated assets ready for operator review.` : "No generated assets are ready for review.";
  const list = document.createElement("ul");
  for (const link of links) {
    const item = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = `${label(link.type)} — ${link.filename || link.assetId}`;
    anchor.dataset.assetId = link.assetId;
    const expiry = document.createElement("span");
    expiry.textContent = link.expiresAt ? ` Expires ${new Date(link.expiresAt).toLocaleString()}` : "";
    item.append(anchor, expiry);
    list.append(item);
  }
  section.append(heading, summary, list);
  root.append(section);
  return Object.freeze({ assetCount: links.length, automaticPublicationAllowed: false, build: KAIROS_REVENUE_REVIEW_PANEL_BUILD });
}

function label(type) {
  return String(type || "asset").split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
