import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBillingWorkspaceSnapshot } from '../../apps/web/src/features/control-plane/server/service.ts';
import {
  approveDeviceAuth,
  applyPolarWebhookPayload,
  authorizeApprovedDeviceSession,
  ensureControlPlaneSeedData,
  getDeviceAuthSession,
  getOverviewStats,
  getWorkspaceBootstrap,
  listAuditEvents,
  listClientInstallations,
  listReviewSessions,
  listUsageEvents,
  pollDeviceAuth,
  registerClientInstallation,
  recordReviewSession,
  resetControlPlaneState,
  revokeDeviceAuth,
  startDeviceAuth
} from '../../apps/web/src/features/control-plane/server/service.ts';

const originalAutoApprove = process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE;
const originalDeviceSessionTtl = process.env.DIFFMINT_DEVICE_SESSION_TTL_HOURS;
const originalForceMemoryState = process.env.DIFFMINT_FORCE_MEMORY_STATE;
const originalRequirePersistence = process.env.DIFFMINT_REQUIRE_PERSISTENCE;
const originalNodeEnv = process.env.NODE_ENV;

describe('control plane service', () => {
  beforeEach(() => {
    process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE = 'true';
    resetControlPlaneState();
  });

  afterEach(() => {
    if (originalAutoApprove === undefined) {
      delete process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE;
    } else {
      process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE = originalAutoApprove;
    }

    if (originalDeviceSessionTtl === undefined) {
      delete process.env.DIFFMINT_DEVICE_SESSION_TTL_HOURS;
    } else {
      process.env.DIFFMINT_DEVICE_SESSION_TTL_HOURS = originalDeviceSessionTtl;
    }

    if (originalForceMemoryState === undefined) {
      delete process.env.DIFFMINT_FORCE_MEMORY_STATE;
    } else {
      process.env.DIFFMINT_FORCE_MEMORY_STATE = originalForceMemoryState;
    }

    if (originalRequirePersistence === undefined) {
      delete process.env.DIFFMINT_REQUIRE_PERSISTENCE;
    } else {
      process.env.DIFFMINT_REQUIRE_PERSISTENCE = originalRequirePersistence;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    vi.useRealTimers();
  });

  it('returns bootstrap data and derived overview stats from the shared state', async () => {
    const bootstrap = await getWorkspaceBootstrap();
    const stats = await getOverviewStats();

    expect(bootstrap.workspace.slug).toBe('diffmint-core');
    expect(bootstrap.policy.policyVersionId).toBeTruthy();
    expect(stats.find((stat) => stat.label === 'Active seats')?.value).toBe('0 / 0');
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
      traceId: 'trace-diffmint-new',
      workspaceId: 'ws_diffmint_core',
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
    expect((await listReviewSessions())[0]?.traceId).toBe('trace-diffmint-new');
    expect(await listUsageEvents()).toHaveLength(initialUsageSize + 1);
    expect(await listAuditEvents()).toHaveLength(initialAuditSize + 1);
    expect((await listAuditEvents())[0]?.event).toBe('review.synced');
  });

  it('runs the device auth lifecycle from pending to approved to revoked', async () => {
    const started = await startDeviceAuth('ws_diffmint_core');
    const approved = await pollDeviceAuth(started.deviceCode);
    const revoked = await revokeDeviceAuth(started.deviceCode);

    expect(started.status).toBe('pending');
    expect(approved?.status).toBe('approved');
    expect(revoked?.status).toBe('revoked');
  });

  it('supports explicit device approval and client-session authorization when auto-approve is disabled', async () => {
    process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE = 'false';

    const started = await startDeviceAuth('ws_diffmint_core');
    const pending = await getDeviceAuthSession(started.deviceCode);
    const beforeApproval = await authorizeApprovedDeviceSession(started.deviceCode);
    const approved = await approveDeviceAuth(started.deviceCode, 'test-user');
    const afterApproval = await authorizeApprovedDeviceSession(started.deviceCode);

    expect(pending?.status).toBe('pending');
    expect(beforeApproval).toBeNull();
    expect(approved?.status).toBe('approved');
    expect(afterApproval).toEqual({
      deviceCode: started.deviceCode,
      workspaceId: 'ws_diffmint_core'
    });
  });

  it('updates the approved device session to the active workspace selected in the browser flow', async () => {
    process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE = 'false';

    const started = await startDeviceAuth('ws_diffmint_core');
    const approved = await approveDeviceAuth(started.deviceCode, 'test-user', 'org_browser_active');
    const authorized = await authorizeApprovedDeviceSession(started.deviceCode);

    expect(approved?.workspaceId).toBe('org_browser_active');
    expect(authorized).toEqual({
      deviceCode: started.deviceCode,
      workspaceId: 'org_browser_active'
    });
  });

  it('expires approved device sessions after the configured ttl', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-13T00:00:00.000Z'));
    process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE = 'false';
    process.env.DIFFMINT_DEVICE_SESSION_TTL_HOURS = '0.0001';

    const started = await startDeviceAuth('ws_diffmint_core');
    await approveDeviceAuth(started.deviceCode, 'test-user');

    vi.setSystemTime(new Date('2026-04-13T00:00:01.000Z'));

    const authorized = await authorizeApprovedDeviceSession(started.deviceCode);
    const session = await getDeviceAuthSession(started.deviceCode);

    expect(authorized).toBeNull();
    expect(session?.status).toBe('expired');
  });

  it('refreshes approved device session expiry when the client keeps using it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-13T00:00:00.000Z'));
    process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE = 'false';
    process.env.DIFFMINT_DEVICE_SESSION_TTL_HOURS = '0.001';

    const started = await startDeviceAuth('ws_diffmint_core');
    await approveDeviceAuth(started.deviceCode, 'test-user');

    vi.setSystemTime(new Date('2026-04-13T00:00:02.000Z'));
    const firstAuthorization = await authorizeApprovedDeviceSession(started.deviceCode);

    vi.setSystemTime(new Date('2026-04-13T00:00:05.000Z'));
    const secondAuthorization = await authorizeApprovedDeviceSession(started.deviceCode);

    expect(firstAuthorization).toEqual({
      deviceCode: started.deviceCode,
      workspaceId: 'ws_diffmint_core'
    });
    expect(secondAuthorization).toEqual({
      deviceCode: started.deviceCode,
      workspaceId: 'ws_diffmint_core'
    });
  });

  it('fails fast when persistence is required and the runtime is forced to memory fallback', async () => {
    process.env.DIFFMINT_FORCE_MEMORY_STATE = 'true';
    process.env.DIFFMINT_REQUIRE_PERSISTENCE = 'true';

    await expect(getWorkspaceBootstrap()).rejects.toThrow(
      'Persistent control-plane storage is required but DATABASE_URL is not active.'
    );
  });

  it('fails fast in production when the runtime would otherwise fall back to memory state', async () => {
    process.env.DIFFMINT_FORCE_MEMORY_STATE = 'true';
    process.env.NODE_ENV = 'production';

    await expect(getWorkspaceBootstrap()).rejects.toThrow(
      'Persistent control-plane storage is required but DATABASE_URL is not active.'
    );
  });

  it('registers client installations and refreshes existing records instead of duplicating them', async () => {
    const firstSeen = await registerClientInstallation({
      workspaceId: 'ws_diffmint_core',
      clientType: 'cli',
      platform: 'darwin-arm64',
      version: '0.1.0',
      channel: 'stable'
    });
    const secondSeen = await registerClientInstallation({
      workspaceId: 'ws_diffmint_core',
      clientType: 'cli',
      platform: 'darwin-arm64',
      version: '0.1.1',
      channel: 'stable'
    });
    const installations = await listClientInstallations('ws_diffmint_core');
    const auditEvents = await listAuditEvents();

    expect(installations).toHaveLength(1);
    expect(secondSeen.id).toBe(firstSeen.id);
    expect(secondSeen.version).toBe('0.1.1');
    expect(new Date(secondSeen.lastSeenAt).getTime()).toBeGreaterThanOrEqual(
      new Date(firstSeen.lastSeenAt).getTime()
    );
    expect(auditEvents.some((event) => event.event === 'client.installation_registered')).toBe(
      true
    );
    expect(auditEvents.some((event) => event.event === 'client.installation_updated')).toBe(true);
  });

  it('applies Polar webhook payloads to billing state and audit history', async () => {
    const before = await getBillingWorkspaceSnapshot();

    await applyPolarWebhookPayload({
      type: 'subscription.updated',
      data: {
        id: 'sub_diffmint_enterprise',
        status: 'active',
        seats: 40,
        metadata: {
          workspaceId: 'ws_diffmint_core',
          planKey: 'enterprise'
        },
        customer: {
          id: 'cus_enterprise',
          externalId: 'ws_diffmint_core'
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

  it('deduplicates repeated Polar webhook deliveries for billing and audit state', async () => {
    const beforeAuditCount = (await listAuditEvents()).length;

    const payload = {
      id: 'evt_polar_duplicate_1',
      timestamp: '2026-04-13T00:00:00.000Z',
      type: 'subscription.updated',
      data: {
        id: 'sub_diffmint_team',
        status: 'active',
        seats: 32,
        metadata: {
          workspaceId: 'ws_diffmint_core',
          planKey: 'team'
        },
        customer: {
          id: 'cus_diffmint_team',
          externalId: 'ws_diffmint_core'
        }
      }
    } as const;

    await applyPolarWebhookPayload(payload);
    const firstSnapshot = await getBillingWorkspaceSnapshot();
    const firstAuditCount = (await listAuditEvents()).length;

    await applyPolarWebhookPayload(payload);
    const secondSnapshot = await getBillingWorkspaceSnapshot();
    const secondAuditCount = (await listAuditEvents()).length;

    expect(firstSnapshot.customerId).toBe('cus_diffmint_team');
    expect(firstSnapshot.seatLimit).toBe(32);
    expect(firstAuditCount).toBe(beforeAuditCount + 1);
    expect(secondSnapshot).toEqual(firstSnapshot);
    expect(secondAuditCount).toBe(firstAuditCount);
  });
});
