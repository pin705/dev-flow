import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireWorkspaceAccessMock = vi.fn();
const getOverviewStatsMock = vi.fn();
const listPoliciesMock = vi.fn();
const listProvidersMock = vi.fn();
const listReviewSessionsMock = vi.fn();
const listAuditEventsMock = vi.fn();

vi.mock('@/components/layout/page-container', () => ({
  default: ({ children }: { children?: unknown }) => children ?? null
}));

vi.mock('@/features/control-plane/components/overview-page', () => ({
  ControlPlaneOverviewPage: () => null
}));

vi.mock('@/features/control-plane/components/providers-page', () => ({
  ProvidersPageContent: () => null
}));

vi.mock('@/features/control-plane/components/policies-page', () => ({
  PoliciesPageContent: () => null
}));

vi.mock('@/features/control-plane/components/history-page', () => ({
  HistoryPageContent: () => null
}));

vi.mock('@/features/control-plane/components/audit-page', () => ({
  AuditPageContent: () => null
}));

vi.mock('@/features/control-plane/server/access', () => ({
  requireWorkspaceAccess: requireWorkspaceAccessMock
}));

vi.mock('@/features/control-plane/server/service', () => ({
  getOverviewStats: getOverviewStatsMock,
  listPolicies: listPoliciesMock,
  listProviders: listProvidersMock,
  listReviewSessions: listReviewSessionsMock,
  listAuditEvents: listAuditEventsMock
}));

describe('dashboard page workspace scoping', () => {
  beforeEach(() => {
    vi.resetModules();

    requireWorkspaceAccessMock.mockResolvedValue({
      userId: 'user_test',
      orgId: 'org_workspace_test'
    });
    getOverviewStatsMock.mockResolvedValue([]);
    listPoliciesMock.mockResolvedValue([]);
    listProvidersMock.mockResolvedValue([]);
    listReviewSessionsMock.mockResolvedValue([]);
    listAuditEventsMock.mockResolvedValue([]);
  });

  it('passes the active workspace id into overview data loading', async () => {
    const module = await import('../../apps/web/src/app/dashboard/overview/page.tsx');

    await module.default();

    expect(getOverviewStatsMock).toHaveBeenCalledWith('org_workspace_test');
    expect(listPoliciesMock).toHaveBeenCalledWith('org_workspace_test');
    expect(listProvidersMock).toHaveBeenCalledWith('org_workspace_test');
    expect(listReviewSessionsMock).toHaveBeenCalledWith('org_workspace_test');
  });

  it('passes the active workspace id into providers, policies, history, and audit data loading', async () => {
    const providersModule = await import('../../apps/web/src/app/dashboard/providers/page.tsx');
    const policiesModule = await import('../../apps/web/src/app/dashboard/policies/page.tsx');
    const historyModule = await import('../../apps/web/src/app/dashboard/history/page.tsx');
    const auditModule = await import('../../apps/web/src/app/dashboard/audit/page.tsx');

    await providersModule.default();
    await policiesModule.default();
    await historyModule.default();
    await auditModule.default();

    expect(listProvidersMock).toHaveBeenCalledWith('org_workspace_test');
    expect(listPoliciesMock).toHaveBeenCalledWith('org_workspace_test');
    expect(listReviewSessionsMock).toHaveBeenCalledWith('org_workspace_test');
    expect(listAuditEventsMock).toHaveBeenCalledWith('org_workspace_test');
  });
});
