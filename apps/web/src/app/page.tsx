import { auth } from '@clerk/nextjs/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import Link from 'next/link';

const productPillars = [
  {
    title: 'CLI-first review',
    description: 'Run local diff reviews before the PR exists and keep the workflow close to git.'
  },
  {
    title: 'Team governance',
    description:
      'Attach workspace policy versions, audit metadata, and provider settings to every synced review.'
  },
  {
    title: 'Local-first privacy',
    description: 'Avoid uploading the full repository by default and sync only selected artifacts.'
  }
];

export default async function HomePage() {
  const { userId } = await auth();
  const dashboardHref = userId ? '/dashboard/overview' : '/auth/sign-in';

  return (
    <main className='relative min-h-screen overflow-hidden'>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--primary)/0.18,transparent_32%),radial-gradient(circle_at_bottom_right,var(--accent)/0.22,transparent_28%),linear-gradient(180deg,var(--background),color-mix(in_oklab,var(--muted)_32%,transparent))]' />
      <div className='relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10'>
        <header className='flex items-center justify-between gap-4'>
          <Link href='/' className='flex items-center gap-3 font-medium'>
            <span className='flex h-10 w-10 items-center justify-center rounded-2xl border bg-background shadow-sm'>
              <Icons.logo className='h-5 w-5' />
            </span>
            <span className='text-lg font-semibold'>Devflow</span>
          </Link>
          <div className='flex items-center gap-2'>
            <Button variant='ghost' asChild>
              <Link href='/docs'>Docs</Link>
            </Button>
            <Button variant='ghost' asChild>
              <Link href='/install'>Install</Link>
            </Button>
            <Button asChild>
              <Link href={dashboardHref}>{userId ? 'Open Dashboard' : 'Sign In'}</Link>
            </Button>
          </div>
        </header>

        <section className='grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.2fr_0.8fr]'>
          <div className='space-y-6'>
            <Badge variant='outline' className='bg-background/70'>
              Local-first review for governed teams
            </Badge>
            <div className='space-y-4'>
              <h1 className='max-w-4xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl'>
                Policy-driven code review where the real work stays in the terminal and editor.
              </h1>
              <p className='text-muted-foreground max-w-2xl text-lg leading-8'>
                Devflow wraps a terminal-first review engine with workspace policies, provider
                control, synced history, audit trails, and docs that let teams onboard without a
                guided setup call.
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              <Button size='lg' asChild>
                <Link href='/docs/getting-started/5-minute-quickstart'>Start the Quickstart</Link>
              </Button>
              <Button size='lg' variant='outline' asChild>
                <Link href='/install'>Install CLI & VS Code</Link>
              </Button>
            </div>
            <div className='grid gap-3 pt-4 sm:grid-cols-3'>
              {productPillars.map((pillar) => (
                <Card key={pillar.title} className='bg-background/75 backdrop-blur'>
                  <CardHeader>
                    <CardTitle className='text-base'>{pillar.title}</CardTitle>
                    <CardDescription>{pillar.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>

          <Card className='border-primary/20 bg-background/80 shadow-xl backdrop-blur'>
            <CardHeader>
              <CardTitle className='text-xl'>Production foundation</CardTitle>
              <CardDescription>
                The web app is a control plane. CLI and VS Code remain the primary product surface.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4 text-sm'>
              <div className='flex items-start gap-3'>
                <Icons.code className='text-primary mt-0.5 h-4 w-4' />
                <div>
                  <p className='font-medium'>CLI commands</p>
                  <p className='text-muted-foreground'>
                    `review`, `explain`, `tests`, `history`, and `doctor`
                  </p>
                </div>
              </div>
              <div className='flex items-start gap-3'>
                <Icons.panelLeft className='text-primary mt-0.5 h-4 w-4' />
                <div>
                  <p className='font-medium'>VS Code companion</p>
                  <p className='text-muted-foreground'>
                    One-click review, grouped findings, and deep links back to the dashboard
                  </p>
                </div>
              </div>
              <div className='flex items-start gap-3'>
                <Icons.workspace className='text-primary mt-0.5 h-4 w-4' />
                <div>
                  <p className='font-medium'>Workspace control plane</p>
                  <p className='text-muted-foreground'>
                    Team policies, providers, billing, history, audit, docs, and release channels
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
