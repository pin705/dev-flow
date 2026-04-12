import PageContainer from '@/components/layout/page-container';
import { providersInfoContent } from '@/config/infoconfig';
import { ProvidersPageContent } from '@/features/control-plane/components/providers-page';

export default function ProvidersPage() {
  return (
    <PageContainer
      pageTitle='Providers'
      pageDescription='Configure managed and BYOK providers, default models, fallbacks, and rate limits.'
      infoContent={providersInfoContent}
    >
      <ProvidersPageContent />
    </PageContainer>
  );
}
