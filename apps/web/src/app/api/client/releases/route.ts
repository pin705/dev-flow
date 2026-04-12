import { NextResponse } from 'next/server';
import { listReleaseManifests } from '@/features/control-plane/server/service';

export async function GET() {
  return NextResponse.json({
    items: await listReleaseManifests()
  });
}
