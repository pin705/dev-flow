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
import { overviewStats, policyBundles, providerSummaries, reviewSessions } from '../data';

export function ControlPlaneOverviewPage() {
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
          </CardContent>
        </Card>

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
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Provider posture</CardTitle>
            <CardDescription>
              Managed and BYOK strategies can coexist within the same workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {providerSummaries.map((provider) => (
              <div key={provider.id} className='rounded-2xl border px-4 py-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='font-medium capitalize'>{provider.provider}</p>
                    <p className='text-muted-foreground text-sm'>
                      {provider.mode} · default model {provider.defaultModel}
                    </p>
                  </div>
                  <Badge variant='outline'>{provider.rateLimitPerMinute}/min</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Policy posture</CardTitle>
            <CardDescription>
              Policy versioning is what makes Devflow different from a generic code assistant.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {policyBundles.map((policy) => (
              <div key={policy.policyVersionId} className='rounded-2xl border px-4 py-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='font-medium'>{policy.name}</p>
                    <p className='text-muted-foreground text-sm'>{policy.summary}</p>
                  </div>
                  <Badge>{policy.version}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
