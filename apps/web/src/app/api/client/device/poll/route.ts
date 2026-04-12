import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    status: 'approved',
    workspaceId: 'ws_devflow_core'
  });
}
