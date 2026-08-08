import { readSocialPackage } from "./kairos-social-production-v1.js";
import { verifyShopifyAdminSession } from "./shopify/kairos-shopify-admin-auth-v1.js";

export const KAIROS_TIKTOK_CONNECTOR_BUILD = "kairos-tiktok-connector-20260807-1";

const PREFIX = "/api/social-connectors/tiktok";
const VAULT_NAME = "mindset-media-group-tiktok-v1";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_SCOPES = Object.freeze([
  "user.info.basic",
  "video.list",
  "video.upload",
  "video.publish",
]);
const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_API = "https://open.tiktokapis.com";

export class KairosTikTokConnectorVault {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/state") {
      return json({ error: { code: "NOT_FOUND", message: "Connector vault route not found." } }, 404);
    }
    const body = await request.json().catch(() => ({}));
    const operation = clean(body?.operation, 40);
    const key = clean(body?.key, 240);
    if (operation === "get") {
      return json({ value: key ? await this.state.storage.get(key) ?? null : null });
    }
    if (operation === "put") {
      if (!key) return json({ error: { code: "KEY_REQUIRED", message: "Vault key required." } }, 400);
      await this.state.storage.put(key, body?.value ?? null);
      return json({ ok: true });
    }
    if (operation === "delete") {
      if (key) await this.state.storage.delete(key);
      return json({ ok: true });
    }
    if (operation === "deleteMany") {
      const keys = Array.isArray(body?.keys) ? body.keys.map((item) => clean(item, 240)).filter(Boolean) : [];
      if (keys.length) await this.state.storage.delete(keys);
      return json({ ok: true, count: keys.length });
    }
    return json({ error: { code: "OPERATION_INVALID", message: "Unsupported connector vault operation." } }, 400);
  }
}

export async function handleTikTokConnectorRequest(request, env = {}, ctx = {}) {
  let url;
  try { url = new URL(request.url); } catch { return null; }
  if (!url.pathname.startsWith(PREFIX)) return null;

  try {
    if (url.pathname === `${PREFIX}/callback`) {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return await handleOAuthCallback(request, env);
    }

    const auth = await verifyShopifyAdminSession(request, env, { operationsEnv: env });
    if (!auth?.ok) {
      return connectorError(auth?.status || 401, auth?.code || "SHOPIFY_ADMIN_AUTH_REQUIRED", "A verified Shopify Admin session is required for TikTok connector operations.");
    }

    if (url.pathname === `${PREFIX}/status`) {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return json({ status: "ready", connector: await connectorStatus(env), build: KAIROS_TIKTOK_CONNECTOR_BUILD });
    }
    if (url.pathname === `${PREFIX}/connect-url`) {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return json({ status: "ready", authorizeUrl: await createConnectURL(env, auth), build: KAIROS_TIKTOK_CONNECTOR_BUILD });
    }
    if (url.pathname === `${PREFIX}/disconnect`) {
      if (request.method !== "POST") return methodNotAllowed("POST");
      await vaultDeleteMany(env, ["oauth_state", "tokens", "profile", "creator"]);
      return json({ status: "disconnected", connector: await connectorStatus(env), build: KAIROS_TIKTOK_CONNECTOR_BUILD });
    }
    if (url.pathname === `${PREFIX}/creator-info`) {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const token = await validAccessToken(env);
      const creator = await queryCreatorInfo(env, token);
      return json({ status: "ready", creator, connector: await connectorStatus(env), build: KAIROS_TIKTOK_CONNECTOR_BUILD });
    }
    if (url.pathname === `${PREFIX}/publish`) {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const body = await request.json().catch(() => ({}));
      const receipt = await publishApprovedPackage(request, env, auth, body);
      return json({ status: "accepted", receipt, connector: await connectorStatus(env), build: KAIROS_TIKTOK_CONNECTOR_BUILD }, 202);
    }
    if (url.pathname === `${PREFIX}/receipt/refresh`) {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const body = await request.json().catch(() => ({}));
      const receipt = await refreshReceipt(env, clean(body?.packageID, 220));
      return json({ status: "ready", receipt, build: KAIROS_TIKTOK_CONNECTOR_BUILD });
    }
    if (url.pathname === `${PREFIX}/receipt`) {
      if (request.method !== "GET") return methodNotAllowed("GET");
      const packageID = clean(url.searchParams.get("packageID"), 220);
      const receipt = packageID ? await vaultGet(env, receiptKey(packageID)) : null;
      return receipt ? json({ status: "ready", receipt, build: KAIROS_TIKTOK_CONNECTOR_BUILD }) : json({ status: "not-found", build: KAIROS_TIKTOK_CONNECTOR_BUILD }, 404);
    }

    return json({ error: { code: "TIKTOK_CONNECTOR_ROUTE_NOT_FOUND", message: "TikTok connector route not found." }, build: KAIROS_TIKTOK_CONNECTOR_BUILD }, 404);
  } catch (error) {
    return connectorFailure(error);
  }
}

export function connectorConfiguration(env = {}) {
  const clientKey = clean(env?.KAIROS_TIKTOK_CLIENT_KEY, 300);
  const clientSecret = clean(env?.KAIROS_TIKTOK_CLIENT_SECRET, 500);
  const redirectUri = clean(env?.KAIROS_TIKTOK_REDIRECT_URI, 1000);
  const scopes = parseList(env?.KAIROS_TIKTOK_SCOPES).length ? parseList(env?.KAIROS_TIKTOK_SCOPES) : [...DEFAULT_SCOPES];
  const mediaOrigins = parseOrigins(env?.KAIROS_TIKTOK_VERIFIED_MEDIA_ORIGINS);
  const expectedUsername = normalizeUsername(env?.KAIROS_TIKTOK_EXPECTED_USERNAME || "mindset.media.group");
  return Object.freeze({
    enabled: truthy(env?.KAIROS_TIKTOK_CONNECTOR_ENABLED, true),
    clientKey,
    clientSecret,
    redirectUri,
    scopes,
    mediaOrigins,
    expectedUsername,
    directPostAudited: truthy(env?.KAIROS_TIKTOK_DIRECT_POST_AUDITED, false),
    vaultBound: Boolean(env?.KAIROS_TIKTOK_CONNECTOR?.idFromName && env?.KAIROS_TIKTOK_CONNECTOR?.get),
  });
}

export function buildTikTokAuthorizeURL(config, state) {
  assertConfig(config);
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.searchParams.set("client_key", config.clientKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(","));
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("disable_auto_auth", "1");
  return url.toString();
}

export function buildTikTokPublishRequest(socialPackage, handoff, creator, config) {
  validateHandoff(socialPackage, handoff, creator, config);
  const direct = handoff.handoffMode === "direct";
  const caption = cleanCaption(socialPackage?.connectorReadyPayload?.caption || socialPackage?.body || "", 2200);
  const mediaUrls = normalizeMediaURLs(handoff.mediaUrls, config.mediaOrigins);

  if (socialPackage.mode === "tiktok-single-image" || socialPackage.mode === "tiktok-carousel") {
    const postInfo = direct
      ? {
          title: cleanCaption(socialPackage.title || "", 90),
          description: cleanCaption(caption, 4000),
          privacy_level: handoff.privacyLevel,
          disable_comment: Boolean(handoff.disableComment),
          auto_add_music: Boolean(handoff.autoAddMusic),
          brand_content_toggle: false,
          brand_organic_toggle: handoff.brandOrganic !== false,
        }
      : {
          title: cleanCaption(socialPackage.title || "", 90),
          description: cleanCaption(caption, 4000),
        };
    return {
      endpoint: `${TIKTOK_API}/v2/post/publish/content/init/`,
      body: {
        media_type: "PHOTO",
        post_mode: direct ? "DIRECT_POST" : "MEDIA_UPLOAD",
        post_info: postInfo,
        source_info: {
          source: "PULL_FROM_URL",
          photo_images: mediaUrls,
          photo_cover_index: clamp(Number(handoff.photoCoverIndex || 0), 0, mediaUrls.length - 1),
        },
      },
      captionForwarded: true,
    };
  }

  if (socialPackage.mode === "tiktok-video") {
    if (direct) {
      return {
        endpoint: `${TIKTOK_API}/v2/post/publish/video/init/`,
        body: {
          post_info: {
            title: cleanCaption(caption, 2200),
            privacy_level: handoff.privacyLevel,
            disable_duet: Boolean(handoff.disableDuet),
            disable_comment: Boolean(handoff.disableComment),
            disable_stitch: Boolean(handoff.disableStitch),
            brand_content_toggle: false,
            brand_organic_toggle: handoff.brandOrganic !== false,
            is_aigc: Boolean(handoff.isAigc),
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url: mediaUrls[0],
          },
        },
        captionForwarded: true,
      };
    }
    return {
      endpoint: `${TIKTOK_API}/v2/post/publish/inbox/video/init/`,
      body: {
        source_info: {
          source: "PULL_FROM_URL",
          video_url: mediaUrls[0],
        },
      },
      captionForwarded: false,
    };
  }

  throw runtimeError("TikTok native text posts are not supported by the current Content Posting API. Use the approved package for manual TikTok text-post handoff.", "TIKTOK_TEXT_POST_API_UNAVAILABLE", 409);
}

export function validateHandoff(socialPackage, handoff, creator, config) {
  if (!socialPackage || socialPackage.platform !== "tiktok") throw runtimeError("Select a TikTok social package.", "TIKTOK_PACKAGE_REQUIRED", 400);
  if (socialPackage.approval?.state !== "approved" || socialPackage.status !== "approved-for-connector-handoff") {
    throw runtimeError("The TikTok package must be approved before connector handoff.", "TIKTOK_PACKAGE_APPROVAL_REQUIRED", 409);
  }
  if (socialPackage.connectorReadyPayload?.publish !== false) {
    throw runtimeError("The approved package connector guard is invalid.", "TIKTOK_PACKAGE_CONNECTOR_GUARD_INVALID", 409);
  }
  if (socialPackage.mode === "tiktok-text") {
    throw runtimeError("TikTok native text posts require manual handoff because the current Content Posting API exposes video and photo posting endpoints only.", "TIKTOK_TEXT_POST_API_UNAVAILABLE", 409);
  }
  if (!handoff || !["direct", "upload"].includes(handoff.handoffMode)) throw runtimeError("Choose Direct Post or Upload to TikTok.", "TIKTOK_HANDOFF_MODE_REQUIRED", 400);
  if (handoff.explicitConsent !== true) throw runtimeError("Explicit creator consent is required immediately before TikTok handoff.", "TIKTOK_EXPORT_CONSENT_REQUIRED", 409);
  if (handoff.mediaGuidelinesConfirmed !== true) throw runtimeError("Confirm the media complies with TikTok Content Sharing Guidelines, including no prohibited watermark, logo, or promotional overlay.", "TIKTOK_MEDIA_GUIDELINES_CONFIRMATION_REQUIRED", 409);
  if (!config?.mediaOrigins?.length) throw runtimeError("Configure at least one TikTok-verified media origin before publishing or uploading.", "TIKTOK_VERIFIED_MEDIA_ORIGIN_REQUIRED", 503);
  const expected = normalizeUsername(config.expectedUsername);
  const actual = normalizeUsername(creator?.creator_username);
  if (!actual || actual !== expected) {
    throw runtimeError(`The connected TikTok account must be @${expected}. Connected creator: ${actual ? `@${actual}` : "unverified"}.`, "TIKTOK_ACCOUNT_MISMATCH", 409);
  }
  if (handoff.handoffMode === "direct") {
    if (!config.directPostAudited) throw runtimeError("Direct Post remains disabled until the TikTok Content Posting API client audit is explicitly marked complete.", "TIKTOK_DIRECT_POST_AUDIT_REQUIRED", 409);
    if (!Array.isArray(creator?.privacy_level_options) || !creator.privacy_level_options.includes(handoff.privacyLevel)) {
      throw runtimeError("Select a privacy level returned by TikTok for the connected creator.", "TIKTOK_PRIVACY_LEVEL_INVALID", 400);
    }
  }
  const expectedCount = Number(socialPackage?.mediaRequirements?.[0]?.count || 1);
  const urls = Array.isArray(handoff.mediaUrls) ? handoff.mediaUrls : [];
  if (urls.length !== expectedCount) throw runtimeError(`This approved package requires exactly ${expectedCount} media ${expectedCount === 1 ? "asset" : "assets"}.`, "TIKTOK_MEDIA_COUNT_MISMATCH", 400);
  normalizeMediaURLs(urls, config.mediaOrigins);
  return true;
}

async function connectorStatus(env) {
  const config = connectorConfiguration(env);
  const tokens = config.vaultBound ? await vaultGet(env, "tokens") : null;
  const profile = config.vaultBound ? await vaultGet(env, "profile") : null;
  const creator = config.vaultBound ? await vaultGet(env, "creator") : null;
  const now = Date.now();
  const grantedScopes = normalizeScopes(tokens?.scope);
  const connected = Boolean(tokens?.refreshToken && Number(tokens?.refreshExpiresAt || 0) > now);
  const accountMatch = Boolean(creator?.creator_username && normalizeUsername(creator.creator_username) === config.expectedUsername);
  return {
    platform: "tiktok",
    configured: config.enabled && Boolean(config.clientKey && config.clientSecret && config.redirectUri && config.vaultBound),
    enabled: config.enabled,
    connected,
    accessTokenExpired: connected ? Number(tokens?.accessExpiresAt || 0) <= now : true,
    expectedAccount: `@${config.expectedUsername}`,
    accountMatch,
    profile: profile ? sanitizeProfile(profile) : null,
    creator: creator ? sanitizeCreator(creator) : null,
    grantedScopes,
    requiredScopes: config.scopes,
    verifiedMediaOrigins: config.mediaOrigins,
    directPostAudited: config.directPostAudited,
    capabilities: {
      nativeTextApi: false,
      photoUpload: connected && grantedScopes.includes("video.upload") && config.mediaOrigins.length > 0 && accountMatch,
      videoUpload: connected && grantedScopes.includes("video.upload") && config.mediaOrigins.length > 0 && accountMatch,
      directPhoto: connected && grantedScopes.includes("video.publish") && config.mediaOrigins.length > 0 && accountMatch && config.directPostAudited,
      directVideo: connected && grantedScopes.includes("video.publish") && config.mediaOrigins.length > 0 && accountMatch && config.directPostAudited,
      analyticsReadback: connected && grantedScopes.includes("video.list"),
    },
    build: KAIROS_TIKTOK_CONNECTOR_BUILD,
  };
}

async function createConnectURL(env, auth) {
  const config = connectorConfiguration(env);
  assertConfig(config);
  const state = randomState();
  await vaultPut(env, "oauth_state", {
    value: state,
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    requestedAt: new Date().toISOString(),
    shopDomain: clean(auth?.shopDomain, 255),
  });
  return buildTikTokAuthorizeURL(config, state);
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const config = connectorConfiguration(env);
  assertConfig(config);
  const state = clean(url.searchParams.get("state"), 500);
  const storedState = await vaultGet(env, "oauth_state");
  await vaultDelete(env, "oauth_state");
  if (!state || !storedState?.value || state !== storedState.value || Number(storedState.expiresAt || 0) < Date.now()) {
    return callbackPage(false, "TikTok authorization state validation failed. Return to Kairos and reconnect.");
  }
  const oauthError = clean(url.searchParams.get("error"), 300);
  if (oauthError) return callbackPage(false, clean(url.searchParams.get("error_description"), 1000) || oauthError);
  const code = clean(url.searchParams.get("code"), 4000);
  if (!code) return callbackPage(false, "TikTok did not return an authorization code.");

  const token = await exchangeAuthorizationCode(config, code);
  await vaultPut(env, "tokens", tokenRecord(token));
  try {
    const profile = await queryBasicProfile(token.access_token);
    await vaultPut(env, "profile", profile);
  } catch {}
  try {
    if (normalizeScopes(token.scope).includes("video.publish")) {
      const creator = await queryCreatorInfo(env, token.access_token, { persist: true, allowRefresh: false });
      const expected = config.expectedUsername;
      if (normalizeUsername(creator?.creator_username) !== expected) {
        await vaultDeleteMany(env, ["tokens", "profile", "creator"]);
        return callbackPage(false, `Connected TikTok account must be @${expected}. No connector token was retained.`);
      }
    }
  } catch (error) {
    await vaultDeleteMany(env, ["tokens", "profile", "creator"]);
    return callbackPage(false, error instanceof Error ? error.message : "TikTok creator verification failed.");
  }
  return callbackPage(true, "TikTok is connected to Kairos. Return to Social Production to continue.");
}

async function publishApprovedPackage(request, env, auth, body) {
  const packageID = clean(body?.packageID, 220);
  if (!packageID) throw runtimeError("Select an approved TikTok package.", "TIKTOK_PACKAGE_ID_REQUIRED", 400);
  const socialPackage = await readSocialPackage(request, packageID);
  if (!socialPackage) throw runtimeError("The approved TikTok package could not be found.", "TIKTOK_PACKAGE_NOT_FOUND", 404);
  const token = await validAccessToken(env);
  const creator = await queryCreatorInfo(env, token, { persist: true, allowRefresh: false });
  const config = connectorConfiguration(env);
  const handoff = {
    handoffMode: clean(body?.handoffMode, 20),
    mediaUrls: Array.isArray(body?.mediaUrls) ? body.mediaUrls : [],
    privacyLevel: clean(body?.privacyLevel, 80),
    disableComment: Boolean(body?.disableComment),
    disableDuet: Boolean(body?.disableDuet),
    disableStitch: Boolean(body?.disableStitch),
    autoAddMusic: Boolean(body?.autoAddMusic),
    isAigc: Boolean(body?.isAigc),
    brandOrganic: body?.brandOrganic !== false,
    photoCoverIndex: Number(body?.photoCoverIndex || 0),
    explicitConsent: body?.explicitConsent === true,
    mediaGuidelinesConfirmed: body?.mediaGuidelinesConfirmed === true,
  };
  const requestPlan = buildTikTokPublishRequest(socialPackage, handoff, creator, config);
  const requiredScope = handoff.handoffMode === "direct" ? "video.publish" : "video.upload";
  assertScope(await vaultGet(env, "tokens"), requiredScope);
  const response = await tiktokJSON(requestPlan.endpoint, {
    method: "POST",
    token,
    body: requestPlan.body,
  });
  const publishId = clean(response?.data?.publish_id, 128);
  if (!publishId) throw runtimeError("TikTok accepted no publish identifier.", "TIKTOK_PUBLISH_ID_MISSING", 502);
  const payloadSha256 = await sha256(JSON.stringify(socialPackage.connectorReadyPayload || {}));
  const receipt = {
    id: `tiktok-receipt-${crypto.randomUUID()}`,
    packageID,
    platform: "tiktok",
    account: `@${normalizeUsername(creator.creator_username)}`,
    packagePayloadSha256: payloadSha256,
    packageBuild: socialPackage.build,
    frameworkBuild: socialPackage.frameworkBuild,
    connectorBuild: KAIROS_TIKTOK_CONNECTOR_BUILD,
    mode: socialPackage.mode,
    handoffMode: handoff.handoffMode,
    publishId,
    state: handoff.handoffMode === "direct" ? "processing" : "uploaded-to-tiktok-inbox",
    captionForwarded: requestPlan.captionForwarded,
    captionManualTransferRequired: handoff.handoffMode === "upload" && socialPackage.mode === "tiktok-video",
    mediaUrls: [...handoff.mediaUrls],
    privacyLevel: handoff.handoffMode === "direct" ? handoff.privacyLevel : null,
    explicitConsent: true,
    mediaGuidelinesConfirmed: true,
    requestedByShop: clean(auth?.shopDomain, 255),
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
    tiktokStatus: null,
    postIds: [],
    metrics: [],
  };
  await vaultPut(env, receiptKey(packageID), receipt);
  await vaultPut(env, `receipt-by-publish:${publishId}`, receipt);
  return receipt;
}

async function refreshReceipt(env, packageID) {
  if (!packageID) throw runtimeError("Select a TikTok package receipt.", "TIKTOK_RECEIPT_PACKAGE_REQUIRED", 400);
  const receipt = await vaultGet(env, receiptKey(packageID));
  if (!receipt?.publishId) throw runtimeError("No TikTok connector receipt exists for this package.", "TIKTOK_RECEIPT_NOT_FOUND", 404);
  const token = await validAccessToken(env);
  const statusBody = await tiktokJSON(`${TIKTOK_API}/v2/post/publish/status/fetch/`, {
    method: "POST",
    token,
    body: { publish_id: receipt.publishId },
  });
  const data = statusBody?.data || {};
  const postIds = uniqueStrings(data?.publicaly_available_post_id || data?.publicly_available_post_id || receipt.postIds || []).slice(0, 20);
  let metrics = receipt.metrics || [];
  const tokens = await vaultGet(env, "tokens");
  if (postIds.length && normalizeScopes(tokens?.scope).includes("video.list")) {
    try { metrics = await queryVideoMetrics(token, postIds); } catch {}
  }
  const updated = {
    ...receipt,
    state: normalizeTikTokStatus(data?.status, receipt.state),
    lastCheckedAt: new Date().toISOString(),
    tiktokStatus: sanitizeStatus(data),
    postIds,
    metrics,
  };
  await vaultPut(env, receiptKey(packageID), updated);
  await vaultPut(env, `receipt-by-publish:${receipt.publishId}`, updated);
  return updated;
}

async function queryCreatorInfo(env, accessToken, options = {}) {
  const token = options.allowRefresh === false ? accessToken : accessToken || await validAccessToken(env);
  const body = await tiktokJSON(`${TIKTOK_API}/v2/post/publish/creator_info/query/`, {
    method: "POST",
    token,
    body: null,
  });
  const creator = sanitizeCreator(body?.data || {});
  const config = connectorConfiguration(env);
  const actual = normalizeUsername(creator.creator_username);
  if (!actual) throw runtimeError("TikTok creator verification returned no username.", "TIKTOK_CREATOR_USERNAME_MISSING", 502);
  if (actual !== config.expectedUsername) {
    throw runtimeError(`Connected TikTok account @${actual} does not match required account @${config.expectedUsername}.`, "TIKTOK_ACCOUNT_MISMATCH", 409);
  }
  if (options.persist !== false) await vaultPut(env, "creator", creator);
  return creator;
}

async function queryBasicProfile(accessToken) {
  const url = new URL(`${TIKTOK_API}/v2/user/info/`);
  url.searchParams.set("fields", "open_id,avatar_url,display_name");
  const body = await tiktokJSON(url.toString(), { method: "GET", token: accessToken });
  return sanitizeProfile(body?.data?.user || {});
}

async function queryVideoMetrics(accessToken, postIds) {
  const url = new URL(`${TIKTOK_API}/v2/video/query/`);
  url.searchParams.set("fields", "id,create_time,share_url,title,video_description,duration,like_count,comment_count,share_count,view_count");
  const body = await tiktokJSON(url.toString(), {
    method: "POST",
    token: accessToken,
    body: { filters: { video_ids: postIds } },
  });
  return Array.isArray(body?.data?.videos) ? body.data.videos.map((video) => ({
    id: clean(video?.id, 128),
    createTime: video?.create_time ?? null,
    shareUrl: clean(video?.share_url, 2000),
    title: clean(video?.title, 500),
    description: clean(video?.video_description, 2500),
    duration: Number(video?.duration || 0),
    views: Number(video?.view_count || 0),
    likes: Number(video?.like_count || 0),
    comments: Number(video?.comment_count || 0),
    shares: Number(video?.share_count || 0),
  })) : [];
}

async function validAccessToken(env) {
  const config = connectorConfiguration(env);
  assertConfig(config);
  let tokens = await vaultGet(env, "tokens");
  if (!tokens?.refreshToken) throw runtimeError("Connect TikTok before using the connector.", "TIKTOK_NOT_CONNECTED", 409);
  if (Number(tokens.refreshExpiresAt || 0) <= Date.now()) {
    await vaultDeleteMany(env, ["tokens", "profile", "creator"]);
    throw runtimeError("TikTok authorization expired. Reconnect TikTok.", "TIKTOK_REFRESH_TOKEN_EXPIRED", 401);
  }
  if (Number(tokens.accessExpiresAt || 0) <= Date.now() + TOKEN_REFRESH_SKEW_MS) {
    const refreshed = await refreshAccessToken(config, tokens.refreshToken);
    tokens = tokenRecord(refreshed);
    await vaultPut(env, "tokens", tokens);
  }
  return tokens.accessToken;
}

async function exchangeAuthorizationCode(config, code) {
  const body = new URLSearchParams();
  body.set("client_key", config.clientKey);
  body.set("client_secret", config.clientSecret);
  body.set("code", code);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", config.redirectUri);
  return tokenRequest(body);
}

async function refreshAccessToken(config, refreshToken) {
  const body = new URLSearchParams();
  body.set("client_key", config.clientKey);
  body.set("client_secret", config.clientSecret);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  return tokenRequest(body);
}

async function tokenRequest(form) {
  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) {
    throw runtimeError(clean(body?.error_description || body?.error || "TikTok token request failed.", 1600), "TIKTOK_TOKEN_REQUEST_FAILED", response.status >= 400 ? response.status : 502);
  }
  if (!body?.access_token || !body?.refresh_token) throw runtimeError("TikTok token response was incomplete.", "TIKTOK_TOKEN_RESPONSE_INVALID", 502);
  return body;
}

async function tiktokJSON(url, options = {}) {
  const headers = { Authorization: `Bearer ${options.token}`, "Cache-Control": "no-cache" };
  let body;
  if (options.body !== undefined && options.body !== null) {
    headers["Content-Type"] = "application/json; charset=UTF-8";
    body = JSON.stringify(options.body);
  } else if (options.method === "POST") {
    headers["Content-Type"] = "application/json; charset=UTF-8";
  }
  const response = await fetch(url, { method: options.method || "GET", headers, body });
  const payload = await response.json().catch(() => ({}));
  const code = clean(payload?.error?.code, 200);
  if (!response.ok || (code && code !== "ok")) {
    const message = clean(payload?.error?.message || payload?.message || `TikTok API request failed with HTTP ${response.status}.`, 1800);
    const error = runtimeError(message, code ? `TIKTOK_${code.toUpperCase()}` : "TIKTOK_API_FAILED", response.status >= 400 ? response.status : 502);
    error.tiktokCode = code || null;
    error.tiktokLogId = clean(payload?.error?.log_id || payload?.error?.logid, 300) || null;
    throw error;
  }
  return payload;
}

function tokenRecord(token) {
  const now = Date.now();
  return {
    accessToken: clean(token?.access_token, 5000),
    refreshToken: clean(token?.refresh_token, 5000),
    openId: clean(token?.open_id, 500),
    scope: normalizeScopes(token?.scope).join(","),
    tokenType: clean(token?.token_type || "Bearer", 40),
    accessExpiresAt: now + Math.max(0, Number(token?.expires_in || 0)) * 1000,
    refreshExpiresAt: now + Math.max(0, Number(token?.refresh_expires_in || 0)) * 1000,
    storedAt: new Date(now).toISOString(),
  };
}

function assertConfig(config) {
  if (!config?.enabled) throw runtimeError("The TikTok connector is disabled.", "TIKTOK_CONNECTOR_DISABLED", 503);
  if (!config?.vaultBound) throw runtimeError("The TikTok connector vault binding is unavailable.", "TIKTOK_CONNECTOR_VAULT_UNAVAILABLE", 503);
  if (!config?.clientKey || !config?.clientSecret || !config?.redirectUri) {
    throw runtimeError("TikTok app credentials are not configured. Set KAIROS_TIKTOK_CLIENT_KEY, KAIROS_TIKTOK_CLIENT_SECRET, and KAIROS_TIKTOK_REDIRECT_URI.", "TIKTOK_CONNECTOR_NOT_CONFIGURED", 503);
  }
  let redirect;
  try { redirect = new URL(config.redirectUri); } catch { throw runtimeError("TikTok redirect URI is invalid.", "TIKTOK_REDIRECT_URI_INVALID", 503); }
  if (redirect.protocol !== "https:") throw runtimeError("TikTok redirect URI must use HTTPS.", "TIKTOK_REDIRECT_URI_INVALID", 503);
}

function assertScope(tokens, required) {
  if (!normalizeScopes(tokens?.scope).includes(required)) throw runtimeError(`TikTok authorization is missing required scope ${required}. Reconnect after the scope is approved for the app.`, "TIKTOK_SCOPE_NOT_AUTHORIZED", 403);
}

function normalizeMediaURLs(values, allowedOrigins) {
  const urls = Array.isArray(values) ? values : [];
  return urls.map((value) => {
    let url;
    try { url = new URL(clean(value, 4000)); } catch { throw runtimeError("Every TikTok media asset must use a valid HTTPS URL.", "TIKTOK_MEDIA_URL_INVALID", 400); }
    if (url.protocol !== "https:") throw runtimeError("TikTok media URLs must use HTTPS.", "TIKTOK_MEDIA_URL_INVALID", 400);
    if (!allowedOrigins.includes(url.origin)) throw runtimeError(`Media origin ${url.origin} is not configured as a TikTok-verified origin.`, "TIKTOK_MEDIA_ORIGIN_NOT_VERIFIED", 409);
    return url.toString();
  });
}

function sanitizeCreator(value) {
  return {
    creator_avatar_url: clean(value?.creator_avatar_url, 2000),
    creator_username: normalizeUsername(value?.creator_username),
    creator_nickname: clean(value?.creator_nickname, 300),
    privacy_level_options: uniqueStrings(value?.privacy_level_options || []).filter((item) => ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"].includes(item)),
    comment_disabled: Boolean(value?.comment_disabled),
    duet_disabled: Boolean(value?.duet_disabled),
    stitch_disabled: Boolean(value?.stitch_disabled),
    max_video_post_duration_sec: Number(value?.max_video_post_duration_sec || 0),
    verifiedAt: new Date().toISOString(),
  };
}

function sanitizeProfile(value) {
  return {
    open_id: clean(value?.open_id, 500),
    avatar_url: clean(value?.avatar_url, 2000),
    display_name: clean(value?.display_name, 300),
  };
}

function sanitizeStatus(value) {
  return {
    status: clean(value?.status, 120),
    failReason: clean(value?.fail_reason, 1200),
    uploadedBytes: Number(value?.uploaded_bytes || 0),
    postIds: uniqueStrings(value?.publicaly_available_post_id || value?.publicly_available_post_id || []),
  };
}

function normalizeTikTokStatus(value, fallback) {
  const status = clean(value, 120).toUpperCase();
  if (["PUBLISH_COMPLETE", "SEND_TO_USER_INBOX"].includes(status)) return status === "PUBLISH_COMPLETE" ? "published" : "uploaded-to-tiktok-inbox";
  if (["FAILED", "PUBLISH_FAILED"].includes(status)) return "failed";
  if (["PROCESSING_UPLOAD", "PROCESSING_DOWNLOAD", "PROCESSING", "PUBLISHING"].includes(status)) return "processing";
  return fallback || "processing";
}

function callbackPage(ok, message) {
  const safe = escapeHTML(message);
  const title = ok ? "TikTok connected" : "TikTok connection failed";
  const status = ok ? 200 : 400;
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#05070a;color:#f7f9fc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px"><main style="max-width:560px;border:1px solid #243342;border-radius:22px;background:#0b1017;padding:28px"><h1 style="margin-top:0">${title}</h1><p style="color:#b6c2cc;line-height:1.55">${safe}</p><p style="color:#7f91a0;font-size:13px">You can close this window and return to Kairos.</p></main></body></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "X-Kairos-TikTok-Connector": KAIROS_TIKTOK_CONNECTOR_BUILD,
    },
  });
}

async function vaultGet(env, key) {
  return (await vaultCall(env, { operation: "get", key }))?.value ?? null;
}
async function vaultPut(env, key, value) {
  await vaultCall(env, { operation: "put", key, value });
}
async function vaultDelete(env, key) {
  await vaultCall(env, { operation: "delete", key });
}
async function vaultDeleteMany(env, keys) {
  await vaultCall(env, { operation: "deleteMany", keys });
}
async function vaultCall(env, body) {
  if (!env?.KAIROS_TIKTOK_CONNECTOR?.idFromName || !env?.KAIROS_TIKTOK_CONNECTOR?.get) throw runtimeError("TikTok connector vault binding is unavailable.", "TIKTOK_CONNECTOR_VAULT_UNAVAILABLE", 503);
  const stub = env.KAIROS_TIKTOK_CONNECTOR.get(env.KAIROS_TIKTOK_CONNECTOR.idFromName(VAULT_NAME));
  const response = await stub.fetch(new Request("https://kairos.internal/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw runtimeError(value?.error?.message || "TikTok connector vault operation failed.", value?.error?.code || "TIKTOK_CONNECTOR_VAULT_FAILED", response.status);
  return value;
}

function receiptKey(packageID) { return `receipt:${packageID}`; }
function normalizeScopes(value) { return uniqueStrings(String(value || "").split(",").map((item) => item.trim()).filter(Boolean)); }
function parseList(value) { return uniqueStrings(String(value || "").split(",").map((item) => item.trim()).filter(Boolean)); }
function parseOrigins(value) {
  const origins = [];
  for (const raw of parseList(value)) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" && !origins.includes(url.origin)) origins.push(url.origin);
    } catch {}
  }
  return origins;
}
function normalizeUsername(value) { return clean(value, 300).replace(/^@+/, "").toLowerCase(); }
function uniqueStrings(values) { return [...new Set((Array.isArray(values) ? values : []).map((item) => clean(item, 400)).filter(Boolean))]; }
function cleanCaption(value, max) { return Array.from(String(value || "").replace(/\s+/g, " ").trim()).slice(0, max).join(""); }
function clean(value, max = 1000) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.round(value) : min)); }
function truthy(value, fallback) { if (value === undefined || value === null || value === "") return fallback; return ["true", "1", "yes", "enabled", "on"].includes(String(value).toLowerCase()); }
function randomState() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

function methodNotAllowed(allow) { const response = connectorError(405, "METHOD_NOT_ALLOWED", "Method not allowed."); response.headers.set("Allow", allow); return response; }
function connectorFailure(error) {
  return connectorError(Number(error?.status || 500), error?.code || "TIKTOK_CONNECTOR_FAILED", error instanceof Error ? error.message : "TikTok connector operation failed.", {
    retriable: Number(error?.status || 500) >= 500,
    tiktokCode: error?.tiktokCode || null,
    tiktokLogId: error?.tiktokLogId || null,
  });
}
function connectorError(status, code, message, extra = {}) {
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  return json({ status: safeStatus >= 500 ? "failed" : "needs-input", error: { code, message, ...extra }, build: KAIROS_TIKTOK_CONNECTOR_BUILD }, safeStatus);
}
function runtimeError(message, code = "TIKTOK_CONNECTOR_FAILED", status = 400) { return Object.assign(new Error(message), { code, status }); }
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Kairos-TikTok-Connector": KAIROS_TIKTOK_CONNECTOR_BUILD,
    },
  });
}
