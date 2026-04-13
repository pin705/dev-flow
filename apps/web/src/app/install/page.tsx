import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Icons } from '@/components/icons';

interface InstallStep {
  command?: string;
  label: string;
}

export const metadata: Metadata = {
  title: 'Install'
};

const installCards = [
  {
    title: 'CLI',
    description:
      'Use Diffmint from the terminal for login, review, explain, tests, history, and doctor.',
    steps: [
      { label: 'Install dependencies', command: 'pnpm install' },
      {
        label: 'Sign in and approve the device flow in your browser',
        command: 'dm auth login'
      },
      { label: 'Check local setup and runtime health', command: 'dm doctor' }
    ] satisfies InstallStep[]
  },
  {
    title: 'VS Code',
    description: 'Install the editor companion after the CLI so it can invoke the local binary.',
    steps: [
      { label: 'Install the extension' },
      { label: 'Sign in from the extension' },
      { label: 'Run Review Current Changes from the command palette' }
    ] satisfies InstallStep[]
  },
  {
    title: 'Docker dev stack',
    description: 'Boot the web app and Postgres together with hot reload for local development.',
    steps: [
      { label: 'Start the local stack', command: 'pnpm docker:dev' },
      { label: 'Open the app at localhost:3000' },
      { label: 'Stop containers when you are done', command: 'pnpm docker:dev:down' }
    ] satisfies InstallStep[]
  }
];

export default function InstallPage() {
  return (
    <main className='mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12'>
      <div className='max-w-3xl space-y-4'>
        <p className='text-primary text-sm font-medium uppercase tracking-[0.24em]'>Install</p>
        <h1 className='text-4xl font-semibold tracking-tight'>Set up Diffmint end to end.</h1>
        <p className='text-muted-foreground text-lg'>
          Start with the CLI, add the VS Code extension, then finish the workspace rollout from the
          control plane.
        </p>
      </div>
      <div className='grid gap-4 lg:grid-cols-3'>
        {installCards.map((card) => (
          <Card
            key={card.title}
            className='rounded-[1.75rem] border-border/70 bg-background/82 shadow-sm'
          >
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              {card.steps.map((step) => (
                <div
                  key={step.label}
                  className='rounded-[1.25rem] border border-border/70 bg-background/70 p-3'
                >
                  <p className='text-foreground text-sm font-medium'>{step.label}</p>
                  {step.command ? (
                    <div className='mt-3 flex items-center gap-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-3'>
                      <Icons.code className='text-muted-foreground h-4 w-4 shrink-0' />
                      <code className='min-w-0 flex-1 overflow-x-auto font-mono text-xs sm:text-sm'>
                        {step.command}
                      </code>
                      <CopyButton text={step.command} />
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className='flex flex-wrap gap-3'>
        <Button asChild>
          <Link href='/docs/getting-started/install-cli'>Open CLI Install Guide</Link>
        </Button>
        <Button variant='outline' asChild>
          <Link href='/docs/getting-started/install-vscode-extension'>Open VS Code Guide</Link>
        </Button>
        <Button variant='outline' asChild>
          <Link href='/docs/getting-started/docker-development'>Open Docker Dev Guide</Link>
        </Button>
      </div>
    </main>
  );
}
