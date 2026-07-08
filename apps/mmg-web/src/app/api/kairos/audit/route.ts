import { NextRequest, NextResponse } from 'next/server';
import { resolveKairosSession } from '@/lib/kairos/auth';
import { readKairosAuditEvents } from '@/lib/kairos/audit';
import { runtimeError } from '@/lib/kairos/validation';
import { toSafeErrorResponse } from '@/lib/kairos/errors';

export const runtime = 'nodejs';

export function GET(request: NextRequest): NextResponse {
  try {
    const session = resolveKairosSession(request.headers);

    if (session.role !== 'admin') {
      throw runtimeError('admin_required', 'Admin access is required.', 403);
    }

    return NextResponse.json({
      status: 'ok',
      events: readKairosAuditEvents()
    });
  } catch (error) {
    const safeError = toSafeErrorResponse(error);
    return NextResponse.json(safeError.body, { status: safeError.statusCode });
  }
}
