import PageContainer from '@/components/layout/page-container';
import { policiesInfoContent } from '@/config/infoconfig';
import { PoliciesPageContent } from '@/features/control-plane/components/policies-page';
import { requireWorkspaceAccess } from '@/features/control-plane/server/access';
import { listPolicies } from '@/features/control-plane/server/service';

export default async function PoliciesPage() {
  await requireWorkspaceAccess();

  const policyBundles = await listPolicies();

  return (
    <PageContainer
      pageTitle='Policies'
      pageDescription='Versioned review rules, required checklists, and governance defaults for the workspace.'
      infoContent={policiesInfoContent}
    >
      <PoliciesPageContent policyBundles={policyBundles} />
    </PageContainer>
  );
}
