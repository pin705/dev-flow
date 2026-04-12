import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as getBootstrap } from '../../apps/web/src/app/api/client/bootstrap/route.ts';
import {
  GET as getHistory,
  POST as postHistory
} from '../../apps/web/src/app/api/client/history/route.ts';
import { GET as getPolicies } from '../../apps/web/src/app/api/client/policies/route.ts';
import { GET as getReleases } from '../../apps/web/src/app/api/client/releases/route.ts';
import { POST as startDeviceAuth } from '../../apps/web/src/app/api/client/device/start/route.ts';
import { POST as pollDeviceAuth } from '../../apps/web/src/app/api/client/device/poll/route.ts';
import { POST as logoutDeviceAuth } from '../../apps/web/src/app/api/client/device/logout/route.ts';
import { POST as postUsage } from '../../apps/web/src/app/api/client/usage/route.ts';
import {
  approveDeviceAuth,
  resetControlPlaneState
} from '../../apps/web/src/features/control-plane/server/service.ts';

const originalAutoApprove = process.env.DEVFLOW_DEVICE_FLOW_AUTO_APPROVE;

function createAuthorizedRequest(
  url: string,
  init?: RequestInit & { deviceCode?: string }
): Request {
  const headers = new Headers(init?.headers);

  if (init?.deviceCode) {
    headers.set('authorization', `Bearer ${init.deviceCode}`);
  }

  return new Request(url, {
    ...init,
    headers
  });
}

async function createApprovedDeviceSession(): Promise<{ deviceCode: string }> {
  const response = await startDeviceAuth(
    createAuthorizedRequest('http://localhost/api/client/device/start', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        workspaceId: 'ws_devflow_core'
      })
    })
  );
  const payload = (await response.json()) as { deviceCode: string };

  await approveDeviceAuth(payload.deviceCode, 'test-user');

  return {
    deviceCode: payload.deviceCode
  };
}

describe('client api routes', () => {
  beforeEach(() => {
    process.env.DEVFLOW_DEVICE_FLOW_AUTO_APPROVE = 'false';
    resetControlPlaneState();
  });

  afterEach(() => {
    if (originalAutoApprove === undefined) {
      delete process.env.DEVFLOW_DEVICE_FLOW_AUTO_APPROVE;
      return;
    }

    process.env.DEVFLOW_DEVICE_FLOW_AUTO_APPROVE = originalAutoApprove;
  });

  it('requires an approved device session before returning workspace bootstrap payloads', async () => {
    const unauthorizedResponse = await getBootstrap(
      createAuthorizedRequest('http://localhost/api/client/bootstrap')
    );
    const unauthorizedPayload = (await unauthorizedResponse.json()) as { error: string };
    const approvedSession = await createApprovedDeviceSession();
    const response = await getBootstrap(
      createAuthorizedRequest('http://localhost/api/client/bootstrap', {
        deviceCode: approvedSession.deviceCode
      })
    );
    const payload = (await response.json()) as {
      workspace: { slug: string; name: string };
      quotas: { seatLimit: number };
      releaseChannels: string[];
    };

    expect(unauthorizedResponse.status).toBe(401);
    expect(unauthorizedPayload.error).toContain('Missing device session');
    expect(response.ok).toBe(true);
    expect(payload.workspace.slug).toBe('devflow-core');
    expect(payload.workspace.name).toBe('Devflow Core');
    expect(payload.quotas.seatLimit).toBe(30);
    expect(payload.releaseChannels).toContain('stable');
  });

  it('returns policies, releases, and history items for approved client sessions', async () => {
    const approvedSession = await createApprovedDeviceSession();
    const [policiesResponse, releasesResponse, historyResponse] = await Promise.all([
      getPolicies(
        createAuthorizedRequest('http://localhost/api/client/policies', {
          deviceCode: approvedSession.deviceCode
        })
      ),
      getReleases(),
      getHistory(
        createAuthorizedRequest('http://localhost/api/client/history', {
          deviceCode: approvedSession.deviceCode
        })
      )
    ]);

    const policiesPayload = (await policiesResponse.json()) as {
      items: Array<{ policyVersionId: string }>;
    };
    const releasesPayload = (await releasesResponse.json()) as {
      items: Array<{ channel: string; notesUrl: string }>;
    };
    const historyPayload = (await historyResponse.json()) as {
      items: Array<{ traceId: string }>;
    };

    expect(policiesPayload.items.length).toBeGreaterThanOrEqual(1);
    expect(releasesPayload.items[0]?.channel).toBe('stable');
    expect(releasesPayload.items[0]?.notesUrl).toContain('/docs/changelog/');
    expect(historyPayload.items[0]?.traceId).toContain('trace-devflow');
  });

  it('accepts uploaded history and usage events for approved sessions, then exposes the synced item on history reads', async () => {
    const approvedSession = await createApprovedDeviceSession();
    const historyResponse = await postHistory(
      createAuthorizedRequest('http://localhost/api/client/history', {
        method: 'POST',
        deviceCode: approvedSession.deviceCode,
        body: JSON.stringify({
          id: '',
          traceId: 'trace-test',
          requestId: 'request-test',
          source: 'branch_compare',
          commandSource: 'cli',
          provider: 'qwen',
          model: 'qwen-code',
          status: 'completed',
          findings: [],
          summary: 'Synced from a unit test.',
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
        }),
        headers: {
          'content-type': 'application/json'
        }
      })
    );
    const usageResponse = await postUsage(
      createAuthorizedRequest('http://localhost/api/client/usage', {
        method: 'POST',
        deviceCode: approvedSession.deviceCode,
        body: JSON.stringify({
          source: 'cli',
          event: 'sync.uploaded',
          metadata: {
            traceId: 'trace-test'
          }
        }),
        headers: {
          'content-type': 'application/json'
        }
      })
    );
    const historyReadResponse = await getHistory(
      createAuthorizedRequest('http://localhost/api/client/history', {
        deviceCode: approvedSession.deviceCode
      })
    );

    const historyPayload = (await historyResponse.json()) as {
      accepted: boolean;
      item: { traceId: string };
    };
    const usagePayload = (await usageResponse.json()) as {
      accepted: boolean;
      event: { event: string };
    };
    const historyReadPayload = (await historyReadResponse.json()) as {
      items: Array<{ traceId: string }>;
    };

    expect(historyPayload.accepted).toBe(true);
    expect(historyPayload.item.traceId).toBe('trace-test');
    expect(usagePayload.accepted).toBe(true);
    expect(usagePayload.event.event).toBe('sync.uploaded');
    expect(historyReadPayload.items[0]?.traceId).toBe('trace-test');
  });

  it('runs the explicit device auth lifecycle across start, poll, approval, and logout routes', async () => {
    const deviceResponse = await startDeviceAuth(
      createAuthorizedRequest('http://localhost/api/client/device/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          workspaceId: 'ws_devflow_core'
        })
      })
    );
    const devicePayload = (await deviceResponse.json()) as {
      deviceCode: string;
      userCode: string;
      verificationUri: string;
      status: string;
    };

    const initialPollResponse = await pollDeviceAuth(
      createAuthorizedRequest('http://localhost/api/client/device/poll', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          deviceCode: devicePayload.deviceCode
        })
      })
    );
    const initialPollPayload = (await initialPollResponse.json()) as {
      status: string;
    };

    await approveDeviceAuth(devicePayload.deviceCode, 'test-user');

    const pollResponse = await pollDeviceAuth(
      createAuthorizedRequest('http://localhost/api/client/device/poll', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          deviceCode: devicePayload.deviceCode
        })
      })
    );
    const pollPayload = (await pollResponse.json()) as {
      status: string;
      workspaceId: string;
    };

    const logoutResponse = await logoutDeviceAuth(
      createAuthorizedRequest('http://localhost/api/client/device/logout', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          deviceCode: devicePayload.deviceCode
        })
      })
    );
    const logoutPayload = (await logoutResponse.json()) as {
      ok: boolean;
      session: { status: string };
    };

    expect(devicePayload.userCode).toContain('FLOW-');
    expect(devicePayload.verificationUri).toContain('/auth/device');
    expect(devicePayload.status).toBe('pending');
    expect(initialPollPayload.status).toBe('pending');
    expect(pollPayload.status).toBe('approved');
    expect(pollPayload.workspaceId).toBe('ws_devflow_core');
    expect(logoutPayload.ok).toBe(true);
    expect(logoutPayload.session.status).toBe('revoked');
  });
});
