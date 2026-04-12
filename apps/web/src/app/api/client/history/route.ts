import { NextResponse } from 'next/server';
import { reviewSessions } from '@/features/control-plane/data';

export async function GET() {
  return NextResponse.json({
    items: reviewSessions
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  return NextResponse.json({
    accepted: true,
    received: body
  });
}
