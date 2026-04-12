import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Install'
};

const installCards = [
  {
    title: 'CLI',
    description:
      'Use Devflow from the terminal for login, review, explain, tests, history, and doctor.',
    steps: [
      'Run `pnpm install`',
      'Run `devflow auth login` and approve the device in your browser',
      'Run `devflow doctor`'
    ]
  },
  {
    title: 'VS Code',
    description: 'Install the editor companion after the CLI so it can invoke the local binary.',
    steps: ['Install the extension', 'Sign in', 'Run Review Current Changes']
  },
  {
    title: 'Docker dev stack',
    description: 'Boot the web app and Postgres together with hot reload for local development.',
    steps: ['Run `pnpm docker:dev`', 'Open `localhost:3000`', 'Stop with `pnpm docker:dev:down`']
  }
];

export default function InstallPage() {
  return (
    <main className='mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12'>
      <div className='max-w-3xl space-y-4'>
        <p className='text-primary text-sm font-medium uppercase tracking-[0.24em]'>Install</p>
        <h1 className='text-4xl font-semibold tracking-tight'>Set up Devflow end to end.</h1>
        <p className='text-muted-foreground text-lg'>
          Start with the CLI, add the VS Code extension, then finish the workspace rollout from the
          control plane.
        </p>
      </div>
      <div className='grid gap-4 lg:grid-cols-3'>
        {installCards.map((card) => (
          <Card key={card.title}>
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              {card.steps.map((step) => (
                <div key={step} className='rounded-lg border px-3 py-2'>
                  {step}
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
