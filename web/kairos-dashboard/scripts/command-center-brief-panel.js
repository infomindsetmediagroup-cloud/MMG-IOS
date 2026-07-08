import { getCommandCenterBrief } from './command-center-brief-engine.js';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[character]));
}

function customerValueMarkup(brief) {
  const value = brief.customerValue;
  if (!value) return '';

  return `
    <div class="list-item" style="margin-top:16px;">
      <div>
        <strong>${escapeHtml(value.promise)}</strong>
        <p class="muted">${escapeHtml(value.support)}</p>
        <p class="muted">${escapeHtml(value.nextAction)}</p>
      </div>
      <span class="badge good">Value</span>
    </div>
  `;
}

function render() {
  const view = document.querySelector('#dashboard-view');
  if (!view || view.querySelector('[data-command-center-brief-panel]')) return;

  const brief = getCommandCenterBrief();
  const card = document.createElement('article');
  card.className = 'card full';
  card.dataset.commandCenterBriefPanel = 'true';
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Brief</p>
        <h3>${escapeHtml(brief.title)}</h3>
      </div>
      <span class="${brief.status === 'EXECUTE' ? 'badge good' : 'badge warning'}">${escapeHtml(brief.status)}</span>
    </div>
    <p class="muted" style="margin-top:12px;">${escapeHtml(brief.summary)} • ${escapeHtml(brief.updated)}</p>
    <div class="list" style="margin-top:16px;">
      <div class="list-item">
        <div>
          <strong>${escapeHtml(brief.primary)}</strong>
          <p class="muted">Primary command</p>
        </div>
        <span class="badge good">Primary</span>
      </div>
      ${customerValueMarkup(brief)}
      ${brief.tasks.slice(1).map((item, index) => `
        <div class="list-item">
          <strong>${index + 2}. ${escapeHtml(item)}</strong>
          <span class="badge">Task</span>
        </div>
      `).join('')}
    </div>
  `;

  view.prepend(card);
}

const observer = new MutationObserver(render);

window.addEventListener('DOMContentLoaded', () => {
  const view = document.querySelector('#dashboard-view');
  if (view) observer.observe(view, { childList: true });
  render();
});

window.addEventListener('kairos:auth', render);
