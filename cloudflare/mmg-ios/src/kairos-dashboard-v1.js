import {
  createAutonomyLedgerClient,
  KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
} from "./autonomy/kairos-autonomy-ledger-client-v1.js";
import {
  evaluateAutonomousOperationsActivation,
  KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
} from "./autonomy/kairos-autonomous-operations-cycle-v1.js";
import { KAIROS_AUTONOMY_API_BUILD } from "./autonomy/kairos-autonomy-api-v5.js";
import { KAIROS_AUTONOMY_SCHEDULER_BUILD } from "./autonomy/kairos-autonomy-scheduler-v2.js";
import { KAIROS_BUSINESS_PRIORITIZER_BUILD } from "./autonomy/kairos-business-prioritizer-v1.js";
import { KAIROS_BUSINESS_ORCHESTRATOR_BUILD } from "./autonomy/kairos-business-orchestrator-v1.js";

export const KAIROS_DASHBOARD_BUILD = "kairos-dashboard-20260802-1";
export const KAIROS_DASHBOARD_PATH = "/kairos";
export const KAIROS_DASHBOARD_OVERVIEW_PATH = "/api/kairos-dashboard/overview";

const DASHBOARD_PATHS = new Set([
  KAIROS_DASHBOARD_PATH,
  "/kairos/",
  "/dashboard",
  "/dashboard/",
  "/app",
  "/app/",
]);
const TENANT_ID = "mmg";
const RECENT_SNAPSHOT_LIMIT = 12;
const HTML_NONCE = "kairos-dashboard-v1";

export async function handleKairosDashboardRequest(request, env = {}, ctx = {}, options = {}) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }

  const method = String(request.method || "GET").toUpperCase();
  if (DASHBOARD_PATHS.has(url.pathname)) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD");
    const response = dashboardHtmlResponse();
    return method === "HEAD" ? new Response(null, response) : response;
  }

  if (url.pathname === KAIROS_DASHBOARD_OVERVIEW_PATH) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD");
    const response = await dashboardOverviewResponse(env, options);
    return method === "HEAD" ? new Response(null, response) : response;
  }

  return null;
}

async function dashboardOverviewResponse(env, options) {
  const now = resolveNow(options);
  const operationsEnv = readOwnOption(options, "operationsEnv") || env;
  const activation = evaluateAutonomousOperationsActivation(operationsEnv, {
    workflowResolver: readOwnOption(options, "workflowResolver"),
  });
  const ledgerClient = readOwnOption(options, "ledgerClient") || createAutonomyLedgerClient(env);

  let latestResult = null;
  let recentResult = null;
  try {
    [latestResult, recentResult] = await Promise.all([
      ledgerClient.getLatestBusinessSnapshot(TENANT_ID),
      ledgerClient.listRecentBusinessSnapshots(TENANT_ID, RECENT_SNAPSHOT_LIMIT),
    ]);
  } catch {
    latestResult = null;
    recentResult = null;
  }

  const latestRecord = usableRecord(latestResult?.record) ? latestResult.record : null;
  const businessState = usableObject(latestRecord?.businessState) ? latestRecord.businessState : null;
  const snapshot = usableObject(businessState?.snapshot) ? businessState.snapshot : null;
  const health = usableObject(snapshot?.health) ? snapshot.health : null;
  const collectionAgeMs = latestRecord?.storedAt
    ? Math.max(0, now.getTime() - Date.parse(latestRecord.storedAt))
    : null;
  const recentRecords = Array.isArray(recentResult?.records)
    ? recentResult.records.filter(usableRecord).slice(0, RECENT_SNAPSHOT_LIMIT)
    : [];

  const domains = Array.isArray(snapshot?.domains)
    ? snapshot.domains.map(projectDomain).filter(Boolean)
    : [];
  const signals = Array.isArray(snapshot?.recent)
    ? snapshot.recent.map(projectSignal).filter(Boolean).slice(0, 20)
    : [];
  const history = recentRecords.map(projectHistory).filter(Boolean);

  const status = activation.ready
    ? safeEnum(health?.overallStatus, ["healthy", "attention", "degraded", "blocked", "failed", "unknown"], "unknown")
    : "blocked";
  const attentionCount = domains.filter((domain) => domain.status !== "healthy" && domain.status !== "unknown").length;
  const latestAvailable = Boolean(latestRecord && snapshot);

  return json({
    ok: true,
    build: KAIROS_DASHBOARD_BUILD,
    generatedAt: now.toISOString(),
    tenantId: TENANT_ID,
    status,
    summary: {
      ready: activation.ready,
      latestAvailable,
      attentionRequired: Boolean(health?.attentionRequired),
      attentionDomainCount: attentionCount,
      signalCount: safeInteger(snapshot?.counts?.total),
      staleSignalCount: safeInteger(snapshot?.counts?.stale),
      collectorCount: safeInteger(businessState?.collectorCount),
      collectedCount: safeInteger(businessState?.collectedCount),
      blockedCount: safeInteger(businessState?.blockedCount),
      failedCount: safeInteger(businessState?.failedCount),
      collectionAgeMs,
      scheduled: Boolean(activation.projection?.scheduledEnabled),
      externalMutationEnabled: false,
      approvalBoundaryEnabled: true,
    },
    autonomy: {
      enabled: Boolean(activation.projection?.operationsEnabled),
      ready: activation.ready,
      scheduled: Boolean(activation.projection?.scheduledEnabled),
      activationGate: cleanText(activation.projection?.activationGate, 120),
      killSwitchEnabled: Boolean(activation.projection?.killSwitchEnabled),
      certifiedActions: [
        "collector.refresh",
        "website.reinspect",
        "incident.record",
        "repair.propose",
      ],
      approvalRequiredActions: [
        "executive.review.request",
        "github.merge",
        "cloudflare.deploy.production",
        "shopify.product.publish",
        "shopify.price.change",
        "customer.email.send",
        "publication.release",
      ],
    },
    latestSnapshot: latestAvailable ? {
      snapshotId: cleanText(latestRecord.snapshotId, 256),
      generatedAt: canonicalTimestamp(latestRecord.generatedAt),
      storedAt: canonicalTimestamp(latestRecord.storedAt),
      overallStatus: status,
      highestSeverity: cleanText(health?.highestSeverity, 32) || "info",
      coverageComplete: Boolean(health?.coverageComplete),
      attentionRequired: Boolean(health?.attentionRequired),
      hasFailures: Boolean(health?.hasFailures),
      hasBlocked: Boolean(health?.hasBlocked),
      hasCritical: Boolean(health?.hasCritical),
    } : null,
    domains,
    signals,
    history,
    builds: {
      dashboard: KAIROS_DASHBOARD_BUILD,
      api: KAIROS_AUTONOMY_API_BUILD,
      scheduler: KAIROS_AUTONOMY_SCHEDULER_BUILD,
      cycle: KAIROS_AUTONOMOUS_OPERATIONS_CYCLE_BUILD,
      prioritizer: KAIROS_BUSINESS_PRIORITIZER_BUILD,
      orchestrator: KAIROS_BUSINESS_ORCHESTRATOR_BUILD,
      ledgerClient: KAIROS_AUTONOMY_LEDGER_CLIENT_BUILD,
    },
    governance: {
      inferenceProvider: "browser-webgpu",
      externalProviders: "disabled",
      openAiCalls: "disabled",
      automaticExternalMutation: false,
      approvalBoundary: true,
      dashboardMode: "read-only-observability",
    },
  });
}

function projectDomain(value) {
  if (!usableObject(value)) return null;
  return {
    domain: cleanText(value.domain, 64),
    status: safeEnum(value.status, ["healthy", "attention", "degraded", "blocked", "failed", "unknown"], "unknown"),
    highestSeverity: cleanText(value.highestSeverity, 32) || "info",
    signalCount: safeInteger(value.signalCount),
    staleCount: safeInteger(value.staleCount),
    latestObservedAt: canonicalTimestamp(value.latestObservedAt),
    summary: cleanText(value.latestSignal?.summary, 280),
  };
}

function projectSignal(value) {
  if (!usableObject(value)) return null;
  return {
    signalId: cleanText(value.signalId, 256),
    observedAt: canonicalTimestamp(value.observedAt),
    source: cleanText(value.source, 160),
    domain: cleanText(value.domain, 64),
    type: cleanText(value.type, 160),
    status: cleanText(value.status, 32),
    severity: cleanText(value.severity, 32),
    summary: cleanText(value.summary, 280),
    stale: Boolean(value.stale),
  };
}

function projectHistory(value) {
  if (!usableRecord(value)) return null;
  const state = usableObject(value.businessState) ? value.businessState : null;
  const snapshot = usableObject(state?.snapshot) ? state.snapshot : null;
  return {
    snapshotId: cleanText(value.snapshotId, 256),
    generatedAt: canonicalTimestamp(value.generatedAt),
    storedAt: canonicalTimestamp(value.storedAt),
    status: cleanText(snapshot?.health?.overallStatus, 32) || "unknown",
    signalCount: safeInteger(snapshot?.counts?.total),
    attentionRequired: Boolean(snapshot?.health?.attentionRequired),
  };
}

function dashboardHtmlResponse() {
  return new Response(DASHBOARD_HTML, {
    status: 200,
    headers: dashboardHeaders("text/html; charset=utf-8"),
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: dashboardHeaders("application/json; charset=utf-8"),
  });
}

function methodNotAllowed(allow) {
  const response = json({
    ok: false,
    build: KAIROS_DASHBOARD_BUILD,
    error: { code: "METHOD_NOT_ALLOWED", message: "The requested method is not allowed." },
  }, 405);
  response.headers.set("Allow", allow);
  return response;
}

function dashboardHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "SAMEORIGIN",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${HTML_NONCE}'; script-src 'nonce-${HTML_NONCE}'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://themindsetmediagroup.com`,
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "X-Kairos-Dashboard-Build": KAIROS_DASHBOARD_BUILD,
  };
}

function usableObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function usableRecord(value) {
  return usableObject(value)
    && typeof value.snapshotId === "string"
    && typeof value.storedAt === "string";
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function cleanText(value, maximum) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/gu, "").trim().slice(0, maximum) : "";
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  try {
    const canonical = new Date(parsed).toISOString();
    return canonical === value ? value : canonical;
  } catch {
    return null;
  }
}

function safeEnum(value, allowed, fallback) {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function readOwnOption(options, key) {
  if (!options || typeof options !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function resolveNow(options) {
  const candidate = readOwnOption(options, "now");
  if (candidate instanceof Date && Number.isFinite(candidate.getTime())) return new Date(candidate.getTime());
  return new Date();
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#07111f">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Kairos Command Center</title>
  <style nonce="${HTML_NONCE}">
    :root{color-scheme:dark;--ink:#07111f;--surface:#0e1a2b;--surface2:#132238;--line:rgba(255,255,255,.10);--copy:#eef6ff;--muted:#91a4bd;--blue:#1677ff;--cyan:#5cdbff;--green:#46d38b;--amber:#ffc857;--red:#ff6b75;--radius:24px;--shadow:0 24px 80px rgba(0,0,0,.35)}
    *{box-sizing:border-box}html{background:var(--ink);scroll-behavior:smooth}body{margin:0;min-height:100vh;background:radial-gradient(circle at 10% -10%,rgba(22,119,255,.25),transparent 34%),radial-gradient(circle at 100% 0,rgba(92,219,255,.12),transparent 30%),var(--ink);color:var(--copy);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
    button{font:inherit}.shell{width:min(1500px,100%);margin:auto;padding:calc(18px + env(safe-area-inset-top)) clamp(16px,3vw,42px) calc(48px + env(safe-area-inset-bottom))}.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 -8px 30px;padding:12px 8px;background:linear-gradient(180deg,rgba(7,17,31,.96),rgba(7,17,31,.74),transparent);backdrop-filter:blur(20px)}
    .brand{display:flex;align-items:center;gap:13px}.mark{display:grid;place-items:center;width:44px;height:44px;border:1px solid rgba(92,219,255,.55);border-radius:15px;background:linear-gradient(145deg,#102844,#07111f);box-shadow:0 0 0 4px rgba(22,119,255,.12),0 14px 32px rgba(0,0,0,.3)}.mark:before{content:"";width:0;height:0;border-top:10px solid transparent;border-bottom:10px solid transparent;border-left:17px solid var(--cyan);filter:drop-shadow(0 0 8px rgba(92,219,255,.65));transform:translateX(2px)}
    .brand-copy strong{display:block;font-size:15px;letter-spacing:.14em;text-transform:uppercase}.brand-copy span{display:block;margin-top:3px;color:var(--muted);font-size:12px}.actions{display:flex;align-items:center;gap:10px}.status-chip,.refresh{border:1px solid var(--line);background:rgba(255,255,255,.055);color:var(--copy);border-radius:999px;padding:10px 14px}.status-chip{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.dot{width:8px;height:8px;border-radius:50%;background:var(--muted);box-shadow:0 0 0 5px rgba(145,164,189,.12)}.refresh{cursor:pointer;transition:.2s ease}.refresh:hover{transform:translateY(-1px);border-color:rgba(92,219,255,.5)}.refresh:disabled{opacity:.55;cursor:wait}
    .hero{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.55fr);gap:22px;margin-bottom:22px}.hero-main,.hero-side,.card{border:1px solid var(--line);background:linear-gradient(145deg,rgba(19,34,56,.88),rgba(10,22,38,.84));box-shadow:var(--shadow);border-radius:var(--radius)}.hero-main{padding:clamp(26px,4vw,54px);min-height:310px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;position:relative}.hero-main:after{content:"";position:absolute;width:380px;height:380px;border-radius:50%;right:-120px;top:-150px;background:radial-gradient(circle,rgba(22,119,255,.34),transparent 67%);pointer-events:none}.eyebrow{color:var(--cyan);font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.hero h1{font-size:clamp(36px,6vw,76px);line-height:.96;letter-spacing:-.055em;margin:18px 0 16px;max-width:850px}.hero p{margin:0;color:var(--muted);font-size:clamp(16px,1.8vw,20px);line-height:1.55;max-width:760px}.hero-foot{display:flex;flex-wrap:wrap;gap:22px;margin-top:38px;color:var(--muted);font-size:13px}.hero-foot strong{color:var(--copy);font-weight:650}.hero-side{padding:28px;display:flex;flex-direction:column;justify-content:space-between}.orb{width:132px;height:132px;margin:8px auto 26px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#47b3ff,#0c55cf 38%,#07111f 72%);box-shadow:0 0 0 12px rgba(22,119,255,.08),0 0 80px rgba(22,119,255,.3)}.orb span{font-size:37px;font-weight:300;letter-spacing:-.08em}.state-label{text-align:center}.state-label strong{display:block;font-size:24px}.state-label span{display:block;margin-top:8px;color:var(--muted);font-size:13px}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:22px}.metric{padding:22px;border:1px solid var(--line);border-radius:20px;background:rgba(255,255,255,.045)}.metric span{display:block;color:var(--muted);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.09em}.metric strong{display:block;margin-top:13px;font-size:clamp(26px,4vw,42px);letter-spacing:-.04em}.metric small{display:block;margin-top:8px;color:var(--muted);font-size:12px}
    .grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);gap:22px}.card{padding:24px;min-width:0}.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:20px}.card h2{font-size:19px;margin:0;letter-spacing:-.02em}.card-head p{margin:6px 0 0;color:var(--muted);font-size:13px}.tag{border:1px solid var(--line);border-radius:999px;padding:7px 10px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
    .domains{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.domain{padding:16px;border:1px solid var(--line);border-radius:17px;background:rgba(0,0,0,.12)}.domain-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.domain-name{text-transform:capitalize;font-weight:700;font-size:14px}.pill{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:6px 8px;border-radius:999px;background:rgba(145,164,189,.12);color:var(--muted)}.pill.healthy{background:rgba(70,211,139,.13);color:var(--green)}.pill.attention,.pill.degraded{background:rgba(255,200,87,.13);color:var(--amber)}.pill.failed,.pill.blocked{background:rgba(255,107,117,.13);color:var(--red)}.domain p{margin:12px 0 0;color:var(--muted);font-size:12px;line-height:1.45;min-height:34px}.domain-foot{display:flex;justify-content:space-between;margin-top:14px;color:var(--muted);font-size:11px}
    .timeline{display:flex;flex-direction:column}.signal{position:relative;padding:0 0 20px 24px;border-left:1px solid var(--line);margin-left:5px}.signal:last-child{padding-bottom:0}.signal:before{content:"";position:absolute;left:-5px;top:4px;width:9px;height:9px;border-radius:50%;background:var(--blue);box-shadow:0 0 0 5px rgba(22,119,255,.12)}.signal-meta{display:flex;flex-wrap:wrap;gap:7px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em}.signal strong{display:block;margin:8px 0 4px;font-size:14px}.signal p{margin:0;color:var(--muted);font-size:12px;line-height:1.45}.empty{padding:35px 10px;text-align:center;color:var(--muted);font-size:13px}
    .history{display:flex;align-items:flex-end;gap:8px;height:150px;padding-top:20px}.bar-wrap{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:7px}.bar{min-height:8px;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,var(--cyan),var(--blue));opacity:.85}.bar.attention{background:linear-gradient(180deg,var(--amber),#d98b1a)}.bar.failed,.bar.blocked{background:linear-gradient(180deg,var(--red),#b72d43)}.bar-label{font-size:9px;color:var(--muted);text-align:center;overflow:hidden;text-overflow:ellipsis}.governance{display:grid;gap:10px}.rule{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid var(--line);font-size:13px}.rule:last-child{border:0}.rule span{color:var(--muted)}.rule strong{font-size:12px;text-align:right}.good{color:var(--green)}.warn{color:var(--amber)}
    .footer{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-top:26px;padding:18px 4px;color:var(--muted);font-size:11px}.footer code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#b7c8dd}.skeleton{position:relative;overflow:hidden;color:transparent!important;background:rgba(255,255,255,.06)!important;border-radius:8px}.skeleton:after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent);animation:shimmer 1.4s infinite}@keyframes shimmer{100%{transform:translateX(100%)}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
    @media(max-width:980px){.hero,.grid{grid-template-columns:1fr}.hero-side{display:grid;grid-template-columns:150px 1fr;align-items:center}.orb{margin:0}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.shell{padding-left:14px;padding-right:14px}.topbar{margin-bottom:18px}.brand-copy span{display:none}.refresh{padding:10px 12px}.refresh span{display:none}.hero-main{min-height:330px}.hero h1{font-size:44px}.hero-side{grid-template-columns:100px 1fr;padding:20px}.orb{width:86px;height:86px}.orb span{font-size:28px}.metrics{gap:10px}.metric{padding:17px}.domains{grid-template-columns:1fr}.card{padding:19px}.status-chip{padding:9px 11px}.status-chip .label{display:none}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="brand"><div class="mark" aria-hidden="true"></div><div class="brand-copy"><strong>Kairos</strong><span>Autonomous Business Operations</span></div></div>
      <div class="actions"><div class="status-chip"><span class="dot" id="statusDot"></span><span class="label" id="statusChip">Connecting</span></div><button class="refresh" id="refresh" type="button" aria-label="Refresh dashboard">↻ <span>Refresh</span></button></div>
    </header>

    <section class="hero">
      <article class="hero-main">
        <div><div class="eyebrow">Executive Command Center</div><h1>See the business.<br>Control the next move.</h1><p id="heroCopy">Kairos is connecting to the governed operations ledger and assembling the current business state.</p></div>
        <div class="hero-foot"><span>Last snapshot <strong id="lastSnapshot">Loading</strong></span><span>Schedule <strong id="schedule">Hourly</strong></span><span>Mode <strong>Governed autonomy</strong></span></div>
      </article>
      <aside class="hero-side"><div class="orb"><span>K</span></div><div class="state-label"><strong id="overallState">Connecting</strong><span id="stateDetail">Reading durable operations memory</span></div></aside>
    </section>

    <section class="metrics" aria-label="Operations metrics">
      <article class="metric"><span>Signals</span><strong id="signalCount">—</strong><small>Latest business snapshot</small></article>
      <article class="metric"><span>Domains requiring attention</span><strong id="attentionCount">—</strong><small>Across the operating system</small></article>
      <article class="metric"><span>Collectors healthy</span><strong id="collectorCount">—</strong><small>Completed observation passes</small></article>
      <article class="metric"><span>Snapshot age</span><strong id="snapshotAge">—</strong><small>Durable memory freshness</small></article>
    </section>

    <section class="grid">
      <article class="card">
        <div class="card-head"><div><h2>Business domains</h2><p>Current health by operating area</p></div><span class="tag">Live ledger</span></div>
        <div class="domains" id="domains"><div class="empty">Loading domain health…</div></div>
      </article>

      <article class="card">
        <div class="card-head"><div><h2>Recent signals</h2><p>Newest observations requiring context</p></div><span class="tag" id="signalTag">0 signals</span></div>
        <div class="timeline" id="signals"><div class="empty">Loading observation stream…</div></div>
      </article>

      <article class="card">
        <div class="card-head"><div><h2>Snapshot history</h2><p>Recent autonomous collection state</p></div><span class="tag">Last 12</span></div>
        <div class="history" id="history"><div class="empty">Loading durable history…</div></div>
      </article>

      <article class="card">
        <div class="card-head"><div><h2>Governance boundary</h2><p>What Kairos may and may not do</p></div><span class="tag">Enforced</span></div>
        <div class="governance">
          <div class="rule"><span>Scheduled operations</span><strong class="good" id="scheduledRule">Checking</strong></div>
          <div class="rule"><span>Safe certified actions</span><strong class="good">Enabled</strong></div>
          <div class="rule"><span>External mutations</span><strong class="good">Disabled</strong></div>
          <div class="rule"><span>Executive approval boundary</span><strong class="good">Required</strong></div>
          <div class="rule"><span>Inference provider</span><strong>Browser WebGPU</strong></div>
          <div class="rule"><span>OpenAI / paid provider calls</span><strong class="good">Disabled</strong></div>
        </div>
      </article>
    </section>

    <footer class="footer"><span>Mindset Media Group / The Legacy, LLC</span><span>Dashboard build <code id="build">${KAIROS_DASHBOARD_BUILD}</code></span></footer>
  </main>

  <script nonce="${HTML_NONCE}">
    (() => {
      const $ = (id) => document.getElementById(id);
      const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
      const title = (value) => String(value || "unknown").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      const date = (value) => value ? new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value)) : "Not available";
      const age = (milliseconds) => {
        if (!Number.isFinite(milliseconds)) return "—";
        const minutes = Math.floor(milliseconds / 60000);
        if (minutes < 1) return "Now";
        if (minutes < 60) return minutes + "m";
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + "h";
        return Math.floor(hours / 24) + "d";
      };
      const statusCopy = {
        healthy:"All governed systems are operating inside policy.",
        attention:"Kairos found conditions that deserve review.",
        degraded:"One or more business systems are degraded. Safe response actions remain governed.",
        blocked:"Autonomous operations are blocked by readiness or policy.",
        failed:"A monitored business system reported a failure.",
        unknown:"Kairos is waiting for a complete business-state snapshot."
      };

      async function load() {
        const button = $("refresh");
        button.disabled = true;
        try {
          const response = await fetch("${KAIROS_DASHBOARD_OVERVIEW_PATH}?t=" + Date.now(), {headers:{Accept:"application/json"},cache:"no-store"});
          const data = await response.json();
          if (!response.ok || data.ok !== true) throw new Error(data?.error?.message || "Dashboard data unavailable");
          render(data);
        } catch (error) {
          $("overallState").textContent = "Unavailable";
          $("stateDetail").textContent = "The dashboard could not read the operations ledger.";
          $("heroCopy").textContent = error instanceof Error ? error.message : "Kairos dashboard data is unavailable.";
          $("statusChip").textContent = "Offline";
          $("statusDot").style.background = "var(--red)";
        } finally {
          button.disabled = false;
        }
      }

      function render(data) {
        const state = data.status || "unknown";
        const ready = data.summary?.ready === true;
        $("overallState").textContent = title(state);
        $("stateDetail").textContent = ready ? "Autonomous operations ready" : "Operations readiness blocked";
        $("heroCopy").textContent = statusCopy[state] || statusCopy.unknown;
        $("statusChip").textContent = ready ? "Operational" : "Blocked";
        $("statusDot").style.background = ready ? "var(--green)" : "var(--red)";
        $("statusDot").style.boxShadow = ready ? "0 0 0 5px rgba(70,211,139,.12)" : "0 0 0 5px rgba(255,107,117,.12)";
        $("lastSnapshot").textContent = date(data.latestSnapshot?.storedAt);
        $("schedule").textContent = data.summary?.scheduled ? "Hourly · active" : "Disabled";
        $("scheduledRule").textContent = data.summary?.scheduled ? "Active" : "Disabled";
        $("signalCount").textContent = data.summary?.signalCount ?? 0;
        $("attentionCount").textContent = data.summary?.attentionDomainCount ?? 0;
        $("collectorCount").textContent = (data.summary?.collectedCount ?? 0) + "/" + (data.summary?.collectorCount ?? 0);
        $("snapshotAge").textContent = age(data.summary?.collectionAgeMs);
        $("signalTag").textContent = (data.signals?.length || 0) + " signals";
        $("build").textContent = data.build;
        renderDomains(data.domains || []);
        renderSignals(data.signals || []);
        renderHistory(data.history || []);
      }

      function renderDomains(items) {
        const root = $("domains");
        if (!items.length) { root.innerHTML = '<div class="empty">No domain observations are available yet.</div>'; return; }
        root.innerHTML = items.map((item) => '<section class="domain"><div class="domain-top"><span class="domain-name">' + esc(title(item.domain)) + '</span><span class="pill ' + esc(item.status) + '">' + esc(item.status) + '</span></div><p>' + esc(item.summary || "No current signal summary.") + '</p><div class="domain-foot"><span>' + esc(item.signalCount) + ' signals</span><span>' + esc(item.staleCount) + ' stale</span></div></section>').join("");
      }

      function renderSignals(items) {
        const root = $("signals");
        if (!items.length) { root.innerHTML = '<div class="empty">No recent signals are available.</div>'; return; }
        root.innerHTML = items.map((item) => '<article class="signal"><div class="signal-meta"><span>' + esc(title(item.domain)) + '</span><span>·</span><span>' + esc(item.severity) + '</span><span>·</span><span>' + esc(date(item.observedAt)) + '</span></div><strong>' + esc(title(item.type)) + '</strong><p>' + esc(item.summary || "Observation recorded without a public summary.") + '</p></article>').join("");
      }

      function renderHistory(items) {
        const root = $("history");
        if (!items.length) { root.innerHTML = '<div class="empty">No snapshot history is available.</div>'; return; }
        const maximum = Math.max(1, ...items.map((item) => Number(item.signalCount || 0)));
        root.innerHTML = items.slice().reverse().map((item) => {
          const height = Math.max(8, Math.round((Number(item.signalCount || 0) / maximum) * 115));
          return '<div class="bar-wrap" title="' + esc(item.snapshotId) + '"><div class="bar ' + esc(item.status) + '" style="height:' + height + 'px"></div><div class="bar-label">' + esc(new Date(item.storedAt).getHours()) + '</div></div>';
        }).join("");
      }

      $("refresh").addEventListener("click", load);
      load();
      window.setInterval(load, 60000);
    })();
  </script>
</body>
</html>`;
