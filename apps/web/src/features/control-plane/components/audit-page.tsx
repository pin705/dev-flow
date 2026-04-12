import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { auditEvents } from '../data';

export function AuditPageContent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit trail</CardTitle>
        <CardDescription>
          Provider changes, policy publishes, and synced reviews should leave a searchable event.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditEvents.map((event) => (
              <TableRow key={event.id}>
                <TableCell className='font-medium'>{event.event}</TableCell>
                <TableCell>{event.actor}</TableCell>
                <TableCell>{event.target}</TableCell>
                <TableCell>{event.when}</TableCell>
                <TableCell className='max-w-md whitespace-normal text-sm'>{event.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
