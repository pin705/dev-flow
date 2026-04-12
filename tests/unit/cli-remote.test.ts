import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

const cliBin = fileURLToPath(new URL('../../apps/cli/bin/devflow', import.meta.url));
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
  const repoDir = makeTempDir('devflow-cli-remote-repo-');
  const absoluteFilePath = path.join(repoDir, filePath);

  runGit(repoDir, ['init']);
  runGit(repoDir, ['config', 'user.email', 'devflow@example.com']);
  runGit(repoDir, ['config', 'user.name', 'Devflow Tests']);

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
      DEVFLOW_API_BASE_URL: apiBaseUrl,
      DEVFLOW_DEVICE_AUTH_TIMEOUT_MS: '2000'
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
      DEVFLOW_API_BASE_URL: apiBaseUrl,
      DEVFLOW_DEVICE_AUTH_TIMEOUT_MS: '2000'
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
  };
}> {
  const state = {
    history: [] as Array<{ traceId: string }>,
    usageEvents: [] as Array<{ event: string }>
  };

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    response.setHeader('content-type', 'application/json');
    response.setHeader('connection', 'close');

    if (request.method === 'POST' && url.pathname === '/api/client/device/start') {
      response.end(
        JSON.stringify({
          deviceCode: 'device_test_remote',
          userCode: 'FLOW-9001',
          verificationUri: 'http://127.0.0.1/auth/sign-in',
          verificationUriComplete: 'http://127.0.0.1/auth/sign-in?device_code=device_test_remote',
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
          verificationUri: 'http://127.0.0.1/auth/sign-in',
          verificationUriComplete: 'http://127.0.0.1/auth/sign-in?device_code=device_test_remote',
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
      response.end(JSON.stringify({ items: state.history }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/client/history') {
      const body = (await readBody(request)) as { traceId: string };
      state.history.unshift(body);
      response.end(JSON.stringify({ accepted: true, item: body }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/client/usage') {
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

describe('devflow cli remote control plane integration', () => {
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
    const homeDir = makeTempDir('devflow-cli-remote-home-');
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
    const historyResult = await runCliAsync(['history'], repoDir, homeDir, controlPlane.baseUrl);
    const configPath = path.join(homeDir, '.devflow', 'config.json');
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

    expect(reviewResult.status).toBe(0);
    expect(reviewResult.stdout).toContain('# Devflow Review');
    expect(controlPlane.state.history).toHaveLength(1);
    expect(controlPlane.state.usageEvents[0]?.event).toBe('sync.uploaded');

    expect(history).toHaveLength(1);
    expect(history[0]?.traceId).toBe(controlPlane.state.history[0]?.traceId);
  });
});
