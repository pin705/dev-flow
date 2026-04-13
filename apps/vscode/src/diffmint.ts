import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ReviewContextSummary } from './types';

export interface DiffmintLocalWorkspace {
  id: string;
  name: string;
  slug?: string;
}

export interface DiffmintLocalConfig {
  apiBaseUrl?: string;
  provider?: string;
  model?: string;
  providerAuthMode?: 'remote' | 'codex' | 'antigravity' | 'api';
  providerApiKeyEnvVar?: string;
  workspace?: DiffmintLocalWorkspace;
  role?: string;
  policyVersionId?: string;
  syncDefaults?: {
    cloudSyncEnabled?: boolean;
    localOnlyDefault?: boolean;
    redactionEnabled?: boolean;
  };
  lastDeviceCode?: string;
  signedInAt?: string;
}

export interface DiffmintHistoryEntry {
  id?: string;
  traceId?: string;
  summary?: string;
  status?: string;
  commandSource?: string;
  source?: string;
  provider?: string;
  model?: string;
  policyVersionId?: string;
  severityCounts?: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
  };
  context?: ReviewContextSummary;
  startedAt?: string;
  completedAt?: string;
}

export function getDiffmintHome(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return path.join(home, '.diffmint');
}

export function getDiffmintPaths(env: NodeJS.ProcessEnv = process.env): {
  configPath: string;
  historyPath: string;
} {
  const basePath = getDiffmintHome(env);

  return {
    configPath: path.join(basePath, 'config.json'),
    historyPath: path.join(basePath, 'history.jsonl')
  };
}

export function normalizeWebBaseUrl(value?: string): string {
  const candidate = value?.trim() || 'https://diffmint.deplio.app';
  return candidate.endsWith('/') ? candidate.slice(0, -1) : candidate;
}

export function buildWebUrl(baseUrl: string, pathname: string): string {
  return new URL(
    pathname.startsWith('/') ? pathname : `/${pathname}`,
    normalizeWebBaseUrl(baseUrl)
  ).toString();
}

export function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      default:
        return char;
    }
  });
}

export function renderResultHtml(title: string, body: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: sans-serif; padding: 20px;">
    <h2>${escapeHtml(title)}</h2>
    <pre style="white-space: pre-wrap;">${escapeHtml(body)}</pre>
  </body>
</html>`;
}

export function tryParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function readDiffmintConfig(configPath: string): DiffmintLocalConfig | null {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as DiffmintLocalConfig;
  } catch {
    return null;
  }
}

export function readDiffmintHistory(historyPath: string, limit = 5): DiffmintHistoryEntry[] {
  if (!existsSync(historyPath)) {
    return [];
  }

  const entries = readFileSync(historyPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as DiffmintHistoryEntry];
      } catch {
        return [];
      }
    });

  return entries.reverse().slice(0, limit);
}
