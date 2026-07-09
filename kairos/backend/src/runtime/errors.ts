import type { KairosRuntimeErrorResponse } from './contracts.js';

export function toSafeErrorResponse(error: unknown): { statusCode: number; body: KairosRuntimeErrorResponse } {
  if (isKnownRuntimeError(error)) {
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

function isKnownRuntimeError(error: unknown): error is Error & { code: string; statusCode: number } {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      'statusCode' in error &&
      typeof (error as { code?: unknown }).code === 'string' &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number' &&
      error instanceof Error
  );
}
