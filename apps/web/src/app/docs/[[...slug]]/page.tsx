import type { Metadata } from 'next';
import { getAllDocs, getDocBySlug, getDocsNavigation, getRelatedDocs } from '@devflow/docs-content';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocsShell } from '@/components/docs/docs-shell';
import { DocMdx } from '@/components/docs/mdx';

export async function generateStaticParams() {
  return getAllDocs().map((doc) => ({
    slug: doc.slugSegments
  }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocBySlug(slug);

  if (!doc) {
    return {
      title: 'Docs'
    };
  }

  return {
    title: doc.title,
    description: doc.description
  };
}

export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const doc = getDocBySlug(slug);

  if (!doc) {
    notFound();
  }

  const relatedDocs = getRelatedDocs(doc);

  return (
    <main className='mx-auto min-h-screen max-w-7xl px-6 py-10'>
      <div className='mb-8 flex items-center justify-between gap-4'>
        <Link href='/' className='text-lg font-semibold'>
          Devflow
        </Link>
        <div className='flex items-center gap-2'>
          <Button variant='ghost' asChild>
            <Link href='/install'>Install</Link>
          </Button>
          <Button asChild>
            <Link href='/auth/sign-in'>Sign In</Link>
          </Button>
        </div>
      </div>
      <DocsShell
        currentHref={doc.href}
        navigation={getDocsNavigation()}
        title={doc.title}
        description={doc.description}
        aside={
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Related docs</CardTitle>
              <CardDescription>Continue the setup without losing context.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {relatedDocs.map((item) => (
                <Button key={item.href} variant='outline' asChild className='w-full justify-start'>
                  <Link href={item.href}>{item.title}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        }
      >
        <DocMdx source={doc.body} />
      </DocsShell>
    </main>
  );
}
