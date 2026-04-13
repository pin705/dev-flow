import { execFileSync } from 'node:child_process';
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
  model?: string;
  providerAuthMode?: 'remote' | 'codex' | 'antigravity' | 'api';
  providerApiKeyEnvVar?: string;
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

interface LocalProviderSelection {
  provider: string;
  model: string;
  providerAuthMode: NonNullable<LocalConfig['providerAuthMode']>;
  providerApiKeyEnvVar?: string;
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

function tryExec(command: string, args: string[], cwd = process.cwd()): string | null {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function detectLocalApiKeySource(): string | undefined {
  const candidates = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'QWEN_API_KEY', 'DASHSCOPE_API_KEY'];

  return candidates.find((candidate) => process.env[candidate]?.trim());
}

function getDefaultModelForProvider(provider?: string): string {
  if (provider === 'codex') {
    return 'gpt-5-codex';
  }

  if (provider === 'antigravity') {
    return 'antigravity-agent';
  }

  if (
    provider === 'api' ||
    provider === 'openai-compatible' ||
    provider === 'anthropic-compatible'
  ) {
    return 'user-configured';
  }

  if (provider?.startsWith('qwen')) {
    return 'qwen-code';
  }

  return 'user-configured';
}

function inferProviderAuthMode(
  provider?: string,
  fallback: LocalConfig['providerAuthMode'] = 'api'
): LocalConfig['providerAuthMode'] {
  if (provider === 'codex') {
    return 'codex';
  }

  if (provider === 'antigravity') {
    return 'antigravity';
  }

  if (
    provider === 'api' ||
    provider === 'openai-compatible' ||
    provider === 'anthropic-compatible'
  ) {
    return 'api';
  }

  return fallback;
}

function resolveModelForProvider(config: LocalConfig, provider: string): string {
  const previousDefault = getDefaultModelForProvider(config.provider);
  const nextDefault = getDefaultModelForProvider(provider);

  if (!config.model || config.model === previousDefault) {
    return nextDefault;
  }

  return config.model;
}

function hasCodexLogin(cwd = process.cwd()): boolean {
  const loginStatus = tryExec('codex', ['login', 'status'], cwd);
  return Boolean(loginStatus && loginStatus.toLowerCase().startsWith('logged in'));
}

function hasAntigravityBinary(cwd = process.cwd()): boolean {
  return Boolean(tryExec('antigravity', ['--version'], cwd));
}

function hasRemoteControlPlaneSession(config: LocalConfig): boolean {
  return Boolean(config.workspace && config.lastDeviceCode);
}

function buildDefaultSyncDefaults(config: LocalConfig): NonNullable<LocalConfig['syncDefaults']> {
  return (
    config.syncDefaults ?? {
      cloudSyncEnabled: hasRemoteControlPlaneSession(config),
      localOnlyDefault: !hasRemoteControlPlaneSession(config),
      redactionEnabled: true
    }
  );
}

function getEffectiveProviderSelection(config: LocalConfig): LocalProviderSelection {
  if (config.provider && config.model && config.providerAuthMode) {
    return {
      provider: config.provider,
      model: config.model,
      providerAuthMode: config.providerAuthMode,
      providerApiKeyEnvVar: config.providerApiKeyEnvVar
    };
  }

  if (hasCodexLogin()) {
    return {
      provider: 'codex',
      model: config.model ?? getDefaultModelForProvider('codex'),
      providerAuthMode: 'codex'
    };
  }

  const apiKeyEnvVar = detectLocalApiKeySource();
  if (apiKeyEnvVar) {
    return {
      provider: 'api',
      model: config.model ?? getDefaultModelForProvider('api'),
      providerAuthMode: 'api',
      providerApiKeyEnvVar: apiKeyEnvVar
    };
  }

  if (hasAntigravityBinary()) {
    return {
      provider: 'antigravity',
      model: config.model ?? getDefaultModelForProvider('antigravity'),
      providerAuthMode: 'antigravity'
    };
  }

  const provider = config.provider ?? 'api';

  return {
    provider,
    model: config.model ?? getDefaultModelForProvider(provider),
    providerAuthMode: config.providerAuthMode ?? inferProviderAuthMode(provider),
    providerApiKeyEnvVar: config.providerApiKeyEnvVar
  };
}

function buildConfiguredLocalConfig(
  config: LocalConfig,
  selection: LocalProviderSelection
): LocalConfig {
  return {
    ...config,
    apiBaseUrl: getApiBaseUrl(config),
    workspace: config.workspace ?? {
      id: 'ws_local',
      name: 'Local Workspace'
    },
    provider: selection.provider,
    model: selection.model,
    providerAuthMode: selection.providerAuthMode,
    providerApiKeyEnvVar: selection.providerApiKeyEnvVar,
    syncDefaults: buildDefaultSyncDefaults(config),
    signedInAt: new Date().toISOString()
  };
}

function buildCodexLocalConfig(config: LocalConfig): LocalConfig {
  const codexVersion = tryExec('codex', ['--version']);

  if (!codexVersion) {
    throw new Error(
      'Codex CLI was not detected. Install Codex before running `dm auth login codex`.'
    );
  }

  if (!hasCodexLogin()) {
    throw new Error('Codex CLI is installed but not authenticated. Run `codex login` first.');
  }

  return buildConfiguredLocalConfig(config, {
    provider: 'codex',
    model: config.provider === 'codex' ? (config.model ?? 'gpt-5-codex') : 'gpt-5-codex',
    providerAuthMode: 'codex'
  });
}

function buildAntigravityLocalConfig(config: LocalConfig): LocalConfig {
  if (!hasAntigravityBinary()) {
    throw new Error(
      'Antigravity was not detected. Install Antigravity before running `dm auth login antigravity`.'
    );
  }

  return buildConfiguredLocalConfig(config, {
    provider: 'antigravity',
    model:
      config.provider === 'antigravity'
        ? (config.model ?? 'antigravity-agent')
        : 'antigravity-agent',
    providerAuthMode: 'antigravity'
  });
}

function buildApiLocalConfig(config: LocalConfig, explicitEnvVar?: string): LocalConfig {
  const apiKeyEnvVar = explicitEnvVar ?? detectLocalApiKeySource();

  if (!apiKeyEnvVar) {
    throw new Error(
      'No local API key detected. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, QWEN_API_KEY, or DASHSCOPE_API_KEY before running `dm auth login api`.'
    );
  }

  if (!process.env[apiKeyEnvVar]?.trim()) {
    throw new Error(`Environment variable ${apiKeyEnvVar} is not set.`);
  }

  return buildConfiguredLocalConfig(config, {
    provider: 'api',
    model: config.provider === 'api' ? (config.model ?? 'user-configured') : 'user-configured',
    providerAuthMode: 'api',
    providerApiKeyEnvVar: apiKeyEnvVar
  });
}

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
  return config.apiBaseUrl ?? process.env.DIFFMINT_API_BASE_URL ?? 'https://diffmint.deplio.app';
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
    model: bootstrap.provider.defaultModel,
    providerAuthMode: 'remote',
    providerApiKeyEnvVar: undefined,
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
  return buildConfiguredLocalConfig(config, getEffectiveProviderSelection(config));
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
    !hasRemoteControlPlaneSession(config) ||
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
  if (
    !config.workspace ||
    !hasRemoteControlPlaneSession(config) ||
    config.syncDefaults?.cloudSyncEnabled === false
  ) {
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
  if (!config.workspace || !hasRemoteControlPlaneSession(config)) {
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
  const providerSelection = getEffectiveProviderSelection(config);
  const extendedChecks: DoctorCheck[] = [
    ...checks,
    {
      id: 'config',
      label: 'Local config',
      status: config.signedInAt ? 'ok' : 'warn',
      detail: config.signedInAt
        ? `Signed in to ${config.workspace?.name ?? 'unknown workspace'}`
        : 'Run `dm auth login`, `dm auth login codex`, `dm auth login antigravity`, or `dm auth login api`.'
    },
    {
      id: 'selected-provider',
      label: 'Selected provider',
      status: providerSelection.provider ? 'ok' : 'warn',
      detail: [
        `Provider ${providerSelection.provider}`,
        `mode ${providerSelection.providerAuthMode}`,
        `model ${providerSelection.model}`,
        providerSelection.providerApiKeyEnvVar
          ? `key ${providerSelection.providerApiKeyEnvVar}`
          : undefined
      ]
        .filter(Boolean)
        .join(' · ')
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

  if (!config.apiBaseUrl || !hasRemoteControlPlaneSession(config)) {
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
    const loginMode = rest[0];
    let nextConfig: LocalConfig;

    if (
      loginMode &&
      loginMode !== 'remote' &&
      loginMode !== 'codex' &&
      loginMode !== 'antigravity' &&
      loginMode !== 'api'
    ) {
      throw new Error(`Unknown login mode "${loginMode}".`);
    }

    if (loginMode === 'codex') {
      nextConfig = buildCodexLocalConfig(config);
      console.log('Configured local Codex auth. Diffmint will keep provider auth on this machine.');
    } else if (loginMode === 'antigravity') {
      nextConfig = buildAntigravityLocalConfig(config);
      console.log(
        'Configured local Antigravity auth. Diffmint will keep provider auth on this machine.'
      );
    } else if (loginMode === 'api') {
      nextConfig = buildApiLocalConfig(config, rest[1]);
      console.log(
        'Configured local API-key auth. Diffmint will keep provider keys on this machine only.'
      );
    } else {
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
    }

    writeConfig(nextConfig);
    if (
      nextConfig.workspace &&
      nextConfig.syncDefaults?.cloudSyncEnabled !== false &&
      hasRemoteControlPlaneSession(nextConfig)
    ) {
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
    if (nextConfig.model) {
      console.log(`Model: ${nextConfig.model}`);
    }
    if (nextConfig.providerAuthMode) {
      console.log(`Auth mode: ${nextConfig.providerAuthMode}`);
    }
    if (nextConfig.providerApiKeyEnvVar) {
      console.log(`API key env: ${nextConfig.providerApiKeyEnvVar}`);
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
      provider,
      model: resolveModelForProvider(config, provider),
      providerAuthMode: inferProviderAuthMode(provider, config.providerAuthMode),
      providerApiKeyEnvVar:
        inferProviderAuthMode(provider, config.providerAuthMode) === 'api'
          ? (config.providerApiKeyEnvVar ?? detectLocalApiKeySource())
          : undefined
    });
    console.log(`Provider set to ${provider}.`);
    return;
  }

  if (command === 'config' && subcommand === 'set-model') {
    const model = rest[0];
    if (!model) {
      throw new Error('Expected a model name.');
    }
    const config = readConfig();
    writeConfig({
      ...config,
      model
    });
    console.log(`Model set to ${model}.`);
    return;
  }

  if (command === 'review') {
    const config = readConfig();
    const providerSelection = getEffectiveProviderSelection(config);
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
      localOnly: config.syncDefaults?.localOnlyDefault ?? !hasRemoteControlPlaneSession(config),
      cloudSyncEnabled:
        config.syncDefaults?.cloudSyncEnabled ?? hasRemoteControlPlaneSession(config),
      provider: providerSelection.provider,
      model: providerSelection.model,
      policy
    });
    const session = await createReviewSessionWithRuntime(request, {
      cwd: process.cwd(),
      provider: providerSelection.provider,
      model: providerSelection.model,
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
