import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const cliBin = fileURLToPath(new URL('../../apps/cli/bin/devflow', import.meta.url));
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
  const repoDir = makeTempDir('devflow-cli-repo-');
  const absoluteFilePath = path.join(repoDir, filePath);

  runGit(repoDir, ['init']);
  runGit(repoDir, ['config', 'user.email', 'devflow@example.com']);
  runGit(repoDir, ['config', 'user.name', 'Devflow Tests']);

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
      DEVFLOW_API_BASE_URL: 'http://127.0.0.1:65535',
      DEVFLOW_DEVICE_AUTH_TIMEOUT_MS: '500'
    }
  });
}

describe('devflow cli', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('logs in and writes local config inside an isolated home directory', () => {
    const homeDir = makeTempDir('devflow-cli-home-');
    const cwd = makeTempDir('devflow-cli-cwd-');
    const result = runCli(['auth', 'login'], cwd, homeDir);
    const configPath = path.join(homeDir, '.devflow', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      apiBaseUrl: string;
      workspace: { name: string };
    };

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Signed in to Devflow.');
    expect(config.apiBaseUrl).toBe('http://127.0.0.1:65535');
    expect(config.workspace.name).toBe('Local Workspace');
  });

  it('persists provider selection and appends review history for markdown runs', () => {
    const homeDir = makeTempDir('devflow-cli-home-');
    const { repoDir, filePath } = createRepoWithChangedFile();

    expect(runCli(['auth', 'login'], repoDir, homeDir).status).toBe(0);
    expect(runCli(['config', 'set-provider', 'qwen-enterprise'], repoDir, homeDir).status).toBe(0);

    const reviewResult = runCli(['review', '--files', filePath, '--markdown'], repoDir, homeDir);
    const historyResult = runCli(['history'], repoDir, homeDir);
    const history = JSON.parse(historyResult.stdout) as Array<{ provider: string }>;

    expect(reviewResult.status).toBe(0);
    expect(reviewResult.stdout).toContain('# Devflow Review');
    expect(reviewResult.stdout).toContain('`qwen-enterprise`');
    expect(reviewResult.stdout).toContain('Sensitive control-plane surface changed');
    expect(history).toHaveLength(1);
    expect(history[0]?.provider).toBe('qwen-enterprise');
  });
});
