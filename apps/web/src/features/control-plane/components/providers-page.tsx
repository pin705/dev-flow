import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { ProviderConfigSummary } from '@diffmint/contracts';

interface ProvidersPageContentProps {
  providerSummaries: ProviderConfigSummary[];
}

export function ProvidersPageContent({ providerSummaries }: ProvidersPageContentProps) {
  return (
    <div className='space-y-6'>
      {providerSummaries.length === 0 ? (
        <Card>
          <CardContent className='text-muted-foreground px-6 py-6 text-sm'>
            No provider configuration has been stored for this workspace yet.
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-4 lg:grid-cols-2'>
          {providerSummaries.map((provider) => (
            <Card key={provider.id}>
              <CardHeader>
                <CardTitle className='capitalize'>{provider.provider}</CardTitle>
                <CardDescription>
                  {provider.mode === 'managed'
                    ? 'Managed by the Diffmint platform'
                    : 'User-supplied local credentials. Diffmint does not store the provider key.'}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3 text-sm'>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground'>Default model</span>
                  <Badge>{provider.defaultModel}</Badge>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground'>Fallback</span>
                  <span>{provider.fallbackProvider ?? 'None'}</span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground'>Rate limit</span>
                  <span>
                    {provider.rateLimitPerMinute
                      ? `${provider.rateLimitPerMinute}/min`
                      : 'User-controlled'}
                  </span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground'>Secret handling</span>
                  <span>
                    {provider.encrypted ? 'Encrypted at rest' : 'Kept on the user machine only'}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Allowed model matrix</CardTitle>
          <CardDescription>
            Keep supported local providers and model families explicit before broader rollout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providerSummaries.length === 0 ? (
            <div className='text-muted-foreground rounded-2xl border px-4 py-3 text-sm'>
              The model matrix will appear here after a provider configuration is saved.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Allowed models</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerSummaries.map((provider) => (
                  <TableRow key={provider.id}>
                    <TableCell className='capitalize'>{provider.provider}</TableCell>
                    <TableCell>{provider.mode}</TableCell>
                    <TableCell className='max-w-md whitespace-normal'>
                      {provider.allowedModels.join(', ')}
                    </TableCell>
                    <TableCell>{provider.updatedAt.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
