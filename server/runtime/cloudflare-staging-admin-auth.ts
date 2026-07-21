import type {
  MMGCommerceOperationsDashboardAuthenticator,
} from "../operations/commerce-operations-dashboard-http.js";
import type {
  MMGCommerceOperationsDashboardPrincipal,
} from "../operations/commerce-operations-dashboard.js";

const tokenEquals = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
};

const bearer = (request: Request): string => {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
};

export class MMGCloudflareStagingAdminAuthenticator
  implements MMGCommerceOperationsDashboardAuthenticator
{
  readonly #token: string;

  constructor(token: string) {
    const normalized = token.trim();
    if (normalized.length < 32) {
      throw new Error("MMG_STAGING_ADMIN_DASHBOARD_TOKEN_INVALID");
    }
    this.#token = normalized;
  }

  async authenticate(
    request: Request,
  ): Promise<MMGCommerceOperationsDashboardPrincipal | null> {
    const supplied = bearer(request);
    if (!supplied || !tokenEquals(supplied, this.#token)) return null;
    return {
      actorId: "staging-commerce-admin",
      sessionId: `cloudflare:${request.headers.get("cf-ray") ?? "direct"}`.slice(
        0,
        128,
      ),
      roles: ["mmg-commerce-operator"],
    };
  }
}
