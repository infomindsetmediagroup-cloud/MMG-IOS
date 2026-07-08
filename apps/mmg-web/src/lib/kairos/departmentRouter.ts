import type { KairosRuntimeRequest } from './contracts';

export type KairosDepartment =
  | 'kairos-core'
  | 'knowledge'
  | 'creator-education'
  | 'publishing'
  | 'customer-support'
  | 'admin-operations';

export function resolveKairosDepartment(request: KairosRuntimeRequest): KairosDepartment {
  const requestedDepartment = request.context?.department;

  if (isKairosDepartment(requestedDepartment)) {
    return requestedDepartment;
  }

  if (request.mode === 'admin') {
    return 'admin-operations';
  }

  if (request.mode === 'customer') {
    return 'customer-support';
  }

  return 'kairos-core';
}

function isKairosDepartment(value: unknown): value is KairosDepartment {
  return (
    value === 'kairos-core' ||
    value === 'knowledge' ||
    value === 'creator-education' ||
    value === 'publishing' ||
    value === 'customer-support' ||
    value === 'admin-operations'
  );
}
