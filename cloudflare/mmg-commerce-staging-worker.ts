import {
  buildMMGCloudflareCommerceStagingHost,
  type MMGCloudflareCommerceStagingEnvironment,
} from "../server/runtime/cloudflare-commerce-staging-host.js";

interface MMGExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface MMGScheduledController {
  cron: string;
}

const hostCache = new Map<
  string,
  ReturnType<typeof buildMMGCloudflareCommerceStagingHost>
>();

const hostFor = (env: MMGCloudflareCommerceStagingEnvironment) => {
  const cacheKey = `${env.MMG_COMMERCE_RELEASE_ID}:${env.MMG_COMMERCE_RELEASE_COMMIT_SHA}`;
  const existing = hostCache.get(cacheKey);
  if (existing) return existing;
  const host = buildMMGCloudflareCommerceStagingHost(env);
  hostCache.clear();
  hostCache.set(cacheKey, host);
  return host;
};

export default {
  async fetch(
    request: Request,
    env: MMGCloudflareCommerceStagingEnvironment,
  ): Promise<Response> {
    try {
      return await hostFor(env).fetch(request);
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":", 1)[0] : "MMG_STAGING_HOST_FAILED";
      return Response.json(
        {
          ok: false,
          status: "failed",
          error: {
            code,
            message: "The isolated MMG commerce staging runtime is unavailable.",
          },
          publicationAllowed: false,
          liveCustomerDataAllowed: false,
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store, private, max-age=0",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    }
  },

  async scheduled(
    controller: MMGScheduledController,
    env: MMGCloudflareCommerceStagingEnvironment,
    ctx: MMGExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(hostFor(env).scheduled(controller.cron));
  },
};
