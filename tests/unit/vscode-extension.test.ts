import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildWebUrl,
  escapeHtml,
  getDiffmintPaths,
  normalizeWebBaseUrl,
  readDiffmintConfig,
  readDiffmintHistory,
  renderResultHtml,
  tryParseJson
} from '../../apps/vscode/src/diffmint.ts';
import { renderHistoryCompareHtml, renderReviewSessionHtml } from '../../apps/vscode/src/render.ts';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'diffmint-vscode-test-'));
  tempDirs.push(dir);
  return dir;
}

describe('vscode extension helpers', () => {
  afterEach(async () => {
    while (tempDirs.length > 0) {
      await import('node:fs/promises').then(({ rm }) =>
        rm(tempDirs.pop()!, { recursive: true, force: true })
      );
    }
  });

  it('normalizes web base URLs and builds dashboard links', () => {
    expect(normalizeWebBaseUrl('https://diffmint.io/')).toBe('https://diffmint.io');
    expect(buildWebUrl('https://diffmint.io/', '/dashboard/policies')).toBe(
      'https://diffmint.io/dashboard/policies'
    );
  });

  it('reads local config and recent history entries from the Diffmint home directory', () => {
    const homeDir = makeTempDir();
    const diffmintHome = path.join(homeDir, '.diffmint');
    mkdirSync(diffmintHome, { recursive: true });

    const paths = getDiffmintPaths({
      HOME: homeDir
    } as NodeJS.ProcessEnv);

    writeFileSync(
      paths.configPath,
      JSON.stringify(
        {
          workspace: {
            id: 'ws_diffmint_core',
            name: 'Diffmint Core',
            slug: 'diffmint-core'
          },
          provider: 'qwen',
          policyVersionId: 'policy-v1'
        },
        null,
        2
      ),
      'utf8'
    );

    writeFileSync(
      paths.historyPath,
      [
        JSON.stringify({ traceId: 'trace-old', summary: 'Older review' }),
        JSON.stringify({ traceId: 'trace-new', summary: 'Newest review' })
      ].join('\n'),
      'utf8'
    );

    const config = readDiffmintConfig(paths.configPath);
    const history = readDiffmintHistory(paths.historyPath, 5);

    expect(config?.workspace?.slug).toBe('diffmint-core');
    expect(config?.provider).toBe('qwen');
    expect(history[0]?.traceId).toBe('trace-new');
    expect(history[1]?.traceId).toBe('trace-old');
  });

  it('escapes html before rendering result panels', () => {
    expect(escapeHtml('<diffmint>&')).toBe('&lt;diffmint&gt;&amp;');

    const html = renderResultHtml('Title <unsafe>', 'Body & details');
    expect(html).toContain('&lt;unsafe&gt;');
    expect(html).toContain('Body &amp; details');
  });

  it('parses valid json payloads and ignores invalid ones', () => {
    expect(tryParseJson<{ ok: boolean }>('{"ok":true}')).toEqual({ ok: true });
    expect(tryParseJson('{not-json}')).toBeNull();
  });

  it('renders review and history compare panels with finding excerpts', () => {
    const session = {
      id: 'review-1',
      traceId: 'trace-1',
      requestId: 'request-1',
      source: 'selected_files',
      commandSource: 'cli',
      provider: 'qwen',
      model: 'qwen-code',
      status: 'completed',
      summary: 'One finding recorded.',
      severityCounts: {
        critical: 0,
        high: 1,
        medium: 0,
        low: 0
      },
      findings: [
        {
          id: 'finding-1',
          severity: 'high',
          title: 'Sensitive route changed',
          summary: 'Route logic now returns different auth state.',
          filePath: 'apps/web/src/app/api/client/history/route.ts',
          line: 2,
          endLine: 2,
          excerpt: 'export const runtime = "nodejs";'
        }
      ],
      context: {
        sourceLabel: 'Selected Files',
        modeLabel: 'full',
        fileSummary: 'apps/web/src/app/api/client/history/route.ts',
        visibleFiles: ['apps/web/src/app/api/client/history/route.ts'],
        remainingFileCount: 0,
        fileGroups: [{ label: 'apps/web', count: 1 }],
        diffStats: { fileCount: 1, additions: 2, deletions: 0 }
      },
      durationMs: 200,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      artifacts: []
    };

    const reviewHtml = renderReviewSessionHtml(session);
    const compareHtml = renderHistoryCompareHtml(session, {
      ...session,
      traceId: 'trace-2',
      summary: 'Second review',
      findings: []
    });

    expect(reviewHtml).toContain('Sensitive route changed');
    expect(reviewHtml).toContain('route.ts:2');
    expect(reviewHtml).toContain('nodejs');
    expect(compareHtml).toContain('Finding Deltas');
    expect(compareHtml).toContain('trace-1');
    expect(compareHtml).toContain('trace-2');
  });
});
