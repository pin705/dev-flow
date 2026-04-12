import type { DeviceAuthSession } from '@devflow/contracts';
import Link from 'next/link';
import { approveDeviceAuthAction, revokeDeviceAuthAction } from '@/app/auth/device/actions';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';

interface DeviceApprovalPageProps {
  deviceCode?: string;
  session: DeviceAuthSession | null;
  status?: string;
}

function renderStatusVariant(status?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'approved':
      return 'default';
    case 'revoked':
    case 'expired':
    case 'missing':
      return 'destructive';
    case 'pending':
      return 'secondary';
    default:
      return 'outline';
  }
}

function renderStatusLabel(status?: string): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'revoked':
      return 'Revoked';
    case 'expired':
      return 'Expired';
    case 'missing':
      return 'Missing session';
    case 'pending':
      return 'Pending approval';
    default:
      return 'Ready';
  }
}

export function DeviceApprovalPage({ deviceCode, session, status }: DeviceApprovalPageProps) {
  const effectiveStatus = session?.status ?? status;
  const badgeVariant = renderStatusVariant(effectiveStatus);

  if (!deviceCode) {
    return (
      <main className='bg-background flex min-h-screen items-center justify-center px-6 py-12'>
        <Card className='w-full max-w-xl'>
          <CardHeader>
            <CardTitle>Device approval</CardTitle>
            <CardDescription>
              Open this page from `devflow auth login` so you can approve a CLI session for the
              current workspace.
            </CardDescription>
          </CardHeader>
          <CardFooter className='gap-3'>
            <Button asChild>
              <Link href='/install'>Open install guide</Link>
            </Button>
            <Button variant='outline' asChild>
              <Link href='/docs/getting-started/5-minute-quickstart'>Quickstart</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return (
    <main className='bg-background flex min-h-screen items-center justify-center px-6 py-12'>
      <Card className='w-full max-w-2xl'>
        <CardHeader className='gap-4'>
          <div className='flex items-start justify-between gap-4'>
            <div className='space-y-2'>
              <CardTitle>Approve CLI sign-in</CardTitle>
              <CardDescription>
                Review the pending device session and approve it for the current signed-in account.
              </CardDescription>
            </div>
            <Badge variant={badgeVariant}>{renderStatusLabel(effectiveStatus)}</Badge>
          </div>
        </CardHeader>
        <CardContent className='space-y-4 text-sm'>
          <div className='grid gap-3 rounded-lg border p-4 sm:grid-cols-2'>
            <div>
              <p className='text-muted-foreground text-xs uppercase tracking-[0.18em]'>
                Device code
              </p>
              <p className='font-mono text-sm'>{deviceCode}</p>
            </div>
            <div>
              <p className='text-muted-foreground text-xs uppercase tracking-[0.18em]'>User code</p>
              <p className='font-mono text-sm'>{session?.userCode ?? 'Unavailable'}</p>
            </div>
            <div>
              <p className='text-muted-foreground text-xs uppercase tracking-[0.18em]'>Workspace</p>
              <p>{session?.workspaceId ?? 'Pending workspace selection'}</p>
            </div>
            <div>
              <p className='text-muted-foreground text-xs uppercase tracking-[0.18em]'>
                Expires at
              </p>
              <p>
                {session?.expiresAt ? new Date(session.expiresAt).toLocaleString() : 'Unavailable'}
              </p>
            </div>
          </div>

          {effectiveStatus === 'approved' ? (
            <div className='flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4'>
              <Icons.circleCheck className='mt-0.5 h-4 w-4 text-green-600' />
              <div className='space-y-1'>
                <p className='font-medium'>Device approved</p>
                <p className='text-muted-foreground'>
                  Return to the terminal. `devflow auth login` should continue automatically on the
                  next poll.
                </p>
              </div>
            </div>
          ) : null}

          {effectiveStatus === 'pending' ? (
            <div className='flex items-start gap-3 rounded-lg border p-4'>
              <Icons.clock className='text-muted-foreground mt-0.5 h-4 w-4' />
              <div className='space-y-1'>
                <p className='font-medium'>Approval required</p>
                <p className='text-muted-foreground'>
                  This device session is waiting for an explicit approval before the CLI can fetch
                  workspace bootstrap and sync data.
                </p>
              </div>
            </div>
          ) : null}

          {effectiveStatus === 'revoked' ||
          effectiveStatus === 'expired' ||
          effectiveStatus === 'missing' ? (
            <div className='flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4'>
              <Icons.warning className='text-destructive mt-0.5 h-4 w-4' />
              <div className='space-y-1'>
                <p className='font-medium'>This device session can no longer be used</p>
                <p className='text-muted-foreground'>
                  Start a fresh `devflow auth login` from the terminal to request a new device code.
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className='flex flex-wrap gap-3'>
          {effectiveStatus === 'pending' ? (
            <>
              <form action={approveDeviceAuthAction}>
                <input type='hidden' name='deviceCode' value={deviceCode} />
                <Button type='submit'>Approve device</Button>
              </form>
              <form action={revokeDeviceAuthAction}>
                <input type='hidden' name='deviceCode' value={deviceCode} />
                <Button type='submit' variant='outline'>
                  Reject device
                </Button>
              </form>
            </>
          ) : null}
          <Button variant='ghost' asChild>
            <Link href='/dashboard/overview'>Open dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
