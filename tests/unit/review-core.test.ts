import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildReviewRequest,
  createReviewSession,
  createReviewSessionWithRuntime,
  renderMarkdownSession,
  renderTerminalSession,
  sanitizeReviewSessionForCloudSync,
  runDoctor
} from '../../packages/review-core/src/index.ts';

const tempDirs: string[] = [];

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

function createRepoWithChangedFile(filePath = 'src/auth/route.ts'): {
  repoDir: string;
  filePath: string;
} {
  const repoDir = makeTempDir('diffmint-review-core-');
  const absoluteFilePath = path.join(repoDir, filePath);

  runGit(repoDir, ['init']);
  runGit(repoDir, ['config', 'user.email', 'team@diffmint.io']);
  runGit(repoDir, ['config', 'user.name', 'Diffmint Tests']);

  mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
  writeFileSync(absoluteFilePath, 'export const GET = () => new Response("ok");\n', 'utf8');
  runGit(repoDir, ['add', '.']);
  runGit(repoDir, ['commit', '-m', 'init']);

  writeFileSync(
    absoluteFilePath,
    'export const GET = () => new Response("ok");\nexport const dynamic = "force-dynamic";\n',
    'utf8'
  );

  return { repoDir, filePath };
}

describe('review core', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('builds a review request from a changed git file selection', () => {
    const { repoDir, filePath } = createRepoWithChangedFile();
    const request = buildReviewRequest({
      cwd: repoDir,
      source: 'selected_files',
      files: [filePath],
      mode: 'security',
      outputFormat: 'markdown'
    });

    expect(request.files).toEqual([filePath]);
    expect(request.mode).toBe('security');
    expect(request.diff).toContain(`b/${filePath}`);
    expect(request.metadata.gitBranch).toBeDefined();
    expect(request.metadata.context?.fileSummary).toContain(filePath);
    expect(request.metadata.context?.fileGroups).toEqual([{ label: 'src', count: 1 }]);
  });

  it('normalizes absolute file selections and loads workspace review conventions', () => {
    const { repoDir, filePath } = createRepoWithChangedFile('apps/web/src/app/api/health/route.ts');
    const absoluteFilePath = path.join(repoDir, filePath);
    const conventionDir = path.join(repoDir, '.diffmint');

    mkdirSync(conventionDir, { recursive: true });
    writeFileSync(
      path.join(conventionDir, 'review-conventions.json'),
      JSON.stringify(
        {
          promptProfile: 'diffmint-team-web-v2',
          additionalPriorities: ['Prefer crisp, non-duplicated findings.'],
          reviewNotes: ['Surface route and auth regressions before style feedback.'],
          snippetContextLines: 1,
          maxVisibleFiles: 3,
          maxFileGroups: 2
        },
        null,
        2
      ),
      'utf8'
    );

    const request = buildReviewRequest({
      cwd: repoDir,
      source: 'selected_files',
      files: [absoluteFilePath]
    });

    expect(request.files).toEqual([filePath]);
    expect(request.promptProfile).toBe('diffmint-team-web-v2');
    expect(request.metadata.convention?.source).toBe('workspace-file');
    expect(request.metadata.convention?.snippetContextLines).toBe(1);
    expect(request.metadata.context?.visibleFiles).toEqual([filePath]);
  });

  it('creates governance-aware findings and markdown output', () => {
    const { repoDir, filePath } = createRepoWithChangedFile();
    const request = buildReviewRequest({
      cwd: repoDir,
      source: 'selected_files',
      files: [filePath],
      provider: 'qwen-enterprise'
    });
    const session = createReviewSession(request);
    const markdown = renderMarkdownSession(session);

    expect(session.provider).toBe('qwen-enterprise');
    expect(session.severityCounts.high).toBe(1);
    expect(session.severityCounts.medium).toBeGreaterThanOrEqual(1);
    expect(session.findings[0]?.line).toBeGreaterThan(0);
    expect(session.findings[0]?.excerpt).toContain('force-dynamic');
    expect(markdown).toContain('# Diffmint Review');
    expect(markdown).toContain('## Context');
    expect(markdown).toContain('File groups: src (1)');
    expect(markdown).toContain('```text');
    expect(markdown).toContain('Sensitive control-plane surface changed');

    const terminal = renderTerminalSession(request, session.findings);
    expect(terminal).toContain('Code:');
    expect(terminal).toContain('force-dynamic');
  });

  it('redacts sensitive values and omits raw provider output for cloud sync', () => {
    const sanitized = sanitizeReviewSessionForCloudSync({
      id: 'review-redacted',
      traceId: 'trace-redacted',
      requestId: 'request-redacted',
      source: 'selected_files',
      commandSource: 'cli',
      provider: 'qwen',
      model: 'qwen-code',
      status: 'completed',
      findings: [
        {
          id: 'finding-redacted',
          severity: 'high',
          title: 'Leaked token sk_live_12345678901234567890',
          summary: 'Authorization header was Bearer token-value-1234567890',
          suggestedAction: 'Rotate api_key=secret-value immediately.'
        }
      ],
      summary: 'Found github_pat_123456789012345678901234567890 in the report.',
      severityCounts: {
        low: 0,
        medium: 0,
        high: 1,
        critical: 0
      },
      durationMs: 100,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      artifacts: [
        {
          id: 'artifact-raw',
          kind: 'raw-provider-output',
          label: 'Qwen Headless Output',
          mimeType: 'application/json',
          content: '{"apiKey":"sk_live_12345678901234567890"}',
          storageKey: 'provider-output/sk_live_12345678901234567890'
        },
        {
          id: 'artifact-terminal',
          kind: 'terminal',
          label: 'Terminal Summary',
          mimeType: 'text/plain',
          content: 'Bearer token-value-1234567890\nclient_secret=abc123'
        }
      ]
    });

    expect(sanitized.summary).toContain('[REDACTED GITHUB TOKEN]');
    expect(sanitized.findings[0]?.title).toContain('[REDACTED API KEY]');
    expect(sanitized.findings[0]?.summary).toContain('Bearer [REDACTED]');
    expect(sanitized.findings[0]?.suggestedAction).toContain('api_key=[REDACTED]');
    expect(sanitized.artifacts[0]?.content).toBe(
      '[REDACTED raw provider output omitted from cloud sync]'
    );
    expect(sanitized.artifacts[0]?.mimeType).toBe('text/plain');
    expect(sanitized.artifacts[1]?.content).toContain('Bearer [REDACTED]');
    expect(sanitized.artifacts[1]?.content).toContain('client_secret=[REDACTED]');
  });

  it('keeps runtime execution deterministic in scaffold mode', async () => {
    const originalRuntime = process.env.DIFFMINT_REVIEW_RUNTIME;
    process.env.DIFFMINT_REVIEW_RUNTIME = 'scaffold';

    const { repoDir, filePath } = createRepoWithChangedFile();

    try {
      const request = buildReviewRequest({
        cwd: repoDir,
        source: 'selected_files',
        files: [filePath]
      });
      const session = await createReviewSessionWithRuntime(request, {
        cwd: repoDir
      });

      expect(session.summary).toContain('Generated');
      expect(session.severityCounts.high).toBe(1);
      expect(session.artifacts.some((artifact) => artifact.kind === 'raw-provider-output')).toBe(
        false
      );
    } finally {
      if (originalRuntime === undefined) {
        delete process.env.DIFFMINT_REVIEW_RUNTIME;
      } else {
        process.env.DIFFMINT_REVIEW_RUNTIME = originalRuntime;
      }
    }
  });

  it('uses the Qwen headless runtime when a compatible binary is available', async () => {
    const originalRuntime = process.env.DIFFMINT_REVIEW_RUNTIME;
    const originalPath = process.env.PATH;
    process.env.DIFFMINT_REVIEW_RUNTIME = 'qwen';

    const { repoDir, filePath } = createRepoWithChangedFile('src/feature.ts');
    const binDir = makeTempDir('diffmint-qwen-bin-');
    const qwenPath = path.join(binDir, 'qwen');

    writeFileSync(
      qwenPath,
      [
        '#!/bin/sh',
        'if [ "$1" = "--version" ]; then',
        '  echo "qwen test 0.0.1"',
        '  exit 0',
        'fi',
        'cat >/dev/null',
        `printf '%s' '${JSON.stringify([
          {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    summary: 'Runtime review completed through Qwen headless mode.',
                    findings: [
                      {
                        severity: 'critical',
                        title: 'Runtime finding',
                        summary: 'The mocked Qwen runtime produced a structured finding.',
                        filePath,
                        suggestedAction: 'Add verification before merge.'
                      }
                    ]
                  })
                }
              ]
            }
          }
        ])}'`
      ].join('\n'),
      { encoding: 'utf8', mode: 0o755 }
    );

    process.env.PATH = `${binDir}:${originalPath ?? ''}`;

    try {
      const request = buildReviewRequest({
        cwd: repoDir,
        source: 'selected_files',
        files: [filePath],
        provider: 'qwen'
      });
      const session = await createReviewSessionWithRuntime(request, {
        cwd: repoDir,
        provider: 'qwen',
        model: 'qwen-code'
      });

      expect(session.summary).toBe('Runtime review completed through Qwen headless mode.');
      expect(session.severityCounts.critical).toBe(1);
      expect(session.findings[0]?.title).toBe('Runtime finding');
      expect(session.artifacts.some((artifact) => artifact.kind === 'raw-provider-output')).toBe(
        true
      );
    } finally {
      if (originalRuntime === undefined) {
        delete process.env.DIFFMINT_REVIEW_RUNTIME;
      } else {
        process.env.DIFFMINT_REVIEW_RUNTIME = originalRuntime;
      }

      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
    }
  });

  it('reports the configured API base URL in doctor output', () => {
    const originalBaseUrl = process.env.DIFFMINT_API_BASE_URL;
    process.env.DIFFMINT_API_BASE_URL = 'http://localhost:3000';

    try {
      const checks = runDoctor(process.cwd());
      const gitCheck = checks.find((check) => check.id === 'git');
      const apiCheck = checks.find((check) => check.id === 'api');

      expect(gitCheck?.status).toBe('ok');
      expect(apiCheck?.status).toBe('ok');
      expect(apiCheck?.detail).toBe('http://localhost:3000');
    } finally {
      if (originalBaseUrl === undefined) {
        delete process.env.DIFFMINT_API_BASE_URL;
      } else {
        process.env.DIFFMINT_API_BASE_URL = originalBaseUrl;
      }
    }
  });
});
