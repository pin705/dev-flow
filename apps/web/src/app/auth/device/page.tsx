import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { DeviceApprovalPage } from '@/features/auth/components/device-approval-page';
import { getDeviceAuthSession } from '@/features/control-plane/server/service';

export const metadata: Metadata = {
  title: 'Authentication | Device Approval',
  description: 'Approve a Devflow CLI or VS Code device sign-in request.'
};

export default async function DeviceApprovalRoute({
  searchParams
}: {
  searchParams: Promise<{ device_code?: string; status?: string }>;
}) {
  const { device_code: deviceCode, status } = await searchParams;

  if (!deviceCode) {
    return <DeviceApprovalPage session={null} status={status} />;
  }

  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn({
      returnBackUrl: `/auth/device?device_code=${encodeURIComponent(deviceCode)}`
    });
  }

  const session = await getDeviceAuthSession(deviceCode);

  return <DeviceApprovalPage deviceCode={deviceCode} session={session} status={status} />;
}
