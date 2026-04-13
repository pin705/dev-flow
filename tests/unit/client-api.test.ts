import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getBootstrap } from '../../apps/web/src/app/api/client/bootstrap/route.ts';
import {
  GET as getHistory,
  POST as postHistory
} from '../../apps/web/src/app/api/client/history/route.ts';
import { POST as postInstallation } from '../../apps/web/src/app/api/client/installations/route.ts';
import { GET as getPolicies } from '../../apps/web/src/app/api/client/policies/route.ts';
import { GET as getReleases } from '../../apps/web/src/app/api/client/releases/route.ts';
import { POST as startDeviceAuth } from '../../apps/web/src/app/api/client/device/start/route.ts';
import { POST as pollDeviceAuth } from '../../apps/web/src/app/api/client/device/poll/route.ts';
import { POST as logoutDeviceAuth } from '../../apps/web/src/app/api/client/device/logout/route.ts';
import { POST as postUsage } from '../../apps/web/src/app/api/client/usage/route.ts';
import {
  approveDeviceAuth,
  listClientInstallations,
  resetControlPlaneState
} from '../../apps/web/src/features/control-plane/server/service.ts';

const originalAutoApprove = process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE;
const originalDeviceSessionTtl = process.env.DIFFMINT_DEVICE_SESSION_TTL_HOURS;
const originalReleaseSigningPrivateKey = process.env.DIFFMINT_RELEASE_SIGNING_PRIVATE_KEY;
const originalReleaseSigningKeyId = process.env.DIFFMINT_RELEASE_SIGNING_KEY_ID;

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
        workspaceId: 'ws_diffmint_core'
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
    process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE = 'false';
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

    if (originalReleaseSigningPrivateKey === undefined) {
      delete process.env.DIFFMINT_RELEASE_SIGNING_PRIVATE_KEY;
    } else {
      process.env.DIFFMINT_RELEASE_SIGNING_PRIVATE_KEY = originalReleaseSigningPrivateKey;
    }

    if (originalReleaseSigningKeyId === undefined) {
      delete process.env.DIFFMINT_RELEASE_SIGNING_KEY_ID;
    } else {
      process.env.DIFFMINT_RELEASE_SIGNING_KEY_ID = originalReleaseSigningKeyId;
    }

    vi.useRealTimers();
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
    expect(unauthorizedResponse.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(unauthorizedResponse.headers.get('vary')).toBe('Authorization, X-Diffmint-Device-Code');
    expect(unauthorizedResponse.headers.get('x-diffmint-request-id')).toMatch(/^req_/);
    expect(unauthorizedPayload.error).toContain('Missing device session');
    expect(response.ok).toBe(true);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('x-diffmint-request-id')).toMatch(/^req_/);
    expect(payload.workspace.slug).toBe('diffmint-core');
    expect(payload.workspace.name).toBe('Diffmint Core');
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
    expect(policiesResponse.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(policiesResponse.headers.get('x-diffmint-request-id')).toMatch(/^req_/);
    expect(releasesPayload.items[0]?.channel).toBe('stable');
    expect(releasesPayload.items[0]?.notesUrl).toContain('/docs/changelog/');
    expect(releasesResponse.headers.get('cache-control')).toBe(
      'public, max-age=300, stale-while-revalidate=300'
    );
    expect(releasesResponse.headers.get('x-diffmint-request-id')).toMatch(/^req_/);
    expect(historyPayload.items[0]?.traceId).toContain('trace-diffmint');
  });

  it('returns signed release manifests when a signing key is configured', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');

    process.env.DIFFMINT_RELEASE_SIGNING_PRIVATE_KEY = privateKey.export({
      format: 'pem',
      type: 'pkcs8'
    });
    process.env.DIFFMINT_RELEASE_SIGNING_KEY_ID = 'release-key-2026-04';

    const response = await getReleases();
    const payload = (await response.json()) as {
      items: Array<{
        channel: string;
        signature?: {
          algorithm: string;
          keyId: string;
          signedAt: string;
          value: string;
        };
      }>;
    };

    expect(response.ok).toBe(true);
    expect(payload.items[0]?.channel).toBe('stable');
    expect(payload.items[0]?.signature).toEqual(
      expect.objectContaining({
        algorithm: 'ed25519',
        keyId: 'release-key-2026-04',
        signedAt: payload.items[0]?.releasedAt ?? payload.items[0]?.signature?.signedAt
      })
    );
    expect(payload.items[0]?.signature?.value).toMatch(/^[A-Za-z0-9+/=]+$/);
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
          context: {
            sourceLabel: 'Branch Compare',
            modeLabel: 'full',
            fileSummary: '1 file in apps/web',
            visibleFiles: ['apps/web/src/app/api/client/history/route.ts'],
            remainingFileCount: 0,
            fileGroups: [{ label: 'apps/web', count: 1 }],
            diffStats: {
              fileCount: 1,
              additions: 2,
              deletions: 0
            }
          },
          convention: {
            promptProfile: 'diffmint-codex-compact-v1',
            source: 'default',
            additionalPriorities: [],
            reviewNotes: [],
            snippetContextLines: 2,
            maxVisibleFiles: 5,
            maxFileGroups: 6
          },
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
      item: {
        traceId: string;
        context?: { fileSummary?: string };
        convention?: { promptProfile?: string };
      };
    };
    const usagePayload = (await usageResponse.json()) as {
      accepted: boolean;
      event: { event: string };
    };
    const historyReadPayload = (await historyReadResponse.json()) as {
      items: Array<{ traceId: string }>;
    };

    expect(historyPayload.accepted).toBe(true);
    expect(historyResponse.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(historyPayload.item.traceId).toBe('trace-test');
    expect(historyPayload.item.context?.fileSummary).toBe('1 file in apps/web');
    expect(historyPayload.item.convention?.promptProfile).toBe('diffmint-codex-compact-v1');
    expect(usagePayload.accepted).toBe(true);
    expect(usageResponse.headers.get('x-diffmint-request-id')).toMatch(/^req_/);
    expect(usagePayload.event.event).toBe('sync.uploaded');
    expect(historyReadPayload.items[0]?.traceId).toBe('trace-test');
  });

  it('redacts sensitive history payloads before persisting them', async () => {
    const approvedSession = await createApprovedDeviceSession();
    const historyResponse = await postHistory(
      createAuthorizedRequest('http://localhost/api/client/history', {
        method: 'POST',
        deviceCode: approvedSession.deviceCode,
        body: JSON.stringify({
          id: '',
          traceId: 'trace-redacted-history',
          requestId: 'request-redacted-history',
          source: 'branch_compare',
          commandSource: 'cli',
          provider: 'qwen',
          model: 'qwen-code',
          status: 'completed',
          findings: [
            {
              id: 'finding-redacted-history',
              severity: 'high',
              title: 'Secret exposure',
              summary: 'Authorization header used Bearer token-value-1234567890'
            }
          ],
          summary: 'Provider key sk_live_12345678901234567890 was included in the report.',
          severityCounts: {
            low: 0,
            medium: 0,
            high: 1,
            critical: 0
          },
          durationMs: 250,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          artifacts: [
            {
              id: 'artifact-redacted-history',
              kind: 'raw-provider-output',
              label: 'Qwen Headless Output',
              mimeType: 'application/json',
              content: '{"client_secret":"abc123"}'
            }
          ]
        }),
        headers: {
          'content-type': 'application/json'
        }
      })
    );
    const historyPayload = (await historyResponse.json()) as {
      accepted: boolean;
      item: {
        summary: string;
        findings: Array<{ summary: string }>;
        artifacts: Array<{ content?: string; mimeType: string }>;
      };
    };

    expect(historyPayload.accepted).toBe(true);
    expect(historyPayload.item.summary).toContain('[REDACTED API KEY]');
    expect(historyPayload.item.findings[0]?.summary).toContain('Bearer [REDACTED]');
    expect(historyPayload.item.artifacts[0]?.content).toBe(
      '[REDACTED raw provider output omitted from cloud sync]'
    );
    expect(historyPayload.item.artifacts[0]?.mimeType).toBe('text/plain');
  });

  it('registers client installations for approved sessions', async () => {
    const approvedSession = await createApprovedDeviceSession();
    const installationResponse = await postInstallation(
      createAuthorizedRequest('http://localhost/api/client/installations', {
        method: 'POST',
        deviceCode: approvedSession.deviceCode,
        body: JSON.stringify({
          clientType: 'cli',
          platform: 'darwin-arm64',
          version: '0.1.0',
          channel: 'stable'
        }),
        headers: {
          'content-type': 'application/json'
        }
      })
    );
    const installationPayload = (await installationResponse.json()) as {
      accepted: boolean;
      item: { clientType: string; platform: string; workspaceId: string };
    };
    const installations = await listClientInstallations('ws_diffmint_core');

    expect(installationResponse.ok).toBe(true);
    expect(installationResponse.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(installationPayload.accepted).toBe(true);
    expect(installationPayload.item.clientType).toBe('cli');
    expect(installationPayload.item.platform).toBe('darwin-arm64');
    expect(installationPayload.item.workspaceId).toBe('ws_diffmint_core');
    expect(installations).toHaveLength(1);
  });

  it('runs the explicit device auth lifecycle across start, poll, approval, and logout routes', async () => {
    const deviceResponse = await startDeviceAuth(
      createAuthorizedRequest('http://localhost/api/client/device/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          workspaceId: 'ws_diffmint_core'
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
    expect(deviceResponse.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(deviceResponse.headers.get('x-diffmint-request-id')).toMatch(/^req_/);
    expect(devicePayload.verificationUri).toContain('/auth/device');
    expect(devicePayload.status).toBe('pending');
    expect(initialPollPayload.status).toBe('pending');
    expect(pollPayload.status).toBe('approved');
    expect(pollPayload.workspaceId).toBe('ws_diffmint_core');
    expect(pollResponse.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(logoutPayload.ok).toBe(true);
    expect(logoutResponse.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(logoutPayload.session.status).toBe('revoked');
  });

  it('uses forwarded request headers when building the device verification URL', async () => {
    const response = await startDeviceAuth(
      createAuthorizedRequest('http://localhost/api/client/device/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-host': 'diffmint.io',
          'x-forwarded-proto': 'https'
        },
        body: JSON.stringify({
          workspaceId: 'ws_diffmint_core'
        })
      })
    );
    const payload = (await response.json()) as {
      verificationUri: string;
      verificationUriComplete: string;
    };

    expect(payload.verificationUri).toBe('https://diffmint.io/auth/device');
    expect(payload.verificationUriComplete).toContain(
      'https://diffmint.io/auth/device?device_code='
    );
  });

  it('rejects bootstrap requests when the approved device session has expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-13T00:00:00.000Z'));
    process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE = 'false';
    process.env.DIFFMINT_DEVICE_SESSION_TTL_HOURS = '0.0001';

    const approvedSession = await createApprovedDeviceSession();

    vi.setSystemTime(new Date('2026-04-13T00:00:01.000Z'));

    const response = await getBootstrap(
      createAuthorizedRequest('http://localhost/api/client/bootstrap', {
        deviceCode: approvedSession.deviceCode
      })
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(payload.error).toContain('not approved or has expired');
  });
});
