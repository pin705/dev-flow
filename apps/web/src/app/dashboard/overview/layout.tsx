import type { ReactNode } from 'react';
import PageContainer from '@/components/layout/page-container';
import { overviewInfoContent } from '@/config/infoconfig';
import { ControlPlaneOverviewPage } from '@/features/control-plane/components/overview-page';

export default function OverViewLayout({ children }: { children?: ReactNode }) {
  return (
    <PageContainer
      pageTitle='Workspace Overview'
      pageDescription='CLI and VS Code stay primary. This dashboard manages policies, providers, billing, history, audit, and docs.'
      infoContent={overviewInfoContent}
    >
      <ControlPlaneOverviewPage />
      {children}
    </PageContainer>
  );
}
