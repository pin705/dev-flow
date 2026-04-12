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
import { policyBundles } from '../data';

export function PoliciesPageContent() {
  const activePolicy = policyBundles[0];

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>Active policy version</CardTitle>
          <CardDescription>{activePolicy.summary}</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 lg:grid-cols-2'>
          <div className='space-y-3'>
            <p className='text-sm font-medium'>Checklist</p>
            {activePolicy.checklist.map((item) => (
              <div key={item.id} className='rounded-2xl border px-4 py-3'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='font-medium'>{item.title}</p>
                  <Badge variant={item.required ? 'default' : 'outline'}>
                    {item.required ? 'Required' : 'Optional'}
                  </Badge>
                </div>
                <p className='text-muted-foreground mt-1 text-sm'>{item.guidance}</p>
              </div>
            ))}
          </div>
          <div className='space-y-3'>
            <p className='text-sm font-medium'>Rules</p>
            {activePolicy.rules.map((rule) => (
              <div key={rule.id} className='rounded-2xl border px-4 py-3'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='font-medium'>{rule.title}</p>
                  <Badge variant='outline'>{rule.severity}</Badge>
                </div>
                <p className='text-muted-foreground mt-1 text-sm'>{rule.guidance}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Published versions</CardTitle>
          <CardDescription>
            Every synced review should carry the policy version used at review time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Checksum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policyBundles.map((policy) => (
                <TableRow key={policy.policyVersionId}>
                  <TableCell>{policy.name}</TableCell>
                  <TableCell>{policy.version}</TableCell>
                  <TableCell>{policy.publishedAt.slice(0, 10)}</TableCell>
                  <TableCell>{policy.checksum}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
