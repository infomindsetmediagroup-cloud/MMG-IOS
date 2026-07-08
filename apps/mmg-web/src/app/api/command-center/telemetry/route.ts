import { NextResponse } from 'next/server';
import { getDevelopmentCommandCenterTelemetry } from '@/lib/command-center/liveOperations';

export async function GET() {
  const telemetry = getDevelopmentCommandCenterTelemetry();

  return NextResponse.json({
    ok: true,
    telemetry
  });
}
