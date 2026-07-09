import { NextResponse } from 'next/server';
import { getKairosEnvironmentStatus } from '@/lib/kairos/environment';

export const runtime = 'nodejs';

export function GET() {
  const kairos = getKairosEnvironmentStatus();

  return NextResponse.json({
    status: kairos.status === 'ok' ? 'ok' : 'degraded',
    service: 'mmg-web',
    runtime: 'kairos-ready',
    kairos
  });
}
