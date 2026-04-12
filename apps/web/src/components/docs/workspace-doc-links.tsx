import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const dashboardLinks = [
  { title: 'Providers', href: '/dashboard/providers' },
  { title: 'Policies', href: '/dashboard/policies' },
  { title: 'Billing', href: '/dashboard/billing' },
  { title: 'History', href: '/dashboard/history' },
  { title: 'Audit', href: '/dashboard/audit' }
];

export function WorkspaceDocLinks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Workspace shortcuts</CardTitle>
        <CardDescription>Jump from docs into the active control-plane surfaces.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-2'>
        {dashboardLinks.map((link) => (
          <Button key={link.href} variant='outline' asChild className='w-full justify-start'>
            <Link href={link.href}>{link.title}</Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
