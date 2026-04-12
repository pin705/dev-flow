import { TeamPageContent } from '@/features/control-plane/components/team-page';
import { requireWorkspaceAccess } from '@/features/control-plane/server/access';

export default async function TeamPage() {
  await requireWorkspaceAccess();

  return <TeamPageContent />;
}
