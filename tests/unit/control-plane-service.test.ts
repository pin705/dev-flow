import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBillingWorkspaceSnapshot } from '../../apps/web/src/features/control-plane/server/service.ts';
import {
  applyPolarWebhookPayload,
  ensureControlPlaneSeedData,
  getOverviewStats,
  getWorkspaceBootstrap,
  listAuditEvents,
  listReviewSessions,
  listUsageEvents,
  pollDeviceAuth,
  recordReviewSession,
  resetControlPlaneState,
  revokeDeviceAuth,
  startDeviceAuth
} from '../../apps/web/src/features/control-plane/server/service.ts';

const originalAutoApprove = process.env.DEVFLOW_DEVICE_FLOW_AUTO_APPROVE;

describe('control plane service', () => {
  beforeEach(() => {
    process.env.DEVFLOW_DEVICE_FLOW_AUTO_APPROVE = 'true';
    resetControlPlaneState();
  });

  afterEach(() => {
    if (originalAutoApprove === undefined) {
      delete process.env.DEVFLOW_DEVICE_FLOW_AUTO_APPROVE;
      return;
    }

    process.env.DEVFLOW_DEVICE_FLOW_AUTO_APPROVE = originalAutoApprove;
  });

  it('returns bootstrap data and derived overview stats from the shared state', async () => {
    const bootstrap = await getWorkspaceBootstrap();
    const stats = await getOverviewStats();

    expect(bootstrap.workspace.slug).toBe('devflow-core');
    expect(bootstrap.policy.policyVersionId).toBeTruthy();
    expect(stats.find((stat) => stat.label === 'Active seats')?.value).toBe('26 / 30');
    expect(stats.find((stat) => stat.label === 'Published policies')?.helper).toContain('active');
  });

  it('keeps seed setup idempotent when control-plane seed is applied more than once', async () => {
    await ensureControlPlaneSeedData();
    const firstBootstrap = await getWorkspaceBootstrap();
    const firstHistorySize = (await listReviewSessions()).length;

    await ensureControlPlaneSeedData();
    const secondBootstrap = await getWorkspaceBootstrap();
    const secondHistorySize = (await listReviewSessions()).length;

    expect(secondBootstrap.workspace.slug).toBe(firstBootstrap.workspace.slug);
    expect(secondHistorySize).toBe(firstHistorySize);
  });

  it('records synced reviews and appends usage plus audit events', async () => {
    const initialHistorySize = (await listReviewSessions()).length;
    const initialUsageSize = (await listUsageEvents()).length;
    const initialAuditSize = (await listAuditEvents()).length;

    const session = await recordReviewSession({
      id: '',
      traceId: 'trace-devflow-new',
      workspaceId: 'ws_devflow_core',
      requestId: 'request-new',
      source: 'branch_compare',
      commandSource: 'cli',
      provider: 'qwen',
      model: 'qwen-code',
      policyVersionId: 'policy-v1',
      status: 'completed',
      findings: [],
      summary: 'Uploaded a new review session.',
      severityCounts: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      },
      durationMs: 250,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      artifacts: []
    });

    expect(session.id).toBeTruthy();
    expect(await listReviewSessions()).toHaveLength(initialHistorySize + 1);
    expect((await listReviewSessions())[0]?.traceId).toBe('trace-devflow-new');
    expect(await listUsageEvents()).toHaveLength(initialUsageSize + 1);
    expect(await listAuditEvents()).toHaveLength(initialAuditSize + 1);
    expect((await listAuditEvents())[0]?.event).toBe('review.synced');
  });

  it('runs the device auth lifecycle from pending to approved to revoked', async () => {
    const started = await startDeviceAuth('ws_devflow_core');
    const approved = await pollDeviceAuth(started.deviceCode);
    const revoked = await revokeDeviceAuth(started.deviceCode);

    expect(started.status).toBe('pending');
    expect(approved?.status).toBe('approved');
    expect(revoked?.status).toBe('revoked');
  });

  it('applies Polar webhook payloads to billing state and audit history', async () => {
    const before = await getBillingWorkspaceSnapshot();

    await applyPolarWebhookPayload({
      type: 'subscription.updated',
      data: {
        id: 'sub_devflow_enterprise',
        status: 'active',
        seats: 40,
        metadata: {
          workspaceId: 'ws_devflow_core',
          planKey: 'enterprise'
        },
        customer: {
          id: 'cus_enterprise',
          externalId: 'ws_devflow_core'
        }
      }
    });

    const after = await getBillingWorkspaceSnapshot();
    const audit = await listAuditEvents();

    expect(after.customerId).toBe('cus_enterprise');
    expect(after.planKey).toBe('enterprise');
    expect(after.subscriptionStatus).toBe('active');
    expect(after.seatLimit).toBe(40);
    expect(after.seatLimit).toBeGreaterThanOrEqual(before.seatLimit);
    expect(audit[0]?.event).toContain('polar.subscription_updated');
  });
});
