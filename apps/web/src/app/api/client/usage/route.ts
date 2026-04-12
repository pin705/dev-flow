import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { usageEventInputSchema } from '@/features/control-plane/server/schemas';
import { recordUsageEvent } from '@/features/control-plane/server/service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = usageEventInputSchema.parse(body);

    return NextResponse.json({
      accepted: true,
      event: await recordUsageEvent(event)
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid usage event payload.',
          issues: error.issues
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Unable to record usage event.'
      },
      { status: 500 }
    );
  }
}
