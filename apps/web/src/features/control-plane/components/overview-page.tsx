import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type {
  ClientInstallation,
  PolicyBundle,
  ProviderConfigSummary,
  ReviewSession
} from '@diffmint/contracts';
import type { OverviewStat } from '../server/service';

interface ControlPlaneOverviewPageProps {
  overviewStats: OverviewStat[];
  policyBundles: PolicyBundle[];
  providerSummaries: ProviderConfigSummary[];
  reviewSessions: ReviewSession[];
  clientInstallations: ClientInstallation[];
}

export function ControlPlaneOverviewPage({
  overviewStats,
  policyBundles,
  providerSummaries,
  reviewSessions,
  clientInstallations
}: ControlPlaneOverviewPageProps) {
  return (
    <div className='space-y-6'>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        {overviewStats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className='text-3xl'>{stat.value}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>{stat.helper}</CardContent>
          </Card>
        ))}
      </div>

      <div className='grid gap-4 xl:grid-cols-[1.2fr_0.8fr]'>
        <Card>
          <CardHeader>
            <CardTitle>Latest synced reviews</CardTitle>
            <CardDescription>
              History exists for governance and search. Review execution still belongs in CLI and VS
              Code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reviewSessions.length === 0 ? (
              <div className='text-muted-foreground rounded-2xl border px-4 py-3 text-sm'>
                No review history has synced yet. The first CLI or VS Code upload will appear here.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trace ID</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className='font-medium'>{session.traceId}</TableCell>
                      <TableCell>
                        {session.commandSource} / {session.source}
                      </TableCell>
                      <TableCell>{session.policyVersionId}</TableCell>
                      <TableCell className='max-w-md whitespace-normal text-sm'>
                        {session.summary}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle>Docs-first rollout</CardTitle>
              <CardDescription>
                The docs package should unlock self-serve onboarding for both developers and admins.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='rounded-2xl border px-4 py-3 text-sm'>
                Quickstart, install guides, admin setup, privacy, troubleshooting, and release
                channels are now part of the product surface.
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button asChild>
                  <Link href='/dashboard/docs'>Open Docs Center</Link>
                </Button>
                <Button variant='outline' asChild>
                  <Link href='/docs/getting-started/5-minute-quickstart'>Open Public Docs</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Connected clients</CardTitle>
              <CardDescription>
                Recent CLI and VS Code installations help release tracking and support triage.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {clientInstallations.length === 0 ? (
                <div className='text-muted-foreground rounded-2xl border px-4 py-3 text-sm'>
                  No client installations have synced yet. The first successful CLI or VS Code
                  sign-in will register a client version here.
                </div>
              ) : (
                clientInstallations.slice(0, 5).map((installation) => (
                  <div
                    key={installation.id}
                    className='flex items-center justify-between gap-3 rounded-2xl border px-4 py-3'
                  >
                    <div>
                      <p className='font-medium'>
                        {installation.clientType === 'cli' ? 'CLI' : 'VS Code'}{' '}
                        {installation.version}
                      </p>
                      <p className='text-muted-foreground text-sm'>{installation.platform}</p>
                    </div>
                    <Badge variant='outline'>{installation.channel}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Provider posture</CardTitle>
            <CardDescription>
              Market-test mode keeps provider auth on the user machine instead of storing API keys
              in Diffmint.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {providerSummaries.length === 0 ? (
              <div className='text-muted-foreground rounded-2xl border px-4 py-3 text-sm'>
                No provider configuration has been saved for this workspace yet.
              </div>
            ) : (
              providerSummaries.map((provider) => (
                <div key={provider.id} className='rounded-2xl border px-4 py-3'>
                  <div className='flex items-center justify-between gap-3'>
                    <div>
                      <p className='font-medium capitalize'>{provider.provider}</p>
                      <p className='text-muted-foreground text-sm'>
                        {provider.mode} · default model {provider.defaultModel}
                      </p>
                    </div>
                    <Badge variant='outline'>
                      {provider.rateLimitPerMinute ? `${provider.rateLimitPerMinute}/min` : 'BYOK'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Policy posture</CardTitle>
            <CardDescription>
              Policy versioning is what makes Diffmint different from a generic code assistant.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {policyBundles.length === 0 ? (
              <div className='text-muted-foreground rounded-2xl border px-4 py-3 text-sm'>
                No policy has been published for this workspace yet.
              </div>
            ) : (
              policyBundles.map((policy) => (
                <div key={policy.policyVersionId} className='rounded-2xl border px-4 py-3'>
                  <div className='flex items-center justify-between gap-3'>
                    <div>
                      <p className='font-medium'>{policy.name}</p>
                      <p className='text-muted-foreground text-sm'>{policy.summary}</p>
                    </div>
                    <Badge>{policy.version}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
