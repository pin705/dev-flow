import PageContainer from '@/components/layout/page-container';
import { overviewInfoContent } from '@/config/infoconfig';
import { ControlPlaneOverviewPage } from '@/features/control-plane/components/overview-page';
import { requireWorkspaceAccess } from '@/features/control-plane/server/access';
import {
  getOverviewStats,
  listPolicies,
  listProviders,
  listReviewSessions
} from '@/features/control-plane/server/service';

export default async function OverviewPage() {
  const { orgId } = await requireWorkspaceAccess();

  const [overviewStats, policyBundles, providerSummaries, reviewSessions] = await Promise.all([
    getOverviewStats(orgId),
    listPolicies(orgId),
    listProviders(orgId),
    listReviewSessions(orgId)
  ]);

  return (
    <PageContainer
      pageTitle='Workspace Overview'
      pageDescription='CLI and VS Code stay primary. This dashboard manages policies, providers, Polar billing, history, audit, and docs.'
      infoContent={overviewInfoContent}
    >
      <ControlPlaneOverviewPage
        overviewStats={overviewStats}
        policyBundles={policyBundles}
        providerSummaries={providerSummaries}
        reviewSessions={reviewSessions}
      />
    </PageContainer>
  );
}
