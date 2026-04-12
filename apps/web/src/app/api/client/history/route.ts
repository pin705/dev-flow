import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuthorizedClientRequest } from '@/features/control-plane/server/client-auth';
import { reviewSessionSchema } from '@/features/control-plane/server/schemas';
import { listReviewSessions, recordReviewSession } from '@/features/control-plane/server/service';

export async function GET(request: Request) {
  const session = await requireAuthorizedClientRequest(request);

  if (session instanceof NextResponse) {
    return session;
  }

  return NextResponse.json({
    items: await listReviewSessions(session.workspaceId)
  });
}

export async function POST(request: Request) {
  try {
    const clientSession = await requireAuthorizedClientRequest(request);

    if (clientSession instanceof NextResponse) {
      return clientSession;
    }

    const body = await request.json();
    const session = reviewSessionSchema.parse({
      ...body,
      workspaceId: clientSession.workspaceId
    });

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
