import { BrandLink } from '@/components/brand-logo';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { getServerAuthContext } from '@/lib/clerk/server-auth';
import { siteConfig } from '@/lib/site';
import Link from 'next/link';
import Script from 'next/script';

const heroBullets = [
  'Run review before the PR exists',
  'Keep local workflow primary',
  'Use the web app for policy, docs, billing, and history'
];

const terminalLines = [
  '$ dm auth login',
  'Opened device flow in your browser',
  '$ dm review --base origin/main',
  '3 findings · 1 policy note · 1 missing test'
];

const findings = [
  {
    file: 'src/auth/device-flow.ts',
    level: 'High',
    detail: 'Session refresh does not extend TTL after approval.'
  },
  {
    file: 'src/lib/redaction.ts',
    level: 'Policy',
    detail: 'Sensitive payload shaping runs too late in the sync path.'
  },
  {
    file: 'packages/docs-content',
    level: 'Process',
    detail: 'CLI copy changed without a matching changelog entry.'
  }
];

const surfaces = [
  {
    title: 'CLI',
    description: 'Review the diff where the work happens.',
    icon: Icons.code
  },
  {
    title: 'VS Code',
    description: 'Trigger local review without leaving the editor.',
    icon: Icons.panelLeft
  },
  {
    title: 'Control plane',
    description: 'Manage providers, policies, billing, history, and docs.',
    icon: Icons.workspace
  }
];

const steps = [
  {
    step: '01',
    title: 'Install',
    detail: 'Set up the CLI once and keep the loop local.'
  },
  {
    step: '02',
    title: 'Review',
    detail: 'Run against staged files or a base branch.'
  },
  {
    step: '03',
    title: 'Operate',
    detail: 'Sync the result into policy, billing, docs, and audit.'
  }
];

export default async function HomePage() {
  const { userId } = await getServerAuthContext();
  const dashboardHref = userId ? '/dashboard/overview' : '/auth/sign-in';

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteConfig.name,
      url: siteConfig.url,
      description: siteConfig.description
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: siteConfig.name,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'macOS, Windows, Linux',
      url: siteConfig.url,
      description: siteConfig.description,
      featureList: [
        'CLI-first code review',
        'VS Code review companion',
        'Workspace policy enforcement',
        'Audit logs and synced history',
        'Provider and billing controls'
      ]
    }
  ];

  return (
    <main className='relative min-h-screen overflow-hidden'>
      <Script id='home-structured-data' type='application/ld+json'>
        {JSON.stringify(structuredData)}
      </Script>

      <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_28%),linear-gradient(180deg,var(--background),color-mix(in_oklab,var(--muted)_18%,transparent))]' />
      <div className='absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_40%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_40%,transparent)_1px,transparent_1px)] bg-[size:44px_44px] opacity-20' />

      <div className='relative mx-auto flex min-h-screen max-w-[1380px] flex-col px-4 py-4 sm:px-6 lg:px-8'>
        <header className='sticky top-0 z-30 mb-8 rounded-[1.75rem] border border-border/70 bg-background/80 shadow-sm backdrop-blur-xl'>
          <div className='flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
            <BrandLink
              priority
              size={44}
              className='gap-3.5'
              imageClassName='rounded-2xl'
              labelClassName='text-lg font-semibold'
            />
            <div className='flex flex-wrap items-center gap-2'>
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
          </div>
        </header>

        <section className='grid gap-8 pb-14 lg:grid-cols-[1.02fr_0.98fr] lg:items-center'>
          <div className='space-y-7'>
            <div className='space-y-4'>
              <Badge variant='outline' className='rounded-full bg-background/80 px-4 py-1.5'>
                Terminal-first code review
              </Badge>
              <h1 className='max-w-5xl font-serif text-5xl leading-[0.96] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl'>
                Review locally.
                <br />
                Operate centrally.
              </h1>
              <p className='text-muted-foreground max-w-2xl text-lg leading-8 sm:text-xl'>
                Diffmint keeps developers in the CLI and VS Code, then gives operators one place for
                policy, docs, billing, history, and audit.
              </p>
            </div>

            <div className='flex flex-wrap gap-3'>
              <Button size='lg' asChild>
                <Link href='/install'>
                  Install Diffmint
                  <Icons.arrowRight className='ml-2 h-4 w-4' />
                </Link>
              </Button>
              <Button size='lg' variant='outline' asChild>
                <Link href='/docs/getting-started/5-minute-quickstart'>Start the quickstart</Link>
              </Button>
            </div>

            <div className='grid gap-3 sm:grid-cols-3'>
              {heroBullets.map((item) => (
                <div
                  key={item}
                  className='rounded-[1.35rem] border border-border/70 bg-background/72 px-4 py-4 text-sm shadow-sm'
                >
                  <div className='mb-2 flex items-center gap-2'>
                    <span className='bg-primary h-2 w-2 rounded-full' />
                    <span className='font-medium'>Core promise</span>
                  </div>
                  <p className='text-muted-foreground leading-6'>{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className='rounded-[2rem] border border-white/10 bg-[#0a0f1b] p-4 text-white shadow-2xl sm:p-5'>
            <div className='mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-4'>
              <div className='flex items-center gap-2'>
                <span className='h-2.5 w-2.5 rounded-full bg-white/90' />
                <span className='h-2.5 w-2.5 rounded-full bg-white/35' />
                <span className='h-2.5 w-2.5 rounded-full bg-emerald-400' />
              </div>
              <div className='flex items-center gap-2'>
                <span className='rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-white/70'>
                  local review
                </span>
                <CopyButton
                  text='dm review --base origin/main'
                  className='border-white/10 bg-white/8 text-white hover:bg-white/14'
                />
              </div>
            </div>

            <div className='space-y-4 font-mono text-sm'>
              <div className='space-y-2 rounded-[1.35rem] border border-white/10 bg-black/25 px-4 py-4'>
                {terminalLines.map((line, index) => (
                  <div
                    key={line}
                    className={
                      index < 2 ? 'text-white/92' : index === 2 ? 'text-cyan-300' : 'text-white/55'
                    }
                  >
                    {line}
                  </div>
                ))}
              </div>

              <div className='overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.04]'>
                <div className='grid grid-cols-[minmax(0,1fr)_80px] gap-3 border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/45'>
                  <span>File</span>
                  <span>Level</span>
                </div>
                <div className='divide-y divide-white/10'>
                  {findings.map((item) => (
                    <div
                      key={item.file}
                      className='grid grid-cols-[minmax(0,1fr)_80px] gap-3 px-4 py-4'
                    >
                      <div className='min-w-0'>
                        <p className='truncate text-white/92'>{item.file}</p>
                        <p className='mt-1 text-xs leading-6 text-white/55'>{item.detail}</p>
                      </div>
                      <div className='pt-0.5 text-right text-xs text-white/72'>{item.level}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className='flex items-center justify-between rounded-[1.1rem] border border-dashed border-white/10 px-4 py-3 text-xs text-white/55'>
                <span>policy: secure-web-v12</span>
                <span>sync: workspace/history</span>
              </div>
            </div>
          </div>
        </section>

        <section className='grid gap-4 border-y border-border/70 py-7 md:grid-cols-3'>
          {surfaces.map((surface) => {
            const Icon = surface.icon;

            return (
              <Card
                key={surface.title}
                className='rounded-[1.6rem] border-border/70 bg-background/80 shadow-sm'
              >
                <CardHeader className='space-y-4'>
                  <span className='bg-primary/10 text-primary inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70'>
                    <Icon className='h-5 w-5' />
                  </span>
                  <div className='space-y-2'>
                    <CardTitle className='text-2xl tracking-tight'>{surface.title}</CardTitle>
                    <CardDescription className='text-sm leading-7'>
                      {surface.description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </section>

        <section className='space-y-6 py-16'>
          <div className='max-w-2xl space-y-3'>
            <Badge variant='outline' className='rounded-full bg-background/80 px-3 py-1'>
              Workflow
            </Badge>
            <h2 className='text-3xl font-semibold tracking-tight text-balance sm:text-4xl'>
              Short loop for developers. Clear surface for operators.
            </h2>
          </div>

          <div className='grid gap-4 md:grid-cols-3'>
            {steps.map((item) => (
              <Card
                key={item.step}
                className='rounded-[1.6rem] border-border/70 bg-background/78 shadow-sm'
              >
                <CardHeader className='space-y-4'>
                  <div className='flex items-center justify-between gap-3'>
                    <Badge variant='secondary' className='rounded-full px-3 py-1'>
                      Step {item.step}
                    </Badge>
                    <Icons.arrowRight className='text-muted-foreground h-4 w-4' />
                  </div>
                  <div className='space-y-2'>
                    <CardTitle className='text-xl tracking-tight'>{item.title}</CardTitle>
                    <CardDescription className='leading-7'>{item.detail}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className='pb-16'>
          <Card className='rounded-[2rem] border-primary/20 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.1),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_30%),linear-gradient(180deg,color-mix(in_oklab,var(--background)_92%,transparent),color-mix(in_oklab,var(--muted)_24%,transparent))] shadow-sm'>
            <CardContent className='flex flex-col gap-6 p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10'>
              <div className='max-w-2xl space-y-3'>
                <Badge variant='outline' className='rounded-full bg-background/80 px-3 py-1'>
                  Ready to try it
                </Badge>
                <h2 className='text-3xl font-semibold tracking-tight text-balance sm:text-4xl'>
                  Start with the CLI, then add policy and audit when the team needs them.
                </h2>
                <p className='text-muted-foreground text-base leading-8'>
                  {siteConfig.name} is for teams that want local speed without giving up operator
                  clarity once the workflow becomes shared.
                </p>
              </div>

              <div className='flex flex-wrap gap-3'>
                <Button size='lg' asChild>
                  <Link href='/install'>Install `dm`</Link>
                </Button>
                <Button size='lg' variant='outline' asChild>
                  <Link href='/docs'>Read docs</Link>
                </Button>
                <Button size='lg' variant='ghost' asChild>
                  <Link href={dashboardHref}>{userId ? 'Open Dashboard' : 'Sign In'}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
