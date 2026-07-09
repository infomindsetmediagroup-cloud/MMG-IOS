import { NextResponse } from 'next/server';
import { getCommandCenterTelemetryProvider } from '@/lib/command-center/liveOperations';

export async function GET() {
  const telemetryProvider = getCommandCenterTelemetryProvider();
  const telemetry = await telemetryProvider.getTelemetry();

  return NextResponse.json({
    ok: true,
    telemetry
  });
}
