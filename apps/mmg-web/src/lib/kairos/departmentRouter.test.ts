import { describe, expect, it } from 'vitest';
import { resolveKairosDepartment } from './departmentRouter';

describe('resolveKairosDepartment', () => {
  it('defaults public requests to kairos-core', () => {
    expect(
      resolveKairosDepartment({ mode: 'public', surface: 'website', message: 'Hello', context: {} })
    ).toBe('kairos-core');
  });

  it('routes customer mode to customer support by default', () => {
    expect(
      resolveKairosDepartment({ mode: 'customer', surface: 'dashboard', message: 'Hello', context: {} })
    ).toBe('customer-support');
  });

  it('honors valid department context', () => {
    expect(
      resolveKairosDepartment({
        mode: 'public',
        surface: 'website',
        message: 'Hello',
        context: { department: 'creator-education' }
      })
    ).toBe('creator-education');
  });
});
