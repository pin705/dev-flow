import PageContainer from '@/components/layout/page-container';
import { providersInfoContent } from '@/config/infoconfig';
import { ProvidersPageContent } from '@/features/control-plane/components/providers-page';
import { requireWorkspaceAccess } from '@/features/control-plane/server/access';
import { listProviders } from '@/features/control-plane/server/service';

export default async function ProvidersPage() {
  const { orgId } = await requireWorkspaceAccess();

  const providerSummaries = await listProviders(orgId);

  return (
    <PageContainer
      pageTitle='Providers'
      pageDescription='Configure managed and BYOK providers, default models, fallbacks, and rate limits.'
      infoContent={providersInfoContent}
    >
      <ProvidersPageContent providerSummaries={providerSummaries} />
    </PageContainer>
  );
}
