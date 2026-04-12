import { NextResponse } from 'next/server';
import { authorizeApprovedDeviceSession } from './service';

export interface AuthorizedClientRequest {
  deviceCode: string;
  workspaceId: string;
}

function readDeviceCodeFromRequest(request: Request): string | null {
  const authorization = request.headers.get('authorization');

  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  const headerValue = request.headers.get('x-devflow-device-code');
  return headerValue?.trim() || null;
}

export async function requireAuthorizedClientRequest(
  request: Request
): Promise<AuthorizedClientRequest | NextResponse> {
  const deviceCode = readDeviceCodeFromRequest(request);

  if (!deviceCode) {
    return NextResponse.json(
      {
        error: 'Missing device session. Run `devflow auth login` again.'
      },
      { status: 401 }
    );
  }

  const session = await authorizeApprovedDeviceSession(deviceCode);

  if (!session) {
    return NextResponse.json(
      {
        error: 'Device session is not approved or has expired. Run `devflow auth login` again.'
      },
      { status: 403 }
    );
  }

  return session;
}
