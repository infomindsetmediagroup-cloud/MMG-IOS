import type { KairosRuntimeErrorResponse } from './contracts';

export function toSafeErrorResponse(error: unknown): { statusCode: number; body: KairosRuntimeErrorResponse } {
  if (isRuntimeError(error)) {
    return {
      statusCode: error.statusCode,
      body: {
        status: 'error',
        code: error.code,
        message: error.message
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      status: 'error',
      code: 'runtime_error',
      message: 'Kairos could not complete the request.'
    }
  };
}

function isRuntimeError(error: unknown): error is Error & { code: string; statusCode: number } {
  return Boolean(
    error instanceof Error &&
      typeof (error as { code?: unknown }).code === 'string' &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
  );
}
