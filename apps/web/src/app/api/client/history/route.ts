import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { reviewSessionSchema } from '@/features/control-plane/server/schemas';
import { listReviewSessions, recordReviewSession } from '@/features/control-plane/server/service';

export async function GET() {
  return NextResponse.json({
    items: await listReviewSessions()
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const session = reviewSessionSchema.parse(body);

    return NextResponse.json({
      accepted: true,
      item: await recordReviewSession(session)
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid review session payload.',
          issues: error.issues
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Unable to record review session.'
      },
      { status: 500 }
    );
  }
}
