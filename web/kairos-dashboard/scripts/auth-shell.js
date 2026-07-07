const sessionKey = "kairos.session.v1";
const operatorKey = "kairos.operator.v1";

function sessionActive() {
  return sessionStorage.getItem(sessionKey) === "active";
}

function createAuthShell() {
  const app = document.querySelector("#app");
  if (!app || sessionActive()) return;

  app.style.filter = "blur(10px)";
  app.style.pointerEvents = "none";

  const shell = document.createElement("section");
  shell.className = "auth-shell";
  shell.innerHTML = `
    <div class="auth-card">
      <div class="brand-symbol auth-symbol">K</div>
      <p class="eyebrow">Kairos Access</p>
      <h2>Operator Login</h2>
      <p class="muted">Enter your operator name to open the Phase 1 command center.</p>
      <form id="auth-form" class="auth-form">
        <input id="operator-name" autocomplete="name" placeholder="Operator name" required>
        <button class="action-button" type="submit">Open Kairos</button>
      </form>
      <p class="muted auth-note">Phase 1 local browser session. Full authentication layer remains queued.</p>
    </div>
  `;
  document.body.appendChild(shell);

  const input = shell.querySelector("#operator-name");
  input.value = localStorage.getItem(operatorKey) || "Mike";
  input.focus();

  shell.querySelector("#auth-form").addEventListener("submit", event => {
    event.preventDefault();
    localStorage.setItem(operatorKey, input.value.trim() || "Mike");
    sessionStorage.setItem(sessionKey, "active");
    app.style.filter = "";
    app.style.pointerEvents = "";
    shell.remove();
    window.dispatchEvent(new CustomEvent("kairos:auth", { detail: { operator: input.value.trim() || "Mike" } }));
  });
}

window.addEventListener("DOMContentLoaded", createAuthShell);
