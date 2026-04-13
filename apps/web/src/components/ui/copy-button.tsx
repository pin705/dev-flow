'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  className?: string;
  copiedLabel?: string;
  copyLabel?: string;
  text: string;
}

export function CopyButton({
  className,
  copiedLabel = 'Copied',
  copyLabel = 'Copy',
  text
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      toast.error('Unable to copy');
    }
  }

  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      onClick={handleCopy}
      className={cn(
        'text-muted-foreground hover:text-foreground h-8 rounded-full border border-border/70 bg-background/70 px-2.5 shadow-sm backdrop-blur',
        className
      )}
      aria-label={copied ? copiedLabel : copyLabel}
    >
      {copied ? <Icons.check className='h-3.5 w-3.5' /> : <Icons.forms className='h-3.5 w-3.5' />}
      <span className='text-xs'>{copied ? copiedLabel : copyLabel}</span>
    </Button>
  );
}
