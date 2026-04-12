import { getDocBySlug, getDocsNavigation } from '@devflow/docs-content';
import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { DocsShell } from '@/components/docs/docs-shell';
import { DocMdx } from '@/components/docs/mdx';
import { WorkspaceDocLinks } from '@/components/docs/workspace-doc-links';
import { docsCenterInfoContent } from '@/config/infoconfig';

export default async function DashboardDocsPage({
  params
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const doc = getDocBySlug(slug);

  if (!doc) {
    notFound();
  }

  return (
    <PageContainer
      scrollable
      pageTitle='Docs Center'
      pageDescription='Canonical onboarding, product concepts, CLI reference, and admin rollout guidance.'
      infoContent={docsCenterInfoContent}
    >
      <DocsShell
        currentHref={`/dashboard${doc.href}`}
        navigation={getDocsNavigation()}
        title={doc.title}
        description={doc.description}
        aside={<WorkspaceDocLinks />}
        variant='dashboard'
      >
        <DocMdx source={doc.body} />
      </DocsShell>
    </PageContainer>
  );
}
