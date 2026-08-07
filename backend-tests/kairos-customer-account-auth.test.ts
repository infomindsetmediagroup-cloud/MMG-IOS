import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleKairosCustomerAccountAuth,
  prepareKairosCustomerApiRequest,
} from "../cloudflare/mmg-ios/src/kairos-customer-account-auth-v1.js";

const clientId = "0de689abad167c3e9b4197728bfd6b55";
const clientSecret = "test-secret-that-is-long-enough-for-kairos";
const env = {
  KAIROS_SHOPIFY_CLIENT_ID: clientId,
  KAIROS_SHOPIFY_CLIENT_SECRET: clientSecret,
  KAIROS_SHOPIFY_STOREFRONT_DOMAIN: "themindsetmediagroup.com",
  KAIROS_CUSTOMER_AUTH_CALLBACK_URL: "https://mmg-ios.info-mindsetmediagroup.workers.dev/api/customer/auth/callback",
  KAIROS_CUSTOMER_PORTAL_URL: "https://mmg-ios.info-mindsetmediagroup.workers.dev/customer-portal",
};

function openIdResponse() {
  return new Response(JSON.stringify({
    authorization_endpoint: "https://account.themindsetmediagroup.com/authentication/oauth/authorize",
    token_endpoint: "https://account.themindsetmediagroup.com/authentication/oauth/token",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function tokenResponse() {
  return new Response(JSON.stringify({
    access_token: "shcat_live_customer_access_token",
    refresh_token: "shcrt_live_customer_refresh_token",
    id_token: "header.payload.signature",
    expires_in: 3600,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function customerDiscoveryResponse() {
  return new Response(JSON.stringify({
    graphql_api: "https://account.themindsetmediagroup.com/customer/api/2026-07/graphql",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function customerIdentityResponse() {
  return new Response(JSON.stringify({
    data: { customer: { id: "gid://shopify/Customer/123456789" } },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function cookiePair(setCookie: string, name: string) {
  const match = new RegExp(`${name}=([^;,]+)`).exec(setCookie);
  if (!match) throw new Error(`Missing cookie ${name}`);
  return `${name}=${match[1]}`;
}

afterEach(() => vi.restoreAllMocks());

describe("Kairos customer account OAuth", () => {
  it("starts Shopify Customer Account OAuth with the configured client ID and callback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(openIdResponse());
    const response = await handleKairosCustomerAccountAuth(
      new Request("https://mmg-ios.info-mindsetmediagroup.workers.dev/api/customer/auth/start"),
      env,
    );
    expect(response?.status).toBe(302);
    const location = new URL(response!.headers.get("location")!);
    expect(location.searchParams.get("client_id")).toBe(clientId);
    expect(location.searchParams.get("scope")).toBe("openid email customer-account-api:full");
    expect(location.searchParams.get("redirect_uri")).toBe(env.KAIROS_CUSTOMER_AUTH_CALLBACK_URL);
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(response!.headers.get("set-cookie")).toContain("__Host-kairos_customer_oauth=");
  });

  it("exchanges a verified callback for an encrypted HttpOnly customer session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(openIdResponse());
    const start = await handleKairosCustomerAccountAuth(
      new Request("https://mmg-ios.info-mindsetmediagroup.workers.dev/api/customer/auth/start"),
      env,
    );
    const authorization = new URL(start!.headers.get("location")!);
    const state = authorization.searchParams.get("state")!;
    const oauthCookie = cookiePair(start!.headers.get("set-cookie")!, "__Host-kairos_customer_oauth");

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(openIdResponse())
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(customerDiscoveryResponse())
      .mockResolvedValueOnce(customerIdentityResponse());

    const callback = await handleKairosCustomerAccountAuth(new Request(
      `https://mmg-ios.info-mindsetmediagroup.workers.dev/api/customer/auth/callback?code=authorization-code&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: oauthCookie } },
    ), env);

    expect(callback?.status).toBe(302);
    expect(callback!.headers.get("location")).toBe(env.KAIROS_CUSTOMER_PORTAL_URL);
    const setCookie = callback!.headers.get("set-cookie")!;
    expect(setCookie).toContain("__Host-kairos_customer_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).not.toContain("shcat_live_customer_access_token");
  });

  it("injects the server-held customer token into same-origin Kairos customer APIs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(openIdResponse());
    const start = await handleKairosCustomerAccountAuth(
      new Request("https://mmg-ios.info-mindsetmediagroup.workers.dev/api/customer/auth/start"),
      env,
    );
    const authorization = new URL(start!.headers.get("location")!);
    const state = authorization.searchParams.get("state")!;
    const oauthCookie = cookiePair(start!.headers.get("set-cookie")!, "__Host-kairos_customer_oauth");

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(openIdResponse())
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(customerDiscoveryResponse())
      .mockResolvedValueOnce(customerIdentityResponse());
    const callback = await handleKairosCustomerAccountAuth(new Request(
      `https://mmg-ios.info-mindsetmediagroup.workers.dev/api/customer/auth/callback?code=authorization-code&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: oauthCookie } },
    ), env);
    const sessionCookie = cookiePair(callback!.headers.get("set-cookie")!, "__Host-kairos_customer_session");

    vi.restoreAllMocks();
    const prepared = await prepareKairosCustomerApiRequest(new Request(
      "https://mmg-ios.info-mindsetmediagroup.workers.dev/api/kairos/customer/projects",
      { headers: { Cookie: sessionCookie } },
    ), env);
    expect(prepared.request.headers.get("authorization")).toBe("Bearer shcat_live_customer_access_token");
    expect(prepared.request.headers.get("x-kairos-customer-id")).toBeNull();
  });

  it("fails closed when the Shopify client secret is absent", async () => {
    const response = await handleKairosCustomerAccountAuth(
      new Request("https://mmg-ios.info-mindsetmediagroup.workers.dev/api/customer/auth/start"),
      { KAIROS_SHOPIFY_CLIENT_ID: clientId },
    );
    expect(response?.status).toBe(503);
    const payload: any = await response?.json();
    expect(payload.error.code).toBe("CUSTOMER_OAUTH_NOT_CONFIGURED");
  });
});
