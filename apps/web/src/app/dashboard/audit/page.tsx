import PageContainer from '@/components/layout/page-container';
import { auditInfoContent } from '@/config/infoconfig';
import { AuditPageContent } from '@/features/control-plane/components/audit-page';
import { requireWorkspaceAccess } from '@/features/control-plane/server/access';
import { listAuditEvents } from '@/features/control-plane/server/service';

export default async function AuditPage() {
  await requireWorkspaceAccess();

  const auditEvents = await listAuditEvents();

  return (
    <PageContainer
      pageTitle='Audit Trail'
      pageDescription='Track provider changes, policy publishes, and synced review events across the workspace.'
      infoContent={auditInfoContent}
    >
      <AuditPageContent auditEvents={auditEvents} />
    </PageContainer>
  );
}
