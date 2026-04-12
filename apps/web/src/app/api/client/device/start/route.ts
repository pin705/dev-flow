import { NextResponse } from 'next/server';
import type { DeviceAuthSession } from '@devflow/contracts';

export async function POST() {
  const session: DeviceAuthSession = {
    deviceCode: 'device_devflow_local',
    userCode: 'FLOW-2026',
    verificationUri: 'http://localhost:3000/auth/sign-in',
    verificationUriComplete: 'http://localhost:3000/auth/sign-in?device_code=device_devflow_local',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    intervalSeconds: 5,
    status: 'pending',
    workspaceId: 'ws_devflow_core'
  };

  return NextResponse.json(session);
}
