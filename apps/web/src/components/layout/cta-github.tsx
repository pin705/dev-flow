import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import Link from 'next/link';

export default function CtaGithub() {
  return (
    <Button variant='ghost' asChild size='sm' className='group hidden sm:flex'>
      <Link
        href='/docs/getting-started/5-minute-quickstart'
        className='dark:text-foreground transition-colors duration-300'
      >
        <Icons.page className='transition-transform duration-300 group-hover:-translate-y-0.5' />
      </Link>
    </Button>
  );
}
