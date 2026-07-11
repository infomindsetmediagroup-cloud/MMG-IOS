export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        status: "ok",
        service: "kairos-shopify-publisher",
        configured: Boolean(
          env.SHOPIFY_CLIENT_ID &&
          env.SHOPIFY_CLIENT_SECRET &&
          env.SHOPIFY_SHOP_DOMAIN &&
          env.KAIROS_ADMIN_KEY
        ),
      });
    }

    if (url.pathname === "/auth/callback") {
      return html(`
        <main class="card">
          <span class="eyebrow">MMG / KAIROS</span>
          <h1>Shopify bridge is online.</h1>
          <p>Return to the publisher to test the secured Shopify connection.</p>
          <a class="button" href="/">Open Publisher</a>
        </main>
      `);
    }

    if (url.pathname === "/api/themes") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);

      const suppliedKey = request.headers.get("X-Kairos-Admin-Key") || "";
      if (!env.KAIROS_ADMIN_KEY || suppliedKey !== env.KAIROS_ADMIN_KEY) {
        return json({ status: "error", code: "unauthorized", message: "Publisher access key was rejected." }, 401);
      }

      try {
        const config = getConfig(env);
        const accessToken = await getShopifyAccessToken(config);
        const response = await fetch(`https://${config.shop}/admin/api/2026-07/themes.json`, {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            Accept: "application/json",
          },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          return json({ status: "error", code: "shopify_api_error", shopifyStatus: response.status, details: data }, 502);
        }
        return json({
          status: "connected",
          shop: config.shop,
          themes: Array.isArray(data.themes)
            ? data.themes.map((theme) => ({ id: theme.id, name: theme.name, role: theme.role, updatedAt: theme.updated_at }))
            : [],
        });
      } catch (error) {
        return json({ status: "error", code: "connection_failed", message: error instanceof Error ? error.message : "The Shopify connection failed." }, 500);
      }
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return html(`
        <main class="card">
          <span class="eyebrow">MMG / KAIROS</span>
          <h1>Shopify Publisher</h1>
          <p>Secure connection bridge between Kairos and the Mindset Media Group Shopify store.</p>
          <label for="accessKey">Publisher access key</label>
          <input id="accessKey" type="password" autocomplete="current-password" placeholder="Enter access key" />
          <button id="connectButton" class="button" type="button">Test Shopify Connection</button>
          <div id="status" class="status" aria-live="polite">Waiting for connection test.</div>
          <div id="themes"></div>
        </main>
        <script>
          const button = document.getElementById("connectButton");
          const input = document.getElementById("accessKey");
          const statusBox = document.getElementById("status");
          const themesBox = document.getElementById("themes");
          button.addEventListener("click", async () => {
            const key = input.value.trim();
            if (!key) { statusBox.textContent = "Enter the publisher access key."; statusBox.className = "status error"; return; }
            button.disabled = true;
            statusBox.textContent = "Connecting securely to Shopify…";
            statusBox.className = "status";
            themesBox.innerHTML = "";
            try {
              const response = await fetch("/api/themes", { headers: { "X-Kairos-Admin-Key": key } });
              const data = await response.json();
              if (!response.ok) throw new Error(data.message || "Connection failed.");
              statusBox.textContent = `Connected to ${data.shop}. ${data.themes.length} theme(s) found.`;
              statusBox.className = "status success";
              themesBox.innerHTML = data.themes.map((theme) => `<article class="theme"><div><strong>${escapeHtml(theme.name)}</strong><span>${escapeHtml(theme.role === "main" ? "Published" : String(theme.role))}</span></div><code>${escapeHtml(String(theme.id))}</code></article>`).join("");
            } catch (error) {
              statusBox.textContent = error instanceof Error ? error.message : "Connection failed.";
              statusBox.className = "status error";
            } finally { button.disabled = false; }
          });
          function escapeHtml(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
        </script>
      `);
    }

    return json({ status: "error", code: "not_found" }, 404);
  },
};

function getConfig(env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  const shop = String(env.SHOPIFY_SHOP_DOMAIN || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!clientId) throw new Error("SHOPIFY_CLIENT_ID is not configured.");
  if (!clientSecret) throw new Error("SHOPIFY_CLIENT_SECRET is not configured.");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new Error("SHOPIFY_SHOP_DOMAIN is not configured correctly.");
  return { clientId, clientSecret, shop };
}

async function getShopifyAccessToken(config) {
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret });
  const response = await fetch(`https://${config.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Shopify did not issue an access token.");
  return data.access_token;
}

function html(content) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Kairos Shopify Publisher</title><style>:root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,sans-serif;background:#05090d;color:#f6f8fa}*{box-sizing:border-box}body{min-height:100vh;margin:0;padding:24px;display:grid;place-items:center;background:radial-gradient(circle at top,#12364a 0,transparent 38%),#05090d}.card{width:min(100%,680px);padding:32px;border:1px solid rgba(87,191,255,.25);border-radius:24px;background:rgba(11,19,27,.94);box-shadow:0 30px 90px rgba(0,0,0,.45)}.eyebrow{color:#66c9ff;font-size:12px;font-weight:800;letter-spacing:.18em}h1{margin:12px 0;font-size:clamp(34px,8vw,58px);line-height:.98}p{color:#aebdca;line-height:1.6}label{display:block;margin:26px 0 8px;font-weight:700}input{width:100%;min-height:52px;padding:0 16px;border:1px solid #314252;border-radius:14px;background:#071019;color:#fff;font-size:16px}.button{width:100%;min-height:52px;margin-top:14px;border:0;border-radius:14px;background:linear-gradient(135deg,#1d8fff,#58c7ff);color:#00111c;font-size:16px;font-weight:850;cursor:pointer;text-decoration:none;display:grid;place-items:center}.button:disabled{opacity:.55}.status{margin-top:18px;padding:14px;border-radius:12px;background:#101a23;color:#cbd7e1}.status.success{background:#092319;color:#8ef0bd}.status.error{background:#2b1015;color:#ff9ca8}.theme{margin-top:12px;padding:15px;border:1px solid #263746;border-radius:14px;display:flex;justify-content:space-between;gap:16px;background:#09121a}.theme div{display:grid;gap:5px}.theme span,.theme code{color:#8fa5b7;font-size:13px}</style></head><body>${content}</body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;",
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
