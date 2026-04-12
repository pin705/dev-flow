import PageContainer from '@/components/layout/page-container';
import { historyInfoContent } from '@/config/infoconfig';
import { HistoryPageContent } from '@/features/control-plane/components/history-page';

export default function HistoryPage() {
  return (
    <PageContainer
      pageTitle='Review History'
      pageDescription='Search synced review sessions by trace ID, provider, source, and policy version.'
      infoContent={historyInfoContent}
    >
      <HistoryPageContent />
    </PageContainer>
  );
}
