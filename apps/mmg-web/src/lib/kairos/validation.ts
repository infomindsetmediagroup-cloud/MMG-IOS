import type { KairosMode, KairosRuntimeRequest, KairosSurface } from './contracts';

const allowedModes = new Set<KairosMode>(['public', 'customer', 'admin']);
const allowedSurfaces = new Set<KairosSurface>(['website', 'dashboard', 'ios']);

export function parseKairosRuntimeRequest(value: unknown): KairosRuntimeRequest {
  if (!value || typeof value !== 'object') {
    throw runtimeError('invalid_payload', 'Request body must be a JSON object.', 400);
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.mode !== 'string' || !allowedModes.has(candidate.mode as KairosMode)) {
    throw runtimeError('invalid_mode', 'Request mode is not supported.', 400);
  }

  if (typeof candidate.surface !== 'string' || !allowedSurfaces.has(candidate.surface as KairosSurface)) {
    throw runtimeError('invalid_surface', 'Request surface is not supported.', 400);
  }

  if (typeof candidate.message !== 'string') {
    throw runtimeError('invalid_message', 'Message must be a string.', 400);
  }

  const message = candidate.message.trim();
  if (!message) {
    throw runtimeError('empty_message', 'Message cannot be empty.', 400);
  }

  if (message.length > 8000) {
    throw runtimeError('message_too_large', 'Message exceeds the allowed size.', 400);
  }

  return {
    mode: candidate.mode as KairosMode,
    surface: candidate.surface as KairosSurface,
    message,
    context: parseContext(candidate.context),
    conversationId: parseOptionalString(candidate.conversationId, 'conversationId')
  };
}

function parseContext(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw runtimeError('invalid_context', 'Context must be an object when provided.', 400);
  }

  const context: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== 'string') {
      throw runtimeError('invalid_context_value', 'Context values must be strings.', 400);
    }

    context[key] = item;
  }

  return context;
}

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw runtimeError('invalid_optional_field', `${fieldName} must be a string when provided.`, 400);
  }

  const normalized = value.trim();
  return normalized || undefined;
}

export function runtimeError(code: string, message: string, statusCode = 500): Error & { code: string; statusCode: number } {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
