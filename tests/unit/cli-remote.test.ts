import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

const cliBin = fileURLToPath(new URL('../../apps/cli/bin/dm', import.meta.url));
const tempDirs: string[] = [];
const servers: Array<ReturnType<typeof createServer>> = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8'
  }).trim();
}

function createRepoWithChangedFile(filePath = 'apps/web/src/app/api/client/history/route.ts'): {
  repoDir: string;
  filePath: string;
} {
  const repoDir = makeTempDir('diffmint-cli-remote-repo-');
  const absoluteFilePath = path.join(repoDir, filePath);

  runGit(repoDir, ['init']);
  runGit(repoDir, ['config', 'user.email', 'team@diffmint.io']);
  runGit(repoDir, ['config', 'user.name', 'Diffmint Tests']);

  mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
  writeFileSync(
    absoluteFilePath,
    'export async function GET() { return Response.json({ ok: true }); }\n',
    'utf8'
  );
  runGit(repoDir, ['add', '.']);
  runGit(repoDir, ['commit', '-m', 'init']);

  writeFileSync(
    absoluteFilePath,
    'export async function GET() { return Response.json({ ok: true, synced: true }); }\n',
    'utf8'
  );

  return { repoDir, filePath };
}

function runCli(args: string[], cwd: string, homeDir: string, apiBaseUrl: string) {
  return spawnSync(cliBin, args, {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      DIFFMINT_API_BASE_URL: apiBaseUrl,
      DIFFMINT_DEVICE_AUTH_TIMEOUT_MS: '2000',
      DIFFMINT_REVIEW_RUNTIME: 'scaffold'
    }
  });
}

async function runCliAsync(args: string[], cwd: string, homeDir: string, apiBaseUrl: string) {
  const child = spawn(cliBin, args, {
    cwd,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      DIFFMINT_API_BASE_URL: apiBaseUrl,
      DIFFMINT_DEVICE_AUTH_TIMEOUT_MS: '2000',
      DIFFMINT_REVIEW_RUNTIME: 'scaffold'
    },
    stdio: 'pipe'
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const [code, signal] = await once(child, 'exit');

  return {
    status: code,
    signal,
    stdout,
    stderr
  };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as unknown) : {};
}

async function createControlPlaneServer(): Promise<{
  baseUrl: string;
  state: {
    history: Array<{ traceId: string }>;
    usageEvents: Array<{ event: string }>;
    installations: Array<{ clientType: string; version: string; platform: string }>;
    authorizedPaths: string[];
    acceptSyncUploads: boolean;
  };
}> {
  const state = {
    history: [] as Array<{ traceId: string }>,
    usageEvents: [] as Array<{ event: string }>,
    installations: [] as Array<{ clientType: string; version: string; platform: string }>,
    authorizedPaths: [] as string[],
    acceptSyncUploads: true
  };

  function requireApprovedDeviceSession(
    request: IncomingMessage,
    response: ServerResponse
  ): boolean {
    const authorization = request.headers.authorization;

    if (authorization !== 'Bearer device_test_remote') {
      response.statusCode = 403;
      response.end(JSON.stringify({ error: 'Device session is not approved.' }));
      return false;
    }

    state.authorizedPaths.push(request.url ?? '/');
    return true;
  }

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    response.setHeader('content-type', 'application/json');
    response.setHeader('connection', 'close');
    response.setHeader('x-diffmint-request-id', 'req_remote_test_123');

    if (request.method === 'POST' && url.pathname === '/api/client/device/start') {
      response.end(
        JSON.stringify({
          deviceCode: 'device_test_remote',
          userCode: 'FLOW-9001',
          verificationUri: 'http://127.0.0.1/auth/device',
          verificationUriComplete: 'http://127.0.0.1/auth/device?device_code=device_test_remote',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          intervalSeconds: 1,
          status: 'pending',
          workspaceId: 'ws_remote'
        })
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/client/device/poll') {
      response.end(
        JSON.stringify({
          deviceCode: 'device_test_remote',
          userCode: 'FLOW-9001',
          verificationUri: 'http://127.0.0.1/auth/device',
          verificationUriComplete: 'http://127.0.0.1/auth/device?device_code=device_test_remote',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          intervalSeconds: 1,
          status: 'approved',
          workspaceId: 'ws_remote'
        })
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/client/device/logout') {
      response.end(
        JSON.stringify({
          ok: true,
          session: {
            status: 'revoked'
          }
        })
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/client/bootstrap') {
      if (!requireApprovedDeviceSession(request, response)) {
        return;
      }

      response.end(
        JSON.stringify({
          workspace: {
            id: 'ws_remote',
            slug: 'remote-workspace',
            name: 'Remote Workspace'
          },
          role: 'owner',
          policy: {
            workspaceId: 'ws_remote',
            policySetId: 'policy_set_remote',
            policyVersionId: 'policy-remote-v1',
            name: 'Remote Policy',
            version: '1.0.0',
            checksum: 'policy-remote-v1',
            publishedAt: '2026-04-12T00:00:00.000Z',
            summary: 'Remote policy bundle',
            checklist: [],
            rules: []
          },
          provider: {
            id: 'provider_remote',
            provider: 'qwen',
            mode: 'managed',
            defaultModel: 'qwen-code',
            allowedModels: ['qwen-code'],
            encrypted: true,
            updatedAt: '2026-04-12T00:00:00.000Z'
          },
          quotas: {
            includedCredits: 200000,
            remainingCredits: 180000,
            seats: 5,
            seatLimit: 10,
            spendCapUsd: 250
          },
          syncDefaults: {
            cloudSyncEnabled: true,
            localOnlyDefault: false,
            redactionEnabled: true
          },
          releaseChannels: ['stable']
        })
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/client/history') {
      if (!requireApprovedDeviceSession(request, response)) {
        return;
      }

      response.end(JSON.stringify({ items: state.history }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/client/history') {
      if (!requireApprovedDeviceSession(request, response)) {
        return;
      }

      if (!state.acceptSyncUploads) {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: 'Control plane ingest unavailable.' }));
        return;
      }

      const body = (await readBody(request)) as { traceId: string };
      state.history.unshift(body);
      response.end(JSON.stringify({ accepted: true, item: body }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/client/usage') {
      if (!requireApprovedDeviceSession(request, response)) {
        return;
      }

      if (!state.acceptSyncUploads) {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: 'Control plane ingest unavailable.' }));
        return;
      }

      const body = (await readBody(request)) as { event: string };
      state.usageEvents.unshift(body);
      response.end(
        JSON.stringify({
          accepted: true,
          event: {
            id: 'usage_remote',
            workspaceId: 'ws_remote',
            createdAt: new Date().toISOString(),
            ...body
          }
        })
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/client/installations') {
      if (!requireApprovedDeviceSession(request, response)) {
        return;
      }

      const body = (await readBody(request)) as {
        clientType: string;
        version: string;
        platform: string;
      };
      state.installations.unshift(body);
      response.end(
        JSON.stringify({
          accepted: true,
          item: {
            id: 'install_remote',
            workspaceId: 'ws_remote',
            channel: 'stable',
            lastSeenAt: new Date().toISOString(),
            ...body
          }
        })
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Not found' }));
  });

  servers.push(server);
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected an address from the test control plane server.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    state
  };
}

describe('diffmint cli remote control plane integration', () => {
  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (!server) {
        continue;
      }

      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('logs in via the control plane, syncs review history, and reads remote history back', async () => {
    const controlPlane = await createControlPlaneServer();
    const homeDir = makeTempDir('diffmint-cli-remote-home-');
    const { repoDir, filePath } = createRepoWithChangedFile();

    const loginResult = await runCliAsync(
      ['auth', 'login'],
      repoDir,
      homeDir,
      controlPlane.baseUrl
    );
    const reviewResult = await runCliAsync(
      ['review', '--files', filePath, '--markdown'],
      repoDir,
      homeDir,
      controlPlane.baseUrl
    );
    const historyResult = await runCliAsync(
      ['history', '--json'],
      repoDir,
      homeDir,
      controlPlane.baseUrl
    );
    const configPath = path.join(homeDir, '.diffmint', 'config.json');
    const loginFailureMessage = [
      `status=${loginResult.status}`,
      `signal=${loginResult.signal}`,
      `stdout=${loginResult.stdout}`,
      `stderr=${loginResult.stderr}`
    ].join('\n');

    expect(loginResult.status, loginFailureMessage).toBe(0);
    expect(existsSync(configPath), loginFailureMessage).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      workspace: { name: string; slug: string };
      policyVersionId: string;
      provider: string;
    };
    const history = JSON.parse(historyResult.stdout) as Array<{ traceId: string }>;

    expect(loginResult.stdout).toContain('FLOW-9001');
    expect(config.workspace.name).toBe('Remote Workspace');
    expect(config.workspace.slug).toBe('remote-workspace');
    expect(config.policyVersionId).toBe('policy-remote-v1');
    expect(config.provider).toBe('qwen');
    expect(controlPlane.state.authorizedPaths).toContain('/api/client/bootstrap');
    expect(controlPlane.state.authorizedPaths).toContain('/api/client/installations');
    expect(controlPlane.state.installations[0]?.clientType).toBe('cli');
    expect(controlPlane.state.installations[0]?.version).toBe('0.1.0');

    expect(reviewResult.status).toBe(0);
    expect(reviewResult.stdout).toContain('# Diffmint Review');
    expect(controlPlane.state.history).toHaveLength(1);
    expect(controlPlane.state.usageEvents[0]?.event).toBe('sync.uploaded');
    expect(controlPlane.state.authorizedPaths).toContain('/api/client/history');
    expect(controlPlane.state.authorizedPaths).toContain('/api/client/usage');

    expect(history).toHaveLength(1);
    expect(history[0]?.traceId).toBe(controlPlane.state.history[0]?.traceId);
  }, 20_000);

  it('queues review sync payloads locally when ingest is unavailable and flushes them later', async () => {
    const controlPlane = await createControlPlaneServer();
    const homeDir = makeTempDir('diffmint-cli-queue-home-');
    const { repoDir, filePath } = createRepoWithChangedFile();
    const queuePath = path.join(homeDir, '.diffmint', 'sync-queue.json');

    const loginResult = await runCliAsync(
      ['auth', 'login'],
      repoDir,
      homeDir,
      controlPlane.baseUrl
    );

    expect(loginResult.status).toBe(0);

    controlPlane.state.acceptSyncUploads = false;

    const reviewResult = await runCliAsync(
      ['review', '--files', filePath, '--markdown'],
      repoDir,
      homeDir,
      controlPlane.baseUrl
    );
    const queuedItems = JSON.parse(readFileSync(queuePath, 'utf8')) as Array<{
      pathname: string;
    }>;

    expect(reviewResult.status).toBe(0);
    expect(reviewResult.stdout).toContain('Cloud sync skipped: Queued review for later sync');
    expect(reviewResult.stdout).toContain('request: req_remote_test_123');
    expect(queuedItems).toHaveLength(2);
    expect(controlPlane.state.history).toHaveLength(0);
    expect(controlPlane.state.usageEvents).toHaveLength(0);

    controlPlane.state.acceptSyncUploads = true;

    const historyResult = await runCliAsync(
      ['history', '--json'],
      repoDir,
      homeDir,
      controlPlane.baseUrl
    );
    const history = JSON.parse(historyResult.stdout) as Array<{ traceId: string }>;
    const remainingQueue = JSON.parse(readFileSync(queuePath, 'utf8')) as unknown[];

    expect(historyResult.status).toBe(0);
    expect(controlPlane.state.history).toHaveLength(1);
    expect(controlPlane.state.usageEvents[0]?.event).toBe('sync.uploaded');
    expect(history).toHaveLength(1);
    expect(remainingQueue).toHaveLength(0);
  }, 20_000);
});
