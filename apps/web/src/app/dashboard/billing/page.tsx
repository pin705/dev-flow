import PageContainer from '@/components/layout/page-container';
import { billingInfoContent } from '@/config/infoconfig';
import { BillingPageContent } from '@/features/control-plane/components/billing-page';
import { requireWorkspaceAccess } from '@/features/control-plane/server/access';
import { getBillingWorkspaceSnapshot } from '@/features/control-plane/server/service';
import { PolarBillingAdapter } from '@/lib/billing/polar-billing-adapter';

export default async function BillingPage() {
  const { orgId } = await requireWorkspaceAccess();
  const adapter = new PolarBillingAdapter();
  const billingSnapshot = await getBillingWorkspaceSnapshot({
    workspaceId: orgId
  });
  const summary = await adapter.getWorkspaceSummary({
    workspaceId: orgId,
    customerExternalId: orgId,
    workspaceName: billingSnapshot.workspaceName,
    planKey: billingSnapshot.planKey,
    subscriptionStatus: billingSnapshot.subscriptionStatus,
    seatsUsed: billingSnapshot.seatsUsed,
    seatLimit: billingSnapshot.seatLimit,
    creditsIncluded: billingSnapshot.creditsIncluded,
    creditsRemaining: billingSnapshot.creditsRemaining,
    spendCapUsd: billingSnapshot.spendCapUsd,
    polarCustomerId: billingSnapshot.customerId
  });

  return (
    <PageContainer
      infoContent={billingInfoContent}
      pageTitle='Billing & Quota'
      pageDescription='Manage Polar plans, workspace seats, included credits, and customer portal access.'
    >
      <BillingPageContent summary={summary} />
    </PageContainer>
  );
}
