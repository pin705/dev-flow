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
import { reviewSessions } from '../data';

export function HistoryPageContent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review history</CardTitle>
        <CardDescription>
          Search synced sessions by trace ID, provider, command source, and policy version.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trace ID</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Policy</TableHead>
              <TableHead>Severities</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviewSessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className='font-medium'>{session.traceId}</TableCell>
                <TableCell>
                  {session.commandSource} / {session.source}
                </TableCell>
                <TableCell>{session.provider}</TableCell>
                <TableCell>{session.policyVersionId}</TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-2'>
                    {Object.entries(session.severityCounts)
                      .filter(([, count]) => count > 0)
                      .map(([severity, count]) => (
                        <Badge key={severity} variant='outline'>
                          {severity}: {count}
                        </Badge>
                      ))}
                  </div>
                </TableCell>
                <TableCell>{session.durationMs} ms</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
