import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureManagedCliInstalled,
  isManagedCliInstalled,
  readBundledCliVersion,
  resolveManagedCliInstallPaths
} from '../../apps/vscode/src/managed-cli.ts';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'diffmint-managed-cli-test-'));
  tempDirs.push(dir);
  return dir;
}

function createBundledCliFixture(extensionPath: string, version = '1.2.3'): void {
  const bundleRoot = path.join(extensionPath, 'dist', 'managed-cli');
  mkdirSync(path.join(bundleRoot, 'cli'), { recursive: true });
  writeFileSync(
    path.join(bundleRoot, 'package.json'),
    JSON.stringify({ version }, null, 2),
    'utf8'
  );
  writeFileSync(path.join(bundleRoot, 'cli', 'index.mjs'), 'console.log("diffmint");\n', 'utf8');
}

describe('managed vscode cli bundle', () => {
  afterEach(async () => {
    while (tempDirs.length > 0) {
      await import('node:fs/promises').then(({ rm }) =>
        rm(tempDirs.pop()!, { recursive: true, force: true })
      );
    }
  });

  it('reads the bundled cli version and computes install paths in ~/.diffmint', async () => {
    const extensionPath = makeTempDir();
    const homeDir = makeTempDir();
    createBundledCliFixture(extensionPath, '2.0.0');

    expect(await readBundledCliVersion(extensionPath)).toBe('2.0.0');

    const paths = await resolveManagedCliInstallPaths(extensionPath, {
      HOME: homeDir
    } as NodeJS.ProcessEnv);

    expect(paths.bundleEntrypointPath).toBe(
      path.join(extensionPath, 'dist', 'managed-cli', 'cli', 'index.mjs')
    );
    expect(paths.installRoot).toBe(path.join(homeDir, '.diffmint', 'managed-cli', '2.0.0'));
    expect(paths.installEntrypointPath).toBe(
      path.join(homeDir, '.diffmint', 'managed-cli', '2.0.0', 'cli', 'index.mjs')
    );
  });

  it('installs the bundled cli into the diffmint home directory', async () => {
    const extensionPath = makeTempDir();
    const homeDir = makeTempDir();
    createBundledCliFixture(extensionPath, '3.1.4');

    const command = await ensureManagedCliInstalled({
      extensionPath,
      env: {
        HOME: homeDir
      } as NodeJS.ProcessEnv,
      nodeExecutablePath: '/mock/node'
    });

    const paths = await resolveManagedCliInstallPaths(extensionPath, {
      HOME: homeDir
    } as NodeJS.ProcessEnv);

    expect(command).toEqual({
      executable: '/mock/node',
      prefixArgs: [paths.installEntrypointPath],
      displayPath: paths.installEntrypointPath,
      source: 'managed'
    });
    expect(isManagedCliInstalled(paths)).toBe(true);
    expect(readFileSync(paths.installPackageJsonPath, 'utf8')).toContain('"version": "3.1.4"');
    expect(readFileSync(paths.installEntrypointPath, 'utf8')).toContain('console.log("diffmint")');
  });

  it('fails with a clear message when the bundled cli metadata is missing', async () => {
    const extensionPath = makeTempDir();

    await expect(readBundledCliVersion(extensionPath)).rejects.toThrow(
      'Bundled Diffmint CLI metadata is missing'
    );
  });
});
