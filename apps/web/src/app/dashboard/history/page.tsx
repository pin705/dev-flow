import PageContainer from '@/components/layout/page-container';
import { historyInfoContent } from '@/config/infoconfig';
import { HistoryPageContent } from '@/features/control-plane/components/history-page';
import { requireWorkspaceAccess } from '@/features/control-plane/server/access';
import { listReviewSessions } from '@/features/control-plane/server/service';

export default async function HistoryPage() {
  await requireWorkspaceAccess();

  const reviewSessions = await listReviewSessions();

  return (
    <PageContainer
      pageTitle='Review History'
      pageDescription='Search synced review sessions by trace ID, provider, source, and policy version.'
      infoContent={historyInfoContent}
    >
      <HistoryPageContent reviewSessions={reviewSessions} />
    </PageContainer>
  );
}
