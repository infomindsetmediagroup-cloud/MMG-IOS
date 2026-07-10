const operatorKey = "kairos.operator.v1";
const sameOriginRuntime = window.location.hostname.endsWith("vercel.app");

window.addEventListener("DOMContentLoaded", initializeAuthentication);

async function initializeAuthentication() {
  const app = document.querySelector("#app");
  if (!app) return;
  lockApp(app);

  if (!sameOriginRuntime) {
    createRecoveryShell(app);
    return;
  }

  try {
    const response = await fetch("/api/session", {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "include",
    });
    const body = await readJSON(response);
    if (response.ok && body.status === "authenticated") {
      unlockApp(app);
      dispatchAuthenticated(body.session);
      return;
    }
  } catch {
    // The login shell below remains the safe failure state.
  }

  createOperatorShell(app);
}

function createOperatorShell(app) {
  const shell = document.createElement("section");
  shell.className = "auth-shell";
  shell.innerHTML = `
    <div class="auth-card">
      <div class="brand-symbol auth-symbol">K</div>
      <p class="eyebrow">Kairos Secure Access</p>
      <h2>Operator Login</h2>
      <p class="muted">Authenticate to open the MMG Command Center and Live Kairos.</p>
      <form id="auth-form" class="auth-form">
        <input id="operator-name" autocomplete="name" placeholder="Operator name" maxlength="80" required>
        <input id="operator-access-key" type="password" autocomplete="current-password" placeholder="Operator access key" required>
        <button class="action-button" type="submit">Open Kairos</button>
      </form>
      <p class="muted auth-note" data-auth-status>Your access key is exchanged for a short-lived secure session and is never stored in the browser.</p>
    </div>
  `;
  document.body.appendChild(shell);

  const form = shell.querySelector("#auth-form");
  const nameInput = shell.querySelector("#operator-name");
  const keyInput = shell.querySelector("#operator-access-key");
  const submitButton = form.querySelector("button[type=submit]");
  const status = shell.querySelector("[data-auth-status]");
  nameInput.value = localStorage.getItem(operatorKey) || "Mike";
  nameInput.focus();

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const operator = nameInput.value.trim();
    const accessKey = keyInput.value;
    if (!operator || !accessKey) return;

    submitButton.disabled = true;
    status.textContent = "Authenticating…";
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ operator, accessKey }),
      });
      const body = await readJSON(response);
      keyInput.value = "";
      if (!response.ok) {
        status.textContent = body.message || "Operator access was denied.";
        return;
      }
      localStorage.setItem(operatorKey, operator);
      unlockApp(app);
      shell.remove();
      dispatchAuthenticated(body.session);
    } catch {
      keyInput.value = "";
      status.textContent = "The authentication service is unavailable. Try again shortly.";
    } finally {
      submitButton.disabled = false;
    }
  });
}

function createRecoveryShell(app) {
  const shell = document.createElement("section");
  shell.className = "auth-shell";
  shell.innerHTML = `
    <div class="auth-card">
      <div class="brand-symbol auth-symbol">K</div>
      <p class="eyebrow">Kairos Recovery Surface</p>
      <h2>GitHub Pages</h2>
      <p class="muted">The canonical authenticated Command Center is hosted on Vercel. This page remains available only for controlled recovery.</p>
      <a class="action-button" href="https://mmg-ios.vercel.app/web/kairos-dashboard/">Open Secure Kairos</a>
      <button class="action-button" type="button" data-open-recovery>Open Recovery Dashboard</button>
    </div>
  `;
  document.body.appendChild(shell);
  shell.querySelector("[data-open-recovery]").addEventListener("click", () => {
    unlockApp(app);
    shell.remove();
  });
}

window.kairosSignOut = async function kairosSignOut() {
  if (sameOriginRuntime) {
    try { await fetch("/api/session", { method: "DELETE", credentials: "include" }); } catch {}
  }
  window.location.reload();
};

function lockApp(app) {
  app.style.filter = "blur(10px)";
  app.style.pointerEvents = "none";
}

function unlockApp(app) {
  app.style.filter = "";
  app.style.pointerEvents = "";
}

function dispatchAuthenticated(session) {
  window.dispatchEvent(new CustomEvent("kairos:auth", { detail: { session, operator: session?.operator } }));
}

async function readJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}
