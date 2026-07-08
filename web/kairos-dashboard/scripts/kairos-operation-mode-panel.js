document.addEventListener('DOMContentLoaded', function () {
  const root = document.querySelector('#dashboard-view');
  if (!root || root.querySelector('[data-kairos-operation-mode-panel]')) return;

  const card = document.createElement('article');
  card.className = 'card full';
  card.dataset.kairosOperationModePanel = 'true';
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Execution Mode</p>
        <h3>Kairos Operation Mode</h3>
      </div>
      <span class="badge success">Active</span>
    </div>
    <div class="split-panel">
      <div>
        <p class="muted">The architecture and Codex phase is frozen for execution. Dashboard completion, repository implementation, operational assets, website system work, and Kairos runtime readiness are now the active production track.</p>
        <div class="list">
          <div class="list-item"><div><strong>Primary Objective</strong><p class="muted">Finish the dashboard and prepare Kairos for operational command use.</p></div><span class="badge success">Now</span></div>
          <div class="list-item"><div><strong>Development Standard</strong><p class="muted">Batch implementation work with skip-CI commits until final validation/deployment.</p></div><span class="badge">Protected</span></div>
          <div class="list-item"><div><strong>Official Kairos Asset</strong><p class="muted">Use the approved Kairos button asset consistently across the system.</p></div><span class="badge success">Locked</span></div>
        </div>
      </div>
      <div class="asset-card" aria-label="Official Kairos button asset">
        <img src="https://cdn.shopify.com/s/files/1/0754/4337/2186/files/kiaros_button.jpg?v=1783474371" alt="Official Kairos button asset" loading="lazy">
      </div>
    </div>`;
  root.prepend(card);
});
