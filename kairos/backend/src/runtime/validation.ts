import type { KairosMode, KairosRuntimeRequest, KairosSurface } from './contracts.js';

const allowedModes = new Set<KairosMode>(['public', 'customer', 'admin']);
const allowedSurfaces = new Set<KairosSurface>(['website', 'dashboard', 'ios']);

export function parseKairosRuntimeRequest(value: unknown): KairosRuntimeRequest {
  if (!value || typeof value !== 'object') {
    throw validationError('invalid_payload', 'Request body must be a JSON object.');
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.mode !== 'string' || !allowedModes.has(candidate.mode as KairosMode)) {
    throw validationError('invalid_mode', 'Request mode is not supported.');
  }

  if (typeof candidate.surface !== 'string' || !allowedSurfaces.has(candidate.surface as KairosSurface)) {
    throw validationError('invalid_surface', 'Request surface is not supported.');
  }

  if (typeof candidate.message !== 'string') {
    throw validationError('invalid_message', 'Message must be a string.');
  }

  const message = candidate.message.trim();
  if (!message) {
    throw validationError('empty_message', 'Message cannot be empty.');
  }

  if (message.length > 8000) {
    throw validationError('message_too_large', 'Message exceeds the allowed size.');
  }

  const context = parseStringRecord(candidate.context);

  return {
    mode: candidate.mode as KairosMode,
    surface: candidate.surface as KairosSurface,
    message,
    context
  };
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError('invalid_context', 'Context must be an object when provided.');
  }

  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== 'string') {
      throw validationError('invalid_context_value', 'Context values must be strings.');
    }

    output[key] = item;
  }

  return output;
}

export function validationError(code: string, message: string): Error & { code: string; statusCode: number } {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = code;
  error.statusCode = 400;
  return error;
}
