import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const cliBin = fileURLToPath(new URL('../../apps/cli/bin/dm', import.meta.url));
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
  const repoDir = makeTempDir('diffmint-cli-repo-');
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
    'export const GET = () => new Response("ok");\nexport const runtime = "nodejs";\n',
    'utf8'
  );

  return { repoDir, filePath };
}

function runCli(args: string[], cwd: string, homeDir: string) {
  return spawnSync(cliBin, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      DIFFMINT_API_BASE_URL: 'http://127.0.0.1:65535',
      DIFFMINT_DEVICE_AUTH_TIMEOUT_MS: '500',
      DIFFMINT_REVIEW_RUNTIME: 'scaffold'
    }
  });
}

describe('diffmint cli', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('logs in and writes local config inside an isolated home directory', () => {
    const homeDir = makeTempDir('diffmint-cli-home-');
    const cwd = makeTempDir('diffmint-cli-cwd-');
    const result = runCli(['auth', 'login'], cwd, homeDir);
    const configPath = path.join(homeDir, '.diffmint', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      apiBaseUrl: string;
      workspace: { name: string };
    };

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Signed in to Diffmint.');
    expect(config.apiBaseUrl).toBe('http://127.0.0.1:65535');
    expect(config.workspace.name).toBe('Local Workspace');
  }, 10_000);

  it('persists provider selection and appends review history for markdown runs', () => {
    const homeDir = makeTempDir('diffmint-cli-home-');
    const { repoDir, filePath } = createRepoWithChangedFile();

    expect(runCli(['auth', 'login'], repoDir, homeDir).status).toBe(0);
    expect(runCli(['config', 'set-provider', 'qwen-enterprise'], repoDir, homeDir).status).toBe(0);

    const reviewResult = runCli(['review', '--files', filePath, '--markdown'], repoDir, homeDir);
    const historyTextResult = runCli(['history'], repoDir, homeDir);
    const historyJsonResult = runCli(['history', '--json'], repoDir, homeDir);
    const history = JSON.parse(historyJsonResult.stdout) as Array<{ provider: string }>;

    expect(reviewResult.status).toBe(0);
    expect(reviewResult.stdout).toContain('# Diffmint Review');
    expect(reviewResult.stdout).toContain('`qwen-enterprise`');
    expect(reviewResult.stdout).toContain('Sensitive control-plane surface changed');
    expect(historyTextResult.status).toBe(0);
    expect(historyTextResult.stdout).toContain('Diffmint History');
    expect(history).toHaveLength(1);
    expect(history[0]?.provider).toBe('qwen-enterprise');
  }, 15_000);

  it('supports history filtering and comparison output', () => {
    const homeDir = makeTempDir('diffmint-cli-home-');
    const { repoDir, filePath } = createRepoWithChangedFile();
    const docsPath = path.join(repoDir, 'packages/docs-content/content/cli/reference.mdx');

    expect(runCli(['auth', 'login'], repoDir, homeDir).status).toBe(0);
    expect(runCli(['review', '--files', filePath], repoDir, homeDir).status).toBe(0);

    mkdirSync(path.dirname(docsPath), { recursive: true });
    writeFileSync(docsPath, '# Docs\nUpdated guidance.\n', 'utf8');

    expect(
      runCli(
        ['review', '--files', 'packages/docs-content/content/cli/reference.mdx'],
        repoDir,
        homeDir
      ).status
    ).toBe(0);

    const filteredResult = runCli(
      ['history', '--query', 'Governance content changed', '--json'],
      repoDir,
      homeDir
    );
    const filtered = JSON.parse(filteredResult.stdout) as Array<{ traceId: string }>;
    const compareResult = runCli(['history', '--compare', 'latest', 'previous'], repoDir, homeDir);

    expect(filteredResult.status).toBe(0);
    expect(filtered).toHaveLength(1);
    expect(compareResult.status).toBe(0);
    expect(compareResult.stdout).toContain('Diffmint History Compare');
    expect(compareResult.stdout).toContain('Only in A:');
  }, 15_000);
});
