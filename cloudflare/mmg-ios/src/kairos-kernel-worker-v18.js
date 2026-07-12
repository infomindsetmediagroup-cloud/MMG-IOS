import kernel from "./kairos-kernel-worker-v17.js";

const BUILD = "kairos-kernel-20260712-18";
const JOB_TTL_SECONDS = 3600;
const MAX_OBJECTIVE_CHARS = 12000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/shopify/staging/plan/jobs" && request.method === "POST") {
      return submitPlanningJob(request, env, ctx);
    }

    const match = url.pathname.match(/^\/api\/shopify\/staging\/plan\/jobs\/([a-f0-9-]+)$/i);
    if (match && request.method === "GET") {
      return readPlanningJob(request, match[1]);
    }

    const response = await kernel.fetch(request, env, ctx);
    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const body = await safeJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-v18";
      body.experience = {
        ...(body.experience || {}),
        websitePlanningTransport: "resumable-job-polling",
      };
      return json(body, response.status);
    }
    return retag(response);
  },
};

async function submitPlanningJob(request, env, ctx) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 8) return json({ status: "needs-input", error: { message: "Enter a specific website objective before starting the job." } }, 400);
    if (objective.length > MAX_OBJECTIVE_CHARS) return json({ status: "needs-input", error: { message: `Website objective exceeds ${MAX_OBJECTIVE_CHARS.toLocaleString()} characters.` } }, 413);

    const jobID = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    await writeJob(request, jobID, {
      jobID,
      status: "queued",
      build: BUILD,
      submittedAt,
      updatedAt: submittedAt,
      summary: "Website job accepted. Kairos is preparing the approval plan.",
    });

    ctx.waitUntil(processPlanningJob(request, env, ctx, jobID, objective));

    return json({
      jobID,
      status: "queued",
      build: BUILD,
      submittedAt,
      pollURL: `/api/shopify/staging/plan/jobs/${jobID}`,
      summary: "Website job accepted. Kairos is preparing the approval plan.",
    }, 202);
  } catch (error) {
    return json({ status: "needs-attention", error: { message: error instanceof Error ? error.message : "Kairos could not queue the website job." } }, 400);
  }
}

async function processPlanningJob(sourceRequest, env, ctx, jobID, objective) {
  const startedAt = new Date().toISOString();
  try {
    await writeJob(sourceRequest, jobID, {
      jobID,
      status: "working",
      build: BUILD,
      startedAt,
      updatedAt: startedAt,
      summary: "Kairos is validating Shopify, verifying staging source, and preparing the approval plan.",
    });

    const internalURL = new URL("/api/shopify/staging/plan", sourceRequest.url);
    const response = await kernel.fetch(new Request(internalURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-MMG-Internal": BUILD,
      },
      body: JSON.stringify({ objective }),
    }), env, ctx);

    const result = await safeJSON(response);
    const completedAt = new Date().toISOString();
    if (!response.ok) {
      await writeJob(sourceRequest, jobID, {
        jobID,
        status: "needs-attention",
        build: BUILD,
        startedAt,
        completedAt,
        updatedAt: completedAt,
        httpStatus: response.status,
        summary: result?.summary || "Kairos could not prepare the website plan.",
        error: result?.error || { message: `Planning returned HTTP ${response.status}.` },
      });
      return;
    }

    await writeJob(sourceRequest, jobID, {
      jobID,
      status: "completed",
      build: BUILD,
      startedAt,
      completedAt,
      updatedAt: completedAt,
      httpStatus: 200,
      summary: result?.summary || "Website plan prepared for approval.",
      result,
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    await writeJob(sourceRequest, jobID, {
      jobID,
      status: "needs-attention",
      build: BUILD,
      startedAt,
      completedAt,
      updatedAt: completedAt,
      httpStatus: 500,
      summary: "Kairos could not complete background website planning.",
      error: { message: error instanceof Error ? error.message : "Background planning failed." },
    });
  }
}

async function readPlanningJob(request, jobID) {
  const response = await caches.default.match(jobRequest(request, jobID));
  if (!response) return json({ jobID, status: "not-found", error: { message: "The website planning job was not found or expired." } }, 404);
  const body = await safeJSON(response);
  return json(body, body.status === "needs-attention" ? Number(body.httpStatus || 500) : 200);
}

async function writeJob(request, jobID, body) {
  await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}`,
      "X-MMG-Runtime": BUILD,
    },
  }));
}

function jobRequest(request, jobID) {
  const url = new URL(`/_kairos/planning-jobs/${jobID}`, request.url);
  return new Request(url.toString(), { method: "GET" });
}

function retag(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Kernel", "standalone-v18");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function safeJSON(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { raw: text.slice(0, 2000) }; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Kernel": "standalone-v18",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
