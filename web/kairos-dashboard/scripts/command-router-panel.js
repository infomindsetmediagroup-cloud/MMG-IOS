import { getCommands, runCommand } from "./command-router.js";

function renderCommandRouterPanel() {
  const view = document.querySelector("#dashboard-view");
  if (!view || view.querySelector("[data-command-router]")) return;

  const commands = getCommands();
  const card = document.createElement("article");
  card.className = "card full";
  card.dataset.commandRouter = "true";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <p class="eyebrow">Command Router</p>
        <h3>Executable Command Layer</h3>
      </div>
      <span class="badge good">${commands.length} Ready</span>
    </div>
    <div class="list">
      ${commands.map(command => `
        <div class="list-item">
          <div>
            <strong>${command.title}</strong>
            <p class="muted">${command.route} • ${command.description}</p>
          </div>
          <div class="action-row" style="margin-top:0;">
            <span class="badge good">${command.status}</span>
            <button class="action-button" data-run-command="${command.id}">Run</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  view.prepend(card);

  card.querySelectorAll("[data-run-command]").forEach(button => {
    button.addEventListener("click", () => {
      runCommand(button.dataset.runCommand);
      card.remove();
      renderCommandRouterPanel();
    });
  });
}

const observer = new MutationObserver(() => renderCommandRouterPanel());
window.addEventListener("DOMContentLoaded", () => {
  const view = document.querySelector("#dashboard-view");
  if (view) observer.observe(view, { childList: true });
  renderCommandRouterPanel();
});

window.addEventListener("kairos:auth", renderCommandRouterPanel);
