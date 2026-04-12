'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { approveDeviceAuth, revokeDeviceAuth } from '@/features/control-plane/server/service';

function readDeviceCode(formData: FormData): string {
  const deviceCode = formData.get('deviceCode');

  if (typeof deviceCode !== 'string' || deviceCode.length === 0) {
    throw new Error('Missing device code.');
  }

  return deviceCode;
}

async function requireDeviceApprovalUser(deviceCode: string): Promise<string> {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({
      returnBackUrl: `/auth/device?device_code=${encodeURIComponent(deviceCode)}`
    });
  }

  return userId;
}

export async function approveDeviceAuthAction(formData: FormData): Promise<void> {
  const deviceCode = readDeviceCode(formData);
  const userId = await requireDeviceApprovalUser(deviceCode);
  const session = await approveDeviceAuth(deviceCode, userId);
  const status = session?.status ?? 'missing';

  redirect(`/auth/device?device_code=${encodeURIComponent(deviceCode)}&status=${status}`);
}

export async function revokeDeviceAuthAction(formData: FormData): Promise<void> {
  const deviceCode = readDeviceCode(formData);
  await requireDeviceApprovalUser(deviceCode);
  const session = await revokeDeviceAuth(deviceCode);
  const status = session?.status ?? 'missing';

  redirect(`/auth/device?device_code=${encodeURIComponent(deviceCode)}&status=${status}`);
}
