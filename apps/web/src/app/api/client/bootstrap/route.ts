import { NextResponse } from 'next/server';
import { getWorkspaceBootstrap } from '@/features/control-plane/server/service';

export async function GET() {
  return NextResponse.json(await getWorkspaceBootstrap());
}
