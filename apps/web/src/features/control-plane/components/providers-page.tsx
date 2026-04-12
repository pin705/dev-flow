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
import { providerSummaries } from '../data';

export function ProvidersPageContent() {
  return (
    <div className='space-y-6'>
      <div className='grid gap-4 lg:grid-cols-2'>
        {providerSummaries.map((provider) => (
          <Card key={provider.id}>
            <CardHeader>
              <CardTitle className='capitalize'>{provider.provider}</CardTitle>
              <CardDescription>
                {provider.mode === 'managed'
                  ? 'Managed by the Devflow platform'
                  : 'Workspace-supplied provider credentials'}
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
                <span>{provider.rateLimitPerMinute}/min</span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>Secret handling</span>
                <span>{provider.encrypted ? 'Encrypted at rest' : 'Unconfigured'}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Allowed model matrix</CardTitle>
          <CardDescription>
            Use workspace rules to keep supported providers and models explicit.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
