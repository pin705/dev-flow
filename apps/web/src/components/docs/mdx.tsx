import Link from 'next/link';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { Children, isValidElement, type HTMLAttributes, type ReactNode } from 'react';
import { Icons } from '@/components/icons';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';
import { slugifyDocHeading } from '@diffmint/docs-content';

function getPlainText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }

      if (isValidElement<{ children?: ReactNode }>(child)) {
        return getPlainText(child.props.children);
      }

      return '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCodeText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }

      if (isValidElement<{ children?: ReactNode }>(child)) {
        return getCodeText(child.props.children);
      }

      return '';
    })
    .join('');
}

function createHeadingIdGetter() {
  const counts = new Map<string, number>();

  return (children: ReactNode): string | undefined => {
    const text = getPlainText(children);
    const baseId = slugifyDocHeading(text);

    if (!baseId) {
      return undefined;
    }

    const nextCount = (counts.get(baseId) ?? 0) + 1;
    counts.set(baseId, nextCount);

    return nextCount === 1 ? baseId : `${baseId}-${nextCount}`;
  };
}

function MdxLink({ href = '', children }: { href?: string; children?: ReactNode }) {
  const className =
    'text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:text-primary';

  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} target='_blank' rel='noreferrer' className={cn(className, 'inline-flex gap-1')}>
      <span>{children}</span>
      <Icons.externalLink className='mt-1 h-3.5 w-3.5 shrink-0' />
    </a>
  );
}

function MdxHeading({
  as: Component,
  getHeadingId,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & {
  as: 'h1' | 'h2' | 'h3' | 'h4';
  getHeadingId: (children: ReactNode) => string | undefined;
}) {
  const id = getHeadingId(children);

  return (
    <Component id={id} className={className} {...props}>
      {children}
    </Component>
  );
}

export async function DocMdx({ source }: { source: string }) {
  const getHeadingId = createHeadingIdGetter();

  const components = {
    a: MdxLink,
    h1: (props: HTMLAttributes<HTMLHeadingElement>) => (
      <MdxHeading
        as='h1'
        getHeadingId={getHeadingId}
        className='font-serif text-4xl leading-tight font-semibold tracking-[-0.02em] text-balance text-foreground sm:text-5xl'
        {...props}
      />
    ),
    h2: (props: HTMLAttributes<HTMLHeadingElement>) => (
      <MdxHeading
        as='h2'
        getHeadingId={getHeadingId}
        className='group scroll-mt-28 border-border/70 mt-14 border-t pt-8 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.9rem]'
        {...props}
      />
    ),
    h3: (props: HTMLAttributes<HTMLHeadingElement>) => (
      <MdxHeading
        as='h3'
        getHeadingId={getHeadingId}
        className='group scroll-mt-28 mt-10 text-xl font-semibold tracking-tight text-foreground'
        {...props}
      />
    ),
    h4: (props: HTMLAttributes<HTMLHeadingElement>) => (
      <MdxHeading
        as='h4'
        getHeadingId={getHeadingId}
        className='group scroll-mt-28 mt-8 text-lg font-semibold tracking-tight text-foreground'
        {...props}
      />
    ),
    p: (props: HTMLAttributes<HTMLParagraphElement>) => (
      <p className='text-foreground/78 mt-5 text-[1.02rem] leading-8' {...props} />
    ),
    ul: (props: HTMLAttributes<HTMLUListElement>) => (
      <ul className='text-foreground/78 mt-5 space-y-3 pl-5 marker:text-primary' {...props} />
    ),
    ol: (props: HTMLAttributes<HTMLOListElement>) => (
      <ol className='text-foreground/78 mt-5 space-y-3 pl-5 marker:text-primary' {...props} />
    ),
    li: (props: HTMLAttributes<HTMLLIElement>) => <li className='pl-1 leading-8' {...props} />,
    strong: (props: HTMLAttributes<HTMLElement>) => (
      <strong className='font-semibold text-foreground' {...props} />
    ),
    blockquote: (props: HTMLAttributes<HTMLQuoteElement>) => (
      <blockquote
        className='mt-8 rounded-[1.6rem] border border-border/70 bg-muted/35 px-5 py-5 text-[1.02rem] italic text-foreground shadow-sm'
        {...props}
      />
    ),
    code: ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
      <code
        className={cn(
          'rounded-md border border-border/70 bg-muted/55 px-1.5 py-0.5 font-mono text-[0.92em] text-foreground',
          className
        )}
        {...props}
      />
    ),
    pre: ({ children, className, ...props }: HTMLAttributes<HTMLPreElement>) => {
      const codeText = getCodeText(children).trimEnd();

      return (
        <div className='relative mt-8'>
          {codeText ? <CopyButton text={codeText} className='absolute top-3 right-3 z-10' /> : null}
          <pre
            className={cn(
              'overflow-x-auto rounded-[1.6rem] border border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--card)_88%,transparent),color-mix(in_oklab,var(--muted)_26%,transparent))] px-5 py-5 pr-20 text-sm leading-7 shadow-sm [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0',
              className
            )}
            {...props}
          >
            {children}
          </pre>
        </div>
      );
    },
    table: (props: HTMLAttributes<HTMLTableElement>) => (
      <div className='mt-8 overflow-hidden rounded-[1.4rem] border border-border/70 shadow-sm'>
        <table className='w-full border-collapse bg-background/80 text-sm' {...props} />
      </div>
    ),
    thead: (props: HTMLAttributes<HTMLTableSectionElement>) => (
      <thead className='bg-muted/45' {...props} />
    ),
    th: (props: HTMLAttributes<HTMLTableCellElement>) => (
      <th
        className='border-border/70 border-b px-4 py-3 text-left font-semibold text-foreground'
        {...props}
      />
    ),
    td: (props: HTMLAttributes<HTMLTableCellElement>) => (
      <td className='border-border/60 border-t px-4 py-3 align-top text-foreground/78' {...props} />
    ),
    hr: () => (
      <div className='my-10 h-px bg-gradient-to-r from-transparent via-border to-transparent' />
    )
  };

  return (
    <article className='max-w-none [&_*]:scroll-mt-28'>
      <MDXRemote
        source={source}
        components={components}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkGfm]
          }
        }}
      />
    </article>
  );
}
