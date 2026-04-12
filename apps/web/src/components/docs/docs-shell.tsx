import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { DocsNavGroup } from '@devflow/docs-content';
import type { ReactNode } from 'react';

interface DocsShellProps {
  currentHref: string;
  navigation: DocsNavGroup[];
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
  variant?: 'public' | 'dashboard';
}

export function DocsShell({
  currentHref,
  navigation,
  title,
  description,
  children,
  aside,
  variant = 'public'
}: DocsShellProps) {
  return (
    <div className='grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)_240px]'>
      <aside className='hidden lg:block'>
        <div className='sticky top-24 rounded-3xl border bg-card/70 p-4 backdrop-blur'>
          <div className='mb-4'>
            <p className='text-sm font-semibold'>Docs</p>
            <p className='text-muted-foreground mt-1 text-sm'>Canonical product guidance</p>
          </div>
          <nav className='space-y-5'>
            {navigation.map((group) => (
              <div key={group.section} className='space-y-2'>
                <p className='text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase'>
                  {group.section}
                </p>
                <div className='space-y-1'>
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={
                        variant === 'dashboard'
                          ? item.href.replace('/docs/', '/dashboard/docs/')
                          : item.href
                      }
                      className={cn(
                        'block rounded-xl px-3 py-2 text-sm transition-colors',
                        currentHref.endsWith(item.href)
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {item.title}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <article className='min-w-0'>
        <div className='mb-8 space-y-3'>
          <p className='text-primary text-sm font-medium uppercase tracking-[0.24em]'>
            {variant === 'dashboard' ? 'Docs Center' : 'Documentation'}
          </p>
          <h1 className='text-4xl font-semibold tracking-tight text-balance'>{title}</h1>
          <p className='text-muted-foreground max-w-3xl text-lg leading-8'>{description}</p>
        </div>
        <div className='rounded-[2rem] border bg-background/80 px-6 py-8 shadow-sm sm:px-8'>
          {children}
        </div>
      </article>

      <aside className='hidden lg:block'>
        <div className='sticky top-24 space-y-4'>{aside}</div>
      </aside>
    </div>
  );
}
