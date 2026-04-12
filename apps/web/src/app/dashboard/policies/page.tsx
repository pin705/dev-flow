import PageContainer from '@/components/layout/page-container';
import { policiesInfoContent } from '@/config/infoconfig';
import { PoliciesPageContent } from '@/features/control-plane/components/policies-page';

export default function PoliciesPage() {
  return (
    <PageContainer
      pageTitle='Policies'
      pageDescription='Versioned review rules, required checklists, and governance defaults for the workspace.'
      infoContent={policiesInfoContent}
    >
      <PoliciesPageContent />
    </PageContainer>
  );
}
