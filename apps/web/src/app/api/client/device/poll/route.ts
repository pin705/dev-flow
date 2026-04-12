import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { deviceAuthActionSchema } from '@/features/control-plane/server/schemas';
import { pollDeviceAuth } from '@/features/control-plane/server/service';

export async function POST(request: Request) {
  try {
    const body = deviceAuthActionSchema.parse(await request.json());
    const session = await pollDeviceAuth(body.deviceCode);

    if (!session) {
      return NextResponse.json(
        {
          error: 'Unknown device code.'
        },
        { status: 404 }
      );
    }

    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid device auth poll payload.',
          issues: error.issues
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Unable to poll device auth status.'
      },
      { status: 500 }
    );
  }
}
