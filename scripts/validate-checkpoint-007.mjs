import assert from 'node:assert/strict';
import { parseRuntimeBaseURL } from './runtime-base-url.mjs';

const baseUrl = parseRuntimeBaseURL(process.env.KAIROS_RUNTIME_BASE_URL);
const gatewayToken = process.env.KAIROS_RUNTIME_TOKEN;
const requireSession = process.env.KAIROS_EXPECT_SESSION_ENFORCEMENT === 'true';

if (!gatewayToken) throw new Error('KAIROS_RUNTIME_TOKEN is required.');

let cookie = '';

async function request(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (cookie) headers.set('Cookie', cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, redirect: 'manual' });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0];
  const text = await response.text();
  let body = {};
  if (text) {
    try { body = JSON.parse(text); } catch { body = { message: text }; }
  }
  return { response, body, setCookie };
}

function objectiveBody() {
  return JSON.stringify({
    objective: 'Return a concise Checkpoint 007 validation acknowledgement.',
    department: 'Executive Office',
    routingConfidence: 0.99,
    executionPlan: ['Validate authenticated runtime behavior.'],
    governanceNote: 'Validation request only. Do not claim external actions.'
  });
}

console.log(`Validating Checkpoint 007 at ${baseUrl}`);

const health = await request('/api/health', { headers: { Accept: 'application/json' } });
assert.equal(health.response.status, 200, `health failed: ${JSON.stringify(health.body)}`);
assert.equal(health.body.status, 'ready');

const badExchange = await request('/api/session/exchange', {
  method: 'POST',
  headers: { Authorization: 'Bearer invalid-checkpoint-007-token', Accept: 'application/json' }
});
assert.equal(badExchange.response.status, 401, 'invalid exchange token must be rejected');

const exchange = await request('/api/session/exchange', {
  method: 'POST',
  headers: { Authorization: `Bearer ${gatewayToken}`, Accept: 'application/json' }
});
assert.equal(exchange.response.status, 201, `session exchange failed: ${JSON.stringify(exchange.body)}`);
assert.equal(exchange.body.status, 'authenticated');
assert.ok(exchange.setCookie?.includes('HttpOnly'), 'session cookie must be HttpOnly');
assert.ok(exchange.setCookie?.includes('Secure'), 'session cookie must be Secure');
assert.ok(exchange.setCookie?.includes('SameSite=Strict'), 'session cookie must be SameSite=Strict');
assert.ok(cookie.startsWith('mmg_kairos_session='), 'session cookie was not captured');

const status = await request('/api/session', { headers: { Accept: 'application/json' } });
assert.equal(status.response.status, 200, `session status failed: ${JSON.stringify(status.body)}`);
assert.equal(status.body.status, 'authenticated');
assert.equal(status.body.session.tenantId, 'mmg-internal');
assert.equal(status.body.session.role, 'executive');

const sessionRequest = await request('/api/kairos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: objectiveBody()
});
assert.equal(sessionRequest.response.status, 200, `session Kairos request failed: ${JSON.stringify(sessionRequest.body)}`);
assert.equal(sessionRequest.body.executionContext?.authorizationMode, 'session');
assert.equal(sessionRequest.body.executionContext?.sessionId, status.body.session.sessionId);

const logout = await request('/api/session', { method: 'DELETE' });
assert.equal(logout.response.status, 204, 'logout must return 204');
cookie = '';

const statusAfterLogout = await request('/api/session', { headers: { Accept: 'application/json' } });
assert.equal(statusAfterLogout.response.status, 401, 'session must be absent after logout');

const gatewayRequest = await request('/api/kairos', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${gatewayToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  },
  body: objectiveBody()
});

if (requireSession) {
  assert.equal(gatewayRequest.response.status, 401, 'gateway-only request must fail when session enforcement is enabled');
  assert.equal(gatewayRequest.body.code, 'session_required');
} else {
  assert.equal(gatewayRequest.response.status, 200, `gateway rollback failed: ${JSON.stringify(gatewayRequest.body)}`);
  assert.equal(gatewayRequest.body.executionContext?.authorizationMode, 'gateway-fallback');
}

console.log('Checkpoint 007 live validation passed.');
