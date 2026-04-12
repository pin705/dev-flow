import { NextResponse } from 'next/server';
import { listPolicies } from '@/features/control-plane/server/service';

export async function GET() {
  return NextResponse.json({
    items: await listPolicies()
  });
}
