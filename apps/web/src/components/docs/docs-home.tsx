import Link from 'next/link';
import { docsSectionMeta, type DocsNavGroup, type VisibleDocSection } from '@diffmint/docs-content';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DocsHomeProps {
  navigation: DocsNavGroup[];
  variant?: 'public' | 'dashboard';
}

const sectionVisuals: Record<
  VisibleDocSection,
  {
    icon: keyof typeof Icons;
    accentClass: string;
  }
> = {
  'Getting Started': {
    icon: 'sparkles',
    accentClass: 'bg-primary/10 text-primary'
  },
  Concepts: {
    icon: 'dashboard',
    accentClass: 'bg-amber-500/10 text-amber-700'
  },
  'CLI Reference': {
    icon: 'code',
    accentClass: 'bg-emerald-500/10 text-emerald-700'
  },
  'VS Code Guide': {
    icon: 'panelLeft',
    accentClass: 'bg-sky-500/10 text-sky-700'
  },
  'Admin Guide': {
    icon: 'workspace',
    accentClass: 'bg-indigo-500/10 text-indigo-700'
  },
  'Security & Privacy': {
    icon: 'lock',
    accentClass: 'bg-rose-500/10 text-rose-700'
  },
  Troubleshooting: {
    icon: 'help',
    accentClass: 'bg-orange-500/10 text-orange-700'
  },
  'Release Channels': {
    icon: 'trendingUp',
    accentClass: 'bg-sky-500/10 text-sky-700'
  }
};

function getVariantHref(href: string, variant: 'public' | 'dashboard'): string {
  return variant === 'dashboard' ? href.replace('/docs/', '/dashboard/docs/') : href;
}

function getDocMap(navigation: DocsNavGroup[]): Map<string, DocsNavGroup['items'][number]> {
  return new Map(navigation.flatMap((group) => group.items.map((item) => [item.href, item])));
}

export function DocsHome({ navigation, variant = 'public' }: DocsHomeProps) {
  const docMap = getDocMap(navigation);
  const recommendedTracks = [
    {
      title: 'Start as a developer',
      description:
        'Install, authenticate, run a first review, then move into command-level detail.',
      hrefs: [
        '/docs/getting-started/5-minute-quickstart',
        '/docs/getting-started/install-cli',
        '/docs/cli/reference'
      ]
    },
    {
      title: 'Roll out for a workspace',
      description:
        'Set workspace defaults, provider strategy, governance, and team onboarding in the right order.',
      hrefs: [
        '/docs/admin/workspace-setup',
        '/docs/admin/provider-strategy',
        '/docs/concepts/workspaces-policies-and-governance'
      ]
    },
    {
      title: 'Review security posture',
      description:
        'Understand what stays local, what may sync, and which controls belong to admins.',
      hrefs: [
        '/docs/security/privacy-and-redaction',
        '/docs/concepts/local-first-review',
        '/docs/concepts/architecture'
      ]
    }
  ];

  return (
    <div className='space-y-8'>
      <section className='relative overflow-hidden rounded-[2rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%),linear-gradient(180deg,var(--background),color-mix(in_oklab,var(--muted)_18%,transparent))] p-8 shadow-sm sm:p-10'>
        <div className='relative max-w-4xl space-y-6'>
          <Badge variant='outline' className='bg-background/70'>
            Canonical product guidance
          </Badge>
          <div className='space-y-4'>
            <h2 className='max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl'>
              Documentation that gets teams from install to governed rollout without a guided call.
            </h2>
            <p className='text-muted-foreground max-w-3xl text-base leading-8 sm:text-lg'>
              Start with the quickstart if you want the fastest path to a first successful review.
              Jump into admin guides when you are setting workspace defaults, provider policy, and
              rollout standards for a team.
            </p>
          </div>
          <div className='flex flex-wrap gap-3'>
            <Button asChild>
              <Link href={getVariantHref('/docs/getting-started/5-minute-quickstart', variant)}>
                Start the quickstart
              </Link>
            </Button>
            <Button variant='outline' asChild>
              <Link href={getVariantHref('/docs/getting-started/install-cli', variant)}>
                Install the CLI
              </Link>
            </Button>
            <Button variant='ghost' asChild>
              <Link
                href={
                  variant === 'dashboard'
                    ? '/dashboard/workspaces'
                    : getVariantHref('/docs/admin/workspace-setup', variant)
                }
              >
                {variant === 'dashboard' ? 'Open workspaces' : 'Plan team rollout'}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className='grid gap-4 md:grid-cols-3'>
        <Card className='rounded-[1.75rem] border-border/70 bg-card/70 backdrop-blur'>
          <CardHeader>
            <CardTitle className='flex items-center gap-3 text-base'>
              <span className='bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-2xl'>
                <Icons.code className='h-5 w-5' />
              </span>
              CLI-first workflows
            </CardTitle>
            <CardDescription>
              The docs start where users actually work: terminal flows first, editor companion
              second, control plane when needed.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className='rounded-[1.75rem] border-border/70 bg-card/70 backdrop-blur'>
          <CardHeader>
            <CardTitle className='flex items-center gap-3 text-base'>
              <span className='flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700'>
                <Icons.workspace className='h-5 w-5' />
              </span>
              Clear rollout path
            </CardTitle>
            <CardDescription>
              Developers, workspace admins, and platform owners can all find the next right guide
              without guessing the order.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className='rounded-[1.75rem] border-border/70 bg-card/70 backdrop-blur'>
          <CardHeader>
            <CardTitle className='flex items-center gap-3 text-base'>
              <span className='flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-700'>
                <Icons.lock className='h-5 w-5' />
              </span>
              Security explained plainly
            </CardTitle>
            <CardDescription>
              Privacy, sync, redaction, provider control, and governance guidance are written for
              operators, not just implementers.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <section className='space-y-4'>
        <div className='space-y-2'>
          <p className='text-primary text-sm font-medium uppercase tracking-[0.22em]'>
            Recommended Paths
          </p>
          <h2 className='text-2xl font-semibold tracking-tight text-balance'>
            Read the docs in the order that matches your job.
          </h2>
        </div>
        <div className='grid gap-4 xl:grid-cols-3'>
          {recommendedTracks.map((track, index) => (
            <Card
              key={track.title}
              className='rounded-[1.75rem] border-border/70 bg-background/80 shadow-sm'
            >
              <CardHeader>
                <CardTitle className='flex items-center gap-3 text-lg'>
                  <span className='bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold'>
                    0{index + 1}
                  </span>
                  {track.title}
                </CardTitle>
                <CardDescription>{track.description}</CardDescription>
              </CardHeader>
              <CardContent className='space-y-2'>
                {track.hrefs.map((href) => {
                  const doc = docMap.get(href);
                  if (!doc) return null;

                  return (
                    <Link
                      key={href}
                      href={getVariantHref(href, variant)}
                      className='hover:bg-muted flex items-start justify-between gap-3 rounded-2xl border border-border/70 px-4 py-3 transition-colors'
                    >
                      <div>
                        <p className='font-medium'>{doc.title}</p>
                        <p className='text-muted-foreground mt-1 text-sm'>{doc.description}</p>
                      </div>
                      <Icons.arrowRight className='text-muted-foreground mt-1 h-4 w-4 shrink-0' />
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className='space-y-4'>
        <div className='space-y-2'>
          <p className='text-primary text-sm font-medium uppercase tracking-[0.22em]'>
            Browse By Topic
          </p>
          <h2 className='text-2xl font-semibold tracking-tight text-balance'>
            Every section has a clear job and a clear audience.
          </h2>
        </div>
        <div className='grid gap-4 xl:grid-cols-2'>
          {navigation.map((group) => {
            const section = group.section as VisibleDocSection;
            const meta = docsSectionMeta[section];
            const visual = sectionVisuals[section];
            const Icon = Icons[visual.icon];

            return (
              <Card
                key={group.section}
                className='rounded-[1.75rem] border-border/70 bg-card/70 backdrop-blur'
              >
                <CardHeader>
                  <div className='flex items-start justify-between gap-4'>
                    <div className='space-y-3'>
                      <div
                        className={cn(
                          'flex h-11 w-11 items-center justify-center rounded-2xl',
                          visual.accentClass
                        )}
                      >
                        <Icon className='h-5 w-5' />
                      </div>
                      <div className='space-y-2'>
                        <CardTitle className='text-lg'>{group.section}</CardTitle>
                        <CardDescription className='max-w-xl'>{meta.description}</CardDescription>
                      </div>
                    </div>
                    <Badge variant='outline' className='bg-background/70'>
                      {meta.audience}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className='space-y-2'>
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={getVariantHref(item.href, variant)}
                      className='hover:bg-muted flex items-start justify-between gap-3 rounded-2xl border border-border/70 px-4 py-3 transition-colors'
                    >
                      <div>
                        <p className='font-medium'>{item.title}</p>
                        <p className='text-muted-foreground mt-1 text-sm'>{item.description}</p>
                      </div>
                      <Icons.arrowRight className='text-muted-foreground mt-1 h-4 w-4 shrink-0' />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function DocsOverviewAside({ variant = 'public' }: { variant?: 'public' | 'dashboard' }) {
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Popular guides</CardTitle>
          <CardDescription>Start here if you want the shortest path to value.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          <Button variant='outline' asChild className='w-full justify-start'>
            <Link href={getVariantHref('/docs/getting-started/5-minute-quickstart', variant)}>
              5-Minute Quickstart
            </Link>
          </Button>
          <Button variant='outline' asChild className='w-full justify-start'>
            <Link href={getVariantHref('/docs/getting-started/install-cli', variant)}>
              Install the CLI
            </Link>
          </Button>
          <Button variant='outline' asChild className='w-full justify-start'>
            <Link href={getVariantHref('/docs/admin/workspace-setup', variant)}>
              Workspace Setup
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Need help?</CardTitle>
          <CardDescription>
            Use the troubleshooting path when auth, setup, or diagnostics feel off.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          <Button variant='outline' asChild className='w-full justify-start'>
            <Link href={getVariantHref('/docs/troubleshooting/auth-and-doctor', variant)}>
              Auth and doctor
            </Link>
          </Button>
          <Button variant='ghost' asChild className='w-full justify-start'>
            <Link href={getVariantHref('/docs/security/privacy-and-redaction', variant)}>
              Privacy and redaction
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
