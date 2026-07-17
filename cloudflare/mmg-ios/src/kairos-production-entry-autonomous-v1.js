import baselineRuntime, { KairosProject } from "./kairos-production-entry.js";
import {
  handleAutonomousPromptRequest,
  KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
  runAutonomousScheduledCycle,
} from "./kairos-autonomous-prompt-controller-v1.js";
import {
  handleHomepagePromptBindingRepair,
  KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD,
} from "./kairos-homepage-prompt-binding-repair-v1.js";

const BUILD = "kairos-production-entry-autonomous-20260717-2";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const autonomousDelegate = nextRequest => handleAutonomousPromptRequest(
        nextRequest,
        env,
        ctx,
        delegatedRequest => baselineRuntime.fetch(delegatedRequest, env, ctx),
      );

      const bindingRepair = await handleHomepagePromptBindingRepair(
        request,
        env,
        ctx,
        autonomousDelegate,
      );
      if (bindingRepair) return stamp(bindingRepair);

      const handled = await autonomousDelegate(request);
      if (handled) return stamp(handled);
      return stamp(await baselineRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({
        status: "failed",
        build: BUILD,
        controller: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
        promptBinding: KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD,
        error: {
          code: error?.code || "autonomous_entry_failed",
          message: error instanceof Error ? error.message : "Kairos could not complete this request.",
        },
      }, Number(error?.status || error?.statusCode || 500));
    }
  },

  async scheduled(controller, env, ctx) {
    if (typeof baselineRuntime.scheduled === "function") await baselineRuntime.scheduled(controller, env, ctx);
    ctx.waitUntil(Promise.resolve(runAutonomousScheduledCycle(controller, env, ctx)).catch(() => null));
  },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Autonomous-Entry", BUILD);
  headers.set("X-Kairos-Prompt-Controller", KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD);
  headers.set("X-Kairos-Prompt-Binding-Build", KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD);
  headers.set("X-Kairos-Visual-Baseline", "tuesday-command-center-6f96b10d");
  if (headers.get("Content-Type")?.includes("text/html")) headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Autonomous-Entry": BUILD,
      "X-Kairos-Prompt-Controller": KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
      "X-Kairos-Prompt-Binding-Build": KAIROS_HOMEPAGE_PROMPT_BINDING_REPAIR_BUILD,
      "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
