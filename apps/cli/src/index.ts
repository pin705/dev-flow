import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type {
  ClientInstallation,
  DeviceAuthSession,
  ReviewSession,
  UsageEvent,
  WorkspaceBootstrap
} from '@diffmint/contracts';
import {
  buildReviewRequest,
  createReviewSessionWithRuntime,
  type DoctorCheck,
  inspectReviewConvention,
  renderMarkdownSession,
  renderTerminalSession,
  runDoctor
} from '@diffmint/review-core';
import { sanitizeReviewSessionForCloudSync } from '@diffmint/review-core';
import {
  filterHistorySessions,
  findHistorySessionBySelector,
  type HistoryCompareOptions,
  type HistoryFilterOptions
} from './history';
import {
  renderCliHelp,
  renderDoctorChecks,
  renderExplainOutput,
  renderHistoryComparison,
  renderHistorySessions,
  renderSuggestedTests
} from './presentation';

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

interface SyncQueueEntry {
  id: string;
  workspaceId: string;
  pathname: '/api/client/history' | '/api/client/usage';
  body: ReviewSession | Omit<UsageEvent, 'id' | 'createdAt'>;
}

const DIFFMINT_HOME = path.join(homedir(), '.diffmint');
const CONFIG_PATH = path.join(DIFFMINT_HOME, 'config.json');
const HISTORY_PATH = path.join(DIFFMINT_HOME, 'history.jsonl');
const SYNC_QUEUE_PATH = path.join(DIFFMINT_HOME, 'sync-queue.json');
const CLI_VERSION = (() => {
  try {
    const packageJsonUrl = new URL('../package.json', import.meta.url);
    const packageJson = JSON.parse(readFileSync(packageJsonUrl, 'utf8')) as { version?: string };
    return packageJson.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
})();

function ensureHome(): void {
  mkdirSync(DIFFMINT_HOME, { recursive: true });
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

function appendHistory(record: ReviewSession): void {
  ensureHome();
  const prefix = existsSync(HISTORY_PATH) ? readFileSync(HISTORY_PATH, 'utf8') : '';
  const next = `${prefix}${JSON.stringify(record)}\n`;
  writeFileSync(HISTORY_PATH, next, 'utf8');
}

function readHistory(): ReviewSession[] {
  ensureHome();
  if (!existsSync(HISTORY_PATH)) {
    return [];
  }

  return readFileSync(HISTORY_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ReviewSession);
}

function readSyncQueue(): SyncQueueEntry[] {
  ensureHome();
  if (!existsSync(SYNC_QUEUE_PATH)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(SYNC_QUEUE_PATH, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as SyncQueueEntry[]) : [];
  } catch {
    return [];
  }
}

function writeSyncQueue(entries: SyncQueueEntry[]): void {
  ensureHome();
  writeFileSync(SYNC_QUEUE_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');
}

function getSyncQueueSize(): number {
  return readSyncQueue().length;
}

function appendSyncQueue(entries: SyncQueueEntry[]): number {
  const nextEntries = [...readSyncQueue(), ...entries];
  writeSyncQueue(nextEntries);
  return nextEntries.length;
}

function printHelp(): void {
  console.log(renderCliHelp());
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

function parseHistoryFlags(args: string[]): {
  json: boolean;
  provider?: string;
  policy?: string;
  source?: string;
  query?: string;
  limit?: number;
  compare?: HistoryCompareOptions;
} {
  const flags: {
    json: boolean;
    provider?: string;
    policy?: string;
    source?: string;
    query?: string;
    limit?: number;
    compare?: HistoryCompareOptions;
  } = {
    json: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      flags.json = true;
      continue;
    }

    if (arg === '--provider') {
      flags.provider = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--policy') {
      flags.policy = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--source') {
      flags.source = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--query') {
      flags.query = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      const value = Number(args[index + 1]);
      flags.limit = Number.isFinite(value) && value > 0 ? value : undefined;
      index += 1;
      continue;
    }

    if (arg === '--compare') {
      const leftSelector = args[index + 1];
      const rightSelector = args[index + 2];
      if (leftSelector && rightSelector) {
        flags.compare = {
          leftSelector,
          rightSelector
        };
      }
      index += 2;
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

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function getApiBaseUrl(config: LocalConfig): string {
  return config.apiBaseUrl ?? process.env.DIFFMINT_API_BASE_URL ?? 'https://diffmint.io';
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    const requestId = response.headers.get('x-diffmint-request-id');

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        detail = payload.error;
      }
    } catch {
      // Ignore invalid JSON and fall back to HTTP status detail.
    }

    if (requestId) {
      detail = `${detail} (request: ${requestId})`;
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

function getClientChannel(): ClientInstallation['channel'] {
  const value = process.env.DIFFMINT_RELEASE_CHANNEL;

  if (value === 'preview' || value === 'canary') {
    return value;
  }

  return 'stable';
}

function buildClientInstallationPayload(): Omit<
  ClientInstallation,
  'id' | 'lastSeenAt' | 'workspaceId'
> {
  return {
    clientType: 'cli',
    platform: `${process.platform}-${process.arch}`,
    version: CLI_VERSION,
    channel: getClientChannel()
  };
}

async function registerClientInstallationRemote(config: LocalConfig): Promise<void> {
  if (!config.workspace || !config.lastDeviceCode) {
    return;
  }

  try {
    await postApi(
      getApiBaseUrl(config),
      '/api/client/installations',
      buildClientInstallationPayload(),
      config
    );
  } catch {
    // Keep CLI login and local workflows resilient if telemetry registration fails.
  }
}

async function waitForDeviceApproval(
  baseUrl: string,
  session: DeviceAuthSession
): Promise<DeviceAuthSession> {
  const timeoutMs = Number(process.env.DIFFMINT_DEVICE_AUTH_TIMEOUT_MS ?? 10_000);
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
  const nextConfig = {
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
  } satisfies LocalConfig;

  await registerClientInstallationRemote(nextConfig);

  return nextConfig;
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

function buildSyncQueueEntries(config: LocalConfig, session: ReviewSession): SyncQueueEntry[] {
  if (!config.workspace) {
    return [];
  }

  const syncedSession =
    config.syncDefaults?.redactionEnabled === false
      ? session
      : sanitizeReviewSessionForCloudSync(session);
  const reviewPayload: ReviewSession = {
    ...syncedSession,
    workspaceId: config.workspace.id
  };
  const usagePayload: Omit<UsageEvent, 'id' | 'createdAt'> = {
    workspaceId: config.workspace.id,
    source: session.commandSource,
    event: 'sync.uploaded',
    metadata: {
      traceId: session.traceId
    }
  };

  return [
    {
      id: `sync-${randomUUID()}`,
      workspaceId: config.workspace.id,
      pathname: '/api/client/history',
      body: reviewPayload
    },
    {
      id: `sync-${randomUUID()}`,
      workspaceId: config.workspace.id,
      pathname: '/api/client/usage',
      body: usagePayload
    }
  ];
}

async function flushSyncQueue(
  config: LocalConfig
): Promise<{ flushed: number; remaining: number; error?: string }> {
  const queuedEntries = readSyncQueue();

  if (
    queuedEntries.length === 0 ||
    !config.workspace ||
    config.syncDefaults?.cloudSyncEnabled === false
  ) {
    return {
      flushed: 0,
      remaining: queuedEntries.length
    };
  }

  const apiBaseUrl = getApiBaseUrl(config);
  const nextQueue: SyncQueueEntry[] = [];
  let flushed = 0;

  for (let index = 0; index < queuedEntries.length; index += 1) {
    const entry = queuedEntries[index];

    if (entry.workspaceId !== config.workspace.id) {
      nextQueue.push(entry);
      continue;
    }

    try {
      await postApi(apiBaseUrl, entry.pathname, entry.body, config);
      flushed += 1;
    } catch (error) {
      nextQueue.push(entry, ...queuedEntries.slice(index + 1));
      writeSyncQueue(nextQueue);
      return {
        flushed,
        remaining: nextQueue.length,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  writeSyncQueue(nextQueue);

  return {
    flushed,
    remaining: nextQueue.length
  };
}

async function syncReviewToCloud(
  config: LocalConfig,
  session: ReviewSession
): Promise<{ flushed: number; queued: boolean; queueSize: number }> {
  if (!config.workspace || config.syncDefaults?.cloudSyncEnabled === false) {
    return {
      flushed: 0,
      queued: false,
      queueSize: getSyncQueueSize()
    };
  }

  const flushResult = await flushSyncQueue(config);
  if (flushResult.error) {
    const queueSize = appendSyncQueue(buildSyncQueueEntries(config, session));
    throw new Error(
      `Queued review for later sync: ${flushResult.error}. ${queueSize} queued item(s) waiting.`
    );
  }

  const apiBaseUrl = getApiBaseUrl(config);
  const payload: ReviewSession = {
    ...(config.syncDefaults?.redactionEnabled === false
      ? session
      : sanitizeReviewSessionForCloudSync(session)),
    workspaceId: config.workspace.id
  };

  try {
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
  } catch (error) {
    const queueSize = appendSyncQueue(buildSyncQueueEntries(config, session));
    throw new Error(
      `Queued review for later sync: ${
        error instanceof Error ? error.message : String(error)
      }. ${queueSize} queued item(s) waiting.`
    );
  }

  return {
    flushed: flushResult.flushed,
    queued: false,
    queueSize: flushResult.remaining
  };
}

async function loadHistory(config: LocalConfig): Promise<ReviewSession[]> {
  if (!config.workspace) {
    return readHistory();
  }

  try {
    await flushSyncQueue(config);
    const payload = await fetchApi<{ items: ReviewSession[] }>(
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

async function extendDoctorOutput(config: LocalConfig): Promise<DoctorCheck[]> {
  const checks = runDoctor(process.cwd());
  const queueSize = getSyncQueueSize();
  const convention = inspectReviewConvention(process.cwd());
  const extendedChecks: DoctorCheck[] = [
    ...checks,
    {
      id: 'config',
      label: 'Local config',
      status: config.signedInAt ? 'ok' : 'warn',
      detail: config.signedInAt
        ? `Signed in to ${config.workspace?.name ?? 'unknown workspace'}`
        : 'Run `dm auth login` to connect a workspace.'
    },
    {
      id: 'sync-queue',
      label: 'Sync queue',
      status: queueSize === 0 ? 'ok' : 'warn',
      detail:
        queueSize === 0
          ? 'No queued sync items.'
          : `${queueSize} queued sync item(s) waiting for the control plane.`
    },
    {
      id: 'review-convention',
      label: 'Review convention',
      status:
        convention.status === 'loaded' ? 'ok' : convention.status === 'invalid' ? 'warn' : 'ok',
      detail: convention.detail
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
    const controlPlaneCheck: DoctorCheck = {
      id: 'control-plane',
      label: 'Control plane',
      status: 'ok',
      detail: `Connected to ${bootstrap.workspace.name} via ${config.apiBaseUrl}`
    };

    return [...extendedChecks, controlPlaneCheck];
  } catch (error) {
    const controlPlaneCheck: DoctorCheck = {
      id: 'control-plane',
      label: 'Control plane',
      status: 'warn',
      detail:
        error instanceof Error
          ? `Configured but unreachable: ${error.message}`
          : 'Configured but unreachable.'
    };

    return [...extendedChecks, controlPlaneCheck];
  }
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
    if (nextConfig.workspace && nextConfig.syncDefaults?.cloudSyncEnabled !== false) {
      const flushResult = await flushSyncQueue(nextConfig);
      if (flushResult.flushed > 0) {
        console.log(`Flushed ${flushResult.flushed} queued sync item(s).`);
      }
      if (flushResult.error) {
        console.log(`Queued sync items still pending: ${flushResult.error}`);
      }
    }
    console.log(`Signed in to Diffmint.`);
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
    console.log('Signed out from Diffmint.');
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
    const policy = config.policyVersionId
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
      : undefined;
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
      policy
    });
    const session = await createReviewSessionWithRuntime(request, {
      cwd: process.cwd(),
      provider: config.provider ?? 'qwen',
      model: 'qwen-code',
      policy
    });
    appendHistory(session);

    if (!request.localOnly && request.cloudSyncEnabled) {
      try {
        await syncReviewToCloud(config, session);
      } catch (error) {
        const message = `Cloud sync skipped: ${error instanceof Error ? error.message : String(error)}`;

        if (flags.json) {
          console.error(message);
        } else {
          console.log(message);
        }
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
    const historyArgs = [subcommand, ...rest].filter(Boolean);
    const flags = parseHistoryFlags(historyArgs);
    const history = await loadHistory(readConfig());
    const filteredHistory = filterHistorySessions(history, {
      provider: flags.provider,
      policy: flags.policy,
      source: flags.source,
      query: flags.query,
      limit: flags.limit
    } satisfies HistoryFilterOptions);

    if (flags.compare) {
      const left = findHistorySessionBySelector(filteredHistory, flags.compare.leftSelector);
      const right = findHistorySessionBySelector(filteredHistory, flags.compare.rightSelector);

      if (!left || !right) {
        throw new Error(
          `Unable to resolve history comparison targets: ${flags.compare.leftSelector}, ${flags.compare.rightSelector}`
        );
      }

      if (flags.json) {
        output({ left, right }, true);
      } else {
        console.log(renderHistoryComparison(left, right));
      }
      return;
    }

    if (flags.json) {
      output(filteredHistory, true);
    } else {
      console.log(renderHistorySessions(filteredHistory));
    }
    return;
  }

  if (command === 'doctor') {
    const checks = await extendDoctorOutput(readConfig());
    if (hasFlag([subcommand, ...rest].filter(Boolean), '--json')) {
      output(checks, true);
      return;
    }

    console.log(renderDoctorChecks(checks));
    return;
  }

  if (command === 'explain') {
    const target = subcommand;
    if (!target) {
      throw new Error('Expected a file path.');
    }
    const absolute = path.resolve(process.cwd(), target);
    const source = readFileSync(absolute, 'utf8');
    console.log(renderExplainOutput(target, source));
    return;
  }

  if (command === 'tests') {
    const target = subcommand;
    if (!target) {
      throw new Error('Expected a file path.');
    }
    console.log(renderSuggestedTests(target));
    return;
  }

  printHelp();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
