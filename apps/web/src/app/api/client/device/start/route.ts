import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { deviceAuthStartSchema } from '@/features/control-plane/server/schemas';
import { startDeviceAuth } from '@/features/control-plane/server/service';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const body = rawBody ? JSON.parse(rawBody) : {};
    const payload = deviceAuthStartSchema.parse(body);

    return NextResponse.json(await startDeviceAuth(payload.workspaceId));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid device auth start payload.',
          issues: error.issues
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Unable to start device auth.'
      },
      { status: 500 }
    );
  }
}
