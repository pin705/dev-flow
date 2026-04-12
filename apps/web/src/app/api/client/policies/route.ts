import { NextResponse } from 'next/server';
import { requireAuthorizedClientRequest } from '@/features/control-plane/server/client-auth';
import { listPolicies } from '@/features/control-plane/server/service';

export async function GET(request: Request) {
  const session = await requireAuthorizedClientRequest(request);

  if (session instanceof NextResponse) {
    return session;
  }

  return NextResponse.json({
    items: await listPolicies(session.workspaceId)
  });
}
