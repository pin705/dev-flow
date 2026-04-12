import { NextResponse } from 'next/server';
import { policyBundles } from '@/features/control-plane/data';

export async function GET() {
  return NextResponse.json({
    items: policyBundles
  });
}
