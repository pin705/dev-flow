import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { deviceAuthActionSchema } from '@/features/control-plane/server/schemas';
import { revokeDeviceAuth } from '@/features/control-plane/server/service';

export async function POST(request: Request) {
  try {
    const body = deviceAuthActionSchema.parse(await request.json());
    const session = await revokeDeviceAuth(body.deviceCode);

    if (!session) {
      return NextResponse.json(
        {
          error: 'Unknown device code.'
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      session
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid device auth logout payload.',
          issues: error.issues
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Unable to revoke device auth session.'
      },
      { status: 500 }
    );
  }
}
