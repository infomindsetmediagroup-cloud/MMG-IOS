import { executePaletteCommand, getPaletteHistory, searchPalette } from "./command-palette.js";

function renderCommandPalettePanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-command-palette-panel]")) return;

  const history = getPaletteHistory();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.commandPalettePanel = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Palette</p>
        <h3>Command Palette</h3>
      </div>
      <span class="badge good">⌘K</span>
    </div>
    <form class="auth-form" data-palette-form style="margin-top:16px;">
      <input data-palette-input placeholder="Search or run a command...">
      <button class="action-button" type="submit">Execute</button>
    </form>
    <div class="list" data-palette-results style="margin-top:16px;">
      ${history.length ? history.slice(0, 5).map(item => `<div class="list-item"><strong>${item.command}</strong><span class="badge">${item.status}</span></div>`).join("") : `<div class="list-item"><strong>No palette history</strong><span class="badge warning">Standby</span></div>`}
    </div>
  `;
  view.prepend(card);

  const form = card.querySelector("[data-palette-form]");
  const input = card.querySelector("[data-palette-input]");
  const results = card.querySelector("[data-palette-results]");

  input.addEventListener("input", () => {
    const matches = searchPalette(input.value);
    results.innerHTML = matches.length
      ? matches.map(item => `<div class="list-item"><strong>${item.title}</strong><button class="action-button" data-palette-run="${item.id}">Run</button></div>`).join("")
      : `<div class="list-item"><strong>Press Execute to route as intent</strong><span class="badge warning">Intent</span></div>`;
    results.querySelectorAll("[data-palette-run]").forEach(button => {
      button.addEventListener("click", () => {
        executePaletteCommand(button.dataset.paletteRun);
        card.remove();
        renderCommandPalettePanel();
      });
    });
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    executePaletteCommand(input.value);
    card.remove();
    renderCommandPalettePanel();
  });
}

const observer = new MutationObserver(() => renderCommandPalettePanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCommandPalettePanel();
});

window.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.querySelector("[data-palette-input]")?.focus();
  }
});

window.addEventListener("kairos:auth", renderCommandPalettePanel);
