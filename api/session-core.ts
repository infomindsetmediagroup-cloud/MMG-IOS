import { createHash, createHmac, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "mmg_kairos_session";
const SESSION_TTL_SECONDS = 30 * 60;
const PASSWORD_HASH_PREFIX = "scrypt-v1";
const PASSWORD_KEY_LENGTH = 64;

export interface OperatorSession {
  sub: string;
  tenantId: "mmg-internal";
  role: "executive";
  operator: string;
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
}

interface SessionPayload {
  sub: string;
  tenantId: "mmg-internal";
  role: "executive";
  operator: string;
  iat: number;
  exp: number;
  jti: string;
}

export function verifyOperatorPassword(supplied: string, encodedHash: string): boolean {
  const [prefix, saltHex, expectedHex, extra] = encodedHash.trim().split("$");
  if (prefix !== PASSWORD_HASH_PREFIX || !saltHex || !expectedHex || extra) return false;
  if (!/^[a-f0-9]+$/i.test(saltHex) || !/^[a-f0-9]+$/i.test(expectedHex)) return false;

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(expectedHex, "hex");
    if (salt.length < 16 || expected.length !== PASSWORD_KEY_LENGTH) return false;
    const derived = scryptSync(supplied, salt, PASSWORD_KEY_LENGTH);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function issueOperatorSession(operatorInput: string, runtimeToken: string): { token: string; session: OperatorSession } {
  const operator = sanitizeOperator(operatorInput);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_TTL_SECONDS;
  const sessionId = randomUUID();
  const payload: SessionPayload = {
    sub: `operator:${operator.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    tenantId: "mmg-internal",
    role: "executive",
    operator,
    iat: issuedAt,
    exp: expiresAt,
    jti: sessionId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encodedPayload, runtimeToken);
  return {
    token: `${encodedPayload}.${signature}`,
    session: toSession(payload),
  };
}

export function verifyOperatorSession(token: string | undefined, runtimeToken: string): OperatorSession | null {
  if (!token) return null;
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra) return null;
  const expected = sign(payloadPart, runtimeToken);
  const suppliedBytes = Buffer.from(signaturePart, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (
      typeof payload.sub !== "string" ||
      payload.tenantId !== "mmg-internal" ||
      payload.role !== "executive" ||
      typeof payload.operator !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      typeof payload.jti !== "string" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return toSession(payload as SessionPayload);
  } catch {
    return null;
  }
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

export function sessionCookie(token: string, expiresAt: number): string {
  const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function sign(payload: string, runtimeToken: string): string {
  const key = createHash("sha256").update(`mmg-kairos-session-v1:${runtimeToken}`).digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function sanitizeOperator(value: string): string {
  const operator = value.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!operator) throw new Error("Operator name is required.");
  return operator;
}

function toSession(payload: SessionPayload): OperatorSession {
  return {
    sub: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    operator: payload.operator,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    sessionId: payload.jti,
  };
}
