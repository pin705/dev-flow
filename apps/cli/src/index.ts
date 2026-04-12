import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type {
  DeviceAuthSession,
  ReviewSession,
  UsageEvent,
  WorkspaceBootstrap
} from '@devflow/contracts';
import {
  buildReviewRequest,
  createReviewSession,
  renderMarkdownSession,
  renderTerminalSession,
  runDoctor
} from '@devflow/review-core';

interface LocalConfig {
  apiBaseUrl?: string;
  provider?: string;
  workspace?: {
    id: string;
    name: string;
    slug?: string;
  };
  role?: WorkspaceBootstrap['role'];
  policyVersionId?: string;
  syncDefaults?: WorkspaceBootstrap['syncDefaults'];
  lastDeviceCode?: string;
  signedInAt?: string;
}

const DEVFLOW_HOME = path.join(homedir(), '.devflow');
const CONFIG_PATH = path.join(DEVFLOW_HOME, 'config.json');
const HISTORY_PATH = path.join(DEVFLOW_HOME, 'history.jsonl');

function ensureHome(): void {
  mkdirSync(DEVFLOW_HOME, { recursive: true });
}

function readConfig(): LocalConfig {
  ensureHome();
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }

  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as LocalConfig;
}

function writeConfig(config: LocalConfig): void {
  ensureHome();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function appendHistory(record: unknown): void {
  ensureHome();
  const prefix = existsSync(HISTORY_PATH) ? readFileSync(HISTORY_PATH, 'utf8') : '';
  const next = `${prefix}${JSON.stringify(record)}\n`;
  writeFileSync(HISTORY_PATH, next, 'utf8');
}

function readHistory(): unknown[] {
  ensureHome();
  if (!existsSync(HISTORY_PATH)) {
    return [];
  }

  return readFileSync(HISTORY_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function printHelp(): void {
  console.log(`Devflow CLI

Usage:
  devflow auth login
  devflow auth logout
  devflow config set-provider <provider>
  devflow review [--staged] [--base <ref>] [--files <a> <b>] [--json] [--markdown]
  devflow explain <file>
  devflow tests <file>
  devflow history
  devflow doctor
`);
}

function parseFlags(args: string[]) {
  const flags = {
    staged: false,
    baseRef: undefined as string | undefined,
    files: [] as string[],
    json: false,
    markdown: false,
    mode: 'full'
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--staged') {
      flags.staged = true;
      continue;
    }
    if (arg === '--base') {
      flags.baseRef = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--mode') {
      flags.mode = args[index + 1] ?? 'full';
      index += 1;
      continue;
    }
    if (arg === '--json') {
      flags.json = true;
      continue;
    }
    if (arg === '--markdown') {
      flags.markdown = true;
      continue;
    }
    if (arg === '--files') {
      const files: string[] = [];
      let pointer = index + 1;
      while (pointer < args.length && !args[pointer].startsWith('--')) {
        files.push(args[pointer]);
        pointer += 1;
      }
      flags.files = files;
      index = pointer - 1;
    }
  }

  return flags;
}

function output(data: string | object, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

function getApiBaseUrl(config: LocalConfig): string {
  return config.apiBaseUrl ?? process.env.DEVFLOW_API_BASE_URL ?? 'http://localhost:3000';
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        detail = payload.error;
      }
    } catch {
      // Ignore invalid JSON and fall back to HTTP status detail.
    }

    throw new Error(detail);
  }

  return (await response.json()) as T;
}

function createRequestHeaders(config?: LocalConfig, headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);

  if (config?.lastDeviceCode) {
    mergedHeaders.set('authorization', `Bearer ${config.lastDeviceCode}`);
  }

  return mergedHeaders;
}

async function fetchApi<T>(
  baseUrl: string,
  pathname: string,
  init?: RequestInit,
  config?: LocalConfig
): Promise<T> {
  const url = new URL(pathname, baseUrl).toString();
  const response = await fetch(url, {
    ...init,
    headers: createRequestHeaders(config, init?.headers)
  });
  return readJson<T>(response);
}

async function postApi<T>(
  baseUrl: string,
  pathname: string,
  body?: unknown,
  config?: LocalConfig
): Promise<T> {
  return fetchApi<T>(
    baseUrl,
    pathname,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    },
    config
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForDeviceApproval(
  baseUrl: string,
  session: DeviceAuthSession
): Promise<DeviceAuthSession> {
  const timeoutMs = Number(process.env.DEVFLOW_DEVICE_AUTH_TIMEOUT_MS ?? 10_000);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const nextSession = await postApi<DeviceAuthSession>(baseUrl, '/api/client/device/poll', {
      deviceCode: session.deviceCode
    });

    if (nextSession.status !== 'pending') {
      return nextSession;
    }

    await delay(nextSession.intervalSeconds * 1000);
  }

  throw new Error('Timed out waiting for device approval.');
}

async function tryRemoteLogin(config: LocalConfig): Promise<LocalConfig> {
  const apiBaseUrl = getApiBaseUrl(config);
  const session = await postApi<DeviceAuthSession>(apiBaseUrl, '/api/client/device/start', {
    workspaceId: config.workspace?.id
  });
  const verificationUrl = session.verificationUriComplete ?? session.verificationUri;

  console.log(`Open the device flow in your browser: ${verificationUrl}`);
  console.log(`Enter code: ${session.userCode}`);

  const approvedSession = await waitForDeviceApproval(apiBaseUrl, session);

  if (approvedSession.status !== 'approved') {
    throw new Error(`Device approval ended with status: ${approvedSession.status}`);
  }

  const bootstrap = await fetchApi<WorkspaceBootstrap>(
    apiBaseUrl,
    '/api/client/bootstrap',
    undefined,
    {
      ...config,
      lastDeviceCode: approvedSession.deviceCode
    }
  );

  return {
    ...config,
    apiBaseUrl,
    provider: bootstrap.provider.provider,
    role: bootstrap.role,
    policyVersionId: bootstrap.policy.policyVersionId,
    workspace: {
      id: bootstrap.workspace.id,
      name: bootstrap.workspace.name,
      slug: bootstrap.workspace.slug
    },
    syncDefaults: bootstrap.syncDefaults,
    lastDeviceCode: approvedSession.deviceCode,
    signedInAt: new Date().toISOString()
  };
}

function buildLocalFallbackConfig(config: LocalConfig): LocalConfig {
  return {
    ...config,
    apiBaseUrl: getApiBaseUrl(config),
    workspace: config.workspace ?? {
      id: 'ws_local',
      name: 'Local Workspace'
    },
    provider: config.provider ?? 'qwen',
    signedInAt: new Date().toISOString()
  };
}

async function syncReviewToCloud(config: LocalConfig, session: ReviewSession): Promise<void> {
  if (!config.workspace || config.syncDefaults?.cloudSyncEnabled === false) {
    return;
  }

  const apiBaseUrl = getApiBaseUrl(config);
  const payload: ReviewSession = {
    ...session,
    workspaceId: config.workspace.id
  };

  await postApi(apiBaseUrl, '/api/client/history', payload, config);
  await postApi<UsageEvent>(
    apiBaseUrl,
    '/api/client/usage',
    {
      workspaceId: config.workspace.id,
      source: session.commandSource,
      event: 'sync.uploaded',
      metadata: {
        traceId: session.traceId
      }
    },
    config
  );
}

async function loadHistory(config: LocalConfig): Promise<unknown[]> {
  if (!config.workspace) {
    return readHistory();
  }

  try {
    const payload = await fetchApi<{ items: unknown[] }>(
      getApiBaseUrl(config),
      '/api/client/history',
      undefined,
      config
    );
    return payload.items;
  } catch {
    return readHistory();
  }
}

async function extendDoctorOutput(config: LocalConfig): Promise<unknown[]> {
  const checks = runDoctor(process.cwd());
  const extendedChecks = [
    ...checks,
    {
      id: 'config',
      label: 'Local config',
      status: config.signedInAt ? 'ok' : 'warn',
      detail: config.signedInAt
        ? `Signed in to ${config.workspace?.name ?? 'unknown workspace'}`
        : 'Run `devflow auth login` to connect a workspace.'
    }
  ];

  if (!config.apiBaseUrl) {
    return extendedChecks;
  }

  try {
    const bootstrap = await fetchApi<WorkspaceBootstrap>(
      config.apiBaseUrl,
      '/api/client/bootstrap',
      undefined,
      config
    );

    return [
      ...extendedChecks,
      {
        id: 'control-plane',
        label: 'Control plane',
        status: 'ok',
        detail: `Connected to ${bootstrap.workspace.name} via ${config.apiBaseUrl}`
      }
    ];
  } catch (error) {
    return [
      ...extendedChecks,
      {
        id: 'control-plane',
        label: 'Control plane',
        status: 'warn',
        detail:
          error instanceof Error
            ? `Configured but unreachable: ${error.message}`
            : 'Configured but unreachable.'
      }
    ];
  }
}

function explainFile(target: string): string {
  const absolute = path.resolve(process.cwd(), target);
  const source = readFileSync(absolute, 'utf8');
  const exportCount = [...source.matchAll(/^export\s/gm)].length;
  const lineCount = source.split('\n').length;
  const isClient = source.includes("'use client'") || source.includes('"use client"');

  return [
    `Explain: ${target}`,
    `- Lines: ${lineCount}`,
    `- Exports: ${exportCount}`,
    `- Runtime: ${isClient ? 'client component or browser-aware module' : 'server or shared module'}`,
    `- Suggested next step: run \`devflow tests ${target}\` if this file changes behavior or contracts.`
  ].join('\n');
}

function generateTests(target: string): string {
  const name = path.basename(target);
  return [
    `Suggested tests for ${name}`,
    `1. Covers the primary happy path for ${name}.`,
    `2. Validates error handling and empty-state behavior.`,
    `3. Verifies policy or auth boundaries if the file touches control-plane logic.`,
    `4. Confirms trace IDs or sync metadata are preserved when applicable.`
  ].join('\n');
}

async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'auth' && subcommand === 'login') {
    const config = readConfig();
    let nextConfig: LocalConfig;

    try {
      nextConfig = await tryRemoteLogin(config);
    } catch (error) {
      nextConfig = buildLocalFallbackConfig(config);
      console.log(
        `Control plane login unavailable, using local fallback: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    writeConfig(nextConfig);
    console.log(`Signed in to Devflow.`);
    console.log(`Workspace: ${nextConfig.workspace?.name}`);
    console.log(`Control plane: ${nextConfig.apiBaseUrl}`);
    if (nextConfig.policyVersionId) {
      console.log(`Policy version: ${nextConfig.policyVersionId}`);
    }
    if (nextConfig.provider) {
      console.log(`Provider: ${nextConfig.provider}`);
    }
    return;
  }

  if (command === 'auth' && subcommand === 'logout') {
    const config = readConfig();

    if (config.lastDeviceCode && config.apiBaseUrl) {
      try {
        await postApi(
          config.apiBaseUrl,
          '/api/client/device/logout',
          {
            deviceCode: config.lastDeviceCode
          },
          config
        );
      } catch {
        // Keep logout resilient even when the control plane is offline.
      }
    }

    writeConfig({});
    console.log('Signed out from Devflow.');
    return;
  }

  if (command === 'config' && subcommand === 'set-provider') {
    const provider = rest[0];
    if (!provider) {
      throw new Error('Expected a provider name.');
    }
    const config = readConfig();
    writeConfig({
      ...config,
      provider
    });
    console.log(`Provider set to ${provider}.`);
    return;
  }

  if (command === 'review') {
    const config = readConfig();
    const flags = parseFlags([subcommand, ...rest].filter(Boolean));
    const source =
      flags.files.length > 0 ? 'selected_files' : flags.baseRef ? 'branch_compare' : 'local_diff';
    const request = buildReviewRequest({
      cwd: process.cwd(),
      source,
      baseRef: flags.baseRef,
      files: flags.files,
      staged: flags.staged,
      outputFormat: flags.json ? 'json' : flags.markdown ? 'markdown' : 'terminal',
      mode: flags.mode as never,
      localOnly: config.syncDefaults?.localOnlyDefault ?? false,
      cloudSyncEnabled: config.syncDefaults?.cloudSyncEnabled ?? Boolean(config.workspace),
      provider: config.provider ?? 'qwen',
      model: 'qwen-code',
      policy: config.policyVersionId
        ? {
            workspaceId: config.workspace?.id ?? 'ws_local',
            policySetId: 'seed-policy',
            policyVersionId: config.policyVersionId,
            name: 'Workspace Policy',
            version: config.policyVersionId,
            checksum: config.policyVersionId,
            publishedAt: new Date().toISOString(),
            summary: 'Workspace policy metadata loaded from the control plane.',
            checklist: [],
            rules: []
          }
        : undefined
    });
    const session = createReviewSession(request);
    appendHistory(session);

    if (!request.localOnly && request.cloudSyncEnabled) {
      try {
        await syncReviewToCloud(config, session);
      } catch (error) {
        console.log(
          `Cloud sync skipped: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (flags.json) {
      output(session, true);
      return;
    }

    if (flags.markdown) {
      console.log(renderMarkdownSession(session));
      return;
    }

    console.log(renderTerminalSession(request, session.findings));
    return;
  }

  if (command === 'history') {
    output(await loadHistory(readConfig()), false);
    return;
  }

  if (command === 'doctor') {
    output(await extendDoctorOutput(readConfig()), false);
    return;
  }

  if (command === 'explain') {
    const target = subcommand;
    if (!target) {
      throw new Error('Expected a file path.');
    }
    console.log(explainFile(target));
    return;
  }

  if (command === 'tests') {
    const target = subcommand;
    if (!target) {
      throw new Error('Expected a file path.');
    }
    console.log(generateTests(target));
    return;
  }

  printHelp();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
