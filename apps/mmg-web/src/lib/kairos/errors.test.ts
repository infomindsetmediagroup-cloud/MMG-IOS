import { describe, expect, it } from 'vitest';
import { toSafeErrorResponse } from './errors';
import { runtimeError } from './validation';

describe('toSafeErrorResponse', () => {
  it('returns known runtime errors unchanged', () => {
    expect(toSafeErrorResponse(runtimeError('invalid_mode', 'Bad mode.', 400))).toEqual({
      statusCode: 400,
      body: {
        status: 'error',
        code: 'invalid_mode',
        message: 'Bad mode.'
      }
    });
  });

  it('hides unknown error details', () => {
    expect(toSafeErrorResponse(new Error('secret stack detail'))).toEqual({
      statusCode: 500,
      body: {
        status: 'error',
        code: 'runtime_error',
        message: 'Kairos could not complete the request.'
      }
    });
  });
});
